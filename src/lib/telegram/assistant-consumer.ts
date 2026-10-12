import { randomUUID } from 'node:crypto';
import { getMainPrisma } from '@/lib/core/prisma';
import { getAssistantWorkerClient } from '@/lib/bot/durable/worker-client';
import {
    AssistantWorkerProtocolError,
    type AssistantSubmissionEnvelope,
    type DurableSubmissionSnapshot,
} from '@/lib/bot/durable/protocol';
import {
    auditTelegramAssistant,
    TelegramAssistantLinkError,
    TelegramAssistantLinkService,
} from '@/services/telegram/assistant-link-service';
import {
    formatTelegramPlainText,
    TelegramAssistantClient,
    type TelegramInlineKeyboard,
} from './assistant-client';
import type { TelegramAssistantConfig } from './assistant-config';

const WORKER_TIMEOUT_MS = 125_000;
const LEASE_MS = WORKER_TIMEOUT_MS + 30_000;
const RETRY_MS = 5_000;
const MAX_RETRY_AFTER_MS = 60_000;
const PLACEHOLDER = 'Asisten Polyflow sedang memeriksa data…';
const AUTHORITY_CHANGED =
    'Akses workspace untuk pertanyaan ini sudah berubah atau dicabut. Kirim pertanyaan baru setelah memilih workspace dengan /tenant.';

type PersistedTelegramAuthority = {
    linkId: string;
    globalAccountId: string;
    membershipId: string;
    tenantId: string;
    tenantUserId: string;
    selectionVersion: number;
    globalRevocationVersion: number;
    membershipVersion: number;
    centralAuthVersion: number;
};

export type TelegramAssistantConsumerDependencies = {
    config: TelegramAssistantConfig;
    telegram?: TelegramAssistantClient;
    worker?: ReturnType<typeof getAssistantWorkerClient>;
    links?: TelegramAssistantLinkService;
    now?: () => Date;
    shouldClaim?: () => boolean;
};

export async function consumeTelegramAssistantBatch(
    dependencies: TelegramAssistantConsumerDependencies,
    limit = 5,
): Promise<number> {
    const main = getMainPrisma();
    const config = dependencies.config;
    if (config.TELEGRAM_ASSISTANT_KILL_SWITCH) return 0;
    const currentTime = dependencies.now ?? (() => new Date());
    const batchNow = currentTime();
    const candidates = await main.telegramUpdateLog.findMany({
        where: {
            botKey: config.TELEGRAM_ASSISTANT_BOT_KEY,
            availableAt: { lte: batchNow },
            OR: [
                {
                    status: { in: ['RESERVED', 'WAITING', 'FAILED'] },
                    OR: [
                        { leaseUntil: null },
                        { leaseUntil: { lt: batchNow } },
                    ],
                },
                { status: 'PROCESSING', leaseUntil: { lt: batchNow } },
            ],
        },
        orderBy: { createdAt: 'asc' },
        take: Math.max(1, Math.min(limit, 20)),
        select: { id: true },
    });
    let processed = 0;
    for (const candidate of candidates) {
        if (dependencies.shouldClaim && !dependencies.shouldClaim()) break;
        const claimNow = currentTime();
        const claimToken = randomUUID();
        const claimed = await main.telegramUpdateLog.updateMany({
            where: {
                id: candidate.id,
                availableAt: { lte: claimNow },
                OR: [
                    {
                        status: { in: ['RESERVED', 'WAITING', 'FAILED'] },
                        OR: [
                            { leaseUntil: null },
                            { leaseUntil: { lt: claimNow } },
                        ],
                    },
                    {
                        status: 'PROCESSING',
                        leaseUntil: { lt: claimNow },
                    },
                ],
            },
            data: {
                status: 'PROCESSING',
                claimToken,
                leaseUntil: new Date(claimNow.getTime() + LEASE_MS),
                attempts: { increment: 1 },
            },
        });
        if (claimed.count !== 1) continue;
        processed++;
        await processClaimed(candidate.id, claimToken, dependencies).catch(
            async (error) => {
                const failedAt = (dependencies.now ?? (() => new Date()))();
                const retryable =
                    !error ||
                    typeof error !== 'object' ||
                    !('retryable' in error) ||
                    error.retryable !== false;
                await main.telegramUpdateLog.updateMany({
                    where: { id: candidate.id, claimToken },
                    data: retryable
                        ? {
                              status: 'FAILED',
                              claimToken: null,
                              leaseUntil: null,
                              availableAt: new Date(
                                  failedAt.getTime() + retryDelayMs(error),
                              ),
                              lastErrorCode: safeErrorCode(error),
                          }
                        : {
                              status: 'IGNORED',
                              claimToken: null,
                              leaseUntil: null,
                              processedAt: failedAt,
                              lastErrorCode: safeErrorCode(error),
                          },
                });
            },
        );
    }
    return processed;
}

async function processClaimed(
    id: string,
    claimToken: string,
    dependencies: TelegramAssistantConsumerDependencies,
): Promise<void> {
    const main = getMainPrisma();
    const currentTime = dependencies.now ?? (() => new Date());
    const row = await main.telegramUpdateLog.findFirst({
        where: { id, claimToken, status: 'PROCESSING' },
    });
    if (!row) return;
    if (!row.telegramChatId || !row.telegramUserId) {
        await finish(id, claimToken, 'IGNORED', currentTime());
        return;
    }
    const telegram =
        dependencies.telegram ??
        new TelegramAssistantClient({
            token: dependencies.config.TELEGRAM_ASSISTANT_BOT_TOKEN,
        });
    const links = dependencies.links ?? new TelegramAssistantLinkService();

    if (!row.question) {
        await finish(id, claimToken, 'IGNORED', currentTime());
        return;
    }
    const commandResult = row.responseText
        ? {
              text: row.responseText,
              replyMarkup: readReplyMarkup(row.replyMarkup),
          }
        : await handleCommand({
              row: {
                  botKey: row.botKey,
                  telegramUserId: row.telegramUserId,
                  telegramChatId: row.telegramChatId,
                  callbackQueryId: row.callbackQueryId,
                  callbackMembershipId: row.callbackMembershipId,
                  callbackSelectionVersion: row.callbackSelectionVersion,
                  type: row.type,
                  question: row.question,
                  id,
                  requestId: row.requestId,
                  claimToken,
                  updateId: row.updateId,
              },
              links,
              telegram,
              config: dependencies.config,
              currentTime,
          });
    if (commandResult) {
        await renewLease(id, claimToken, currentTime());
        await ensureOwnedPlaceholder({
            id,
            claimToken,
            chatId: row.telegramChatId,
            text: commandResult.text,
            replyMarkup: commandResult.replyMarkup,
            existingMessageId: row.placeholderMessageId,
            telegram,
            currentTime,
        });
        await finish(id, claimToken, 'DONE', currentTime());
        return;
    }

    let authority;
    try {
        const persisted = persistedAuthority(row);
        authority = persisted
            ? await links.resolveSelectedAuthority({
                  botKey: row.botKey,
                  telegramUserId: row.telegramUserId,
                  telegramChatId: row.telegramChatId,
                  ...persisted,
              })
            : await links.resolveSelectedAuthority({
                  botKey: row.botKey,
                  telegramUserId: row.telegramUserId,
                  telegramChatId: row.telegramChatId,
              });
        if (!persisted) {
            const admitted = await main.telegramUpdateLog.updateMany({
                where: {
                    id,
                    claimToken,
                    authorityLinkId: null,
                    authorityGlobalAccountId: null,
                    authorityMembershipId: null,
                    authorityTenantId: null,
                    authorityTenantUserId: null,
                    authoritySelectionVersion: null,
                    authorityGlobalRevocationVersion: null,
                    authorityMembershipVersion: null,
                    authorityCentralAuthVersion: null,
                },
                data: authoritySnapshot(authority),
            });
            if (admitted.count !== 1) {
                throw new TelegramAssistantLinkError(
                    'AUTHORITY_REVOKED',
                    'Pertanyaan sudah terikat pada epoch lain.',
                );
            }
        }
    } catch (error) {
        if (!(error instanceof TelegramAssistantLinkError)) throw error;
        await ensureOwnedPlaceholder({
            id,
            claimToken,
            chatId: row.telegramChatId,
            text: persistedAuthority(row)
                ? AUTHORITY_CHANGED
                : telegramLinkErrorMessage(error),
            existingMessageId: row.placeholderMessageId,
            telegram,
            currentTime,
        });
        await finish(id, claimToken, 'DONE', currentTime());
        return;
    }

    await renewLease(id, claimToken, currentTime());
    const placeholderMessageId = await ensureOwnedPlaceholder({
        id,
        claimToken,
        chatId: row.telegramChatId,
        text: PLACEHOLDER,
        existingMessageId: row.placeholderMessageId,
        telegram,
        currentTime,
    });
    const envelope: AssistantSubmissionEnvelope = {
        protocolVersion: 1,
        requestId: row.requestId,
        publicConversationId:
            row.assistantConversationId ??
            authority.activeConversationId ??
            undefined,
        tenantId: authority.tenantId,
        userId: authority.tenantUserId,
        channel: 'telegram',
        telegramAuthority: {
            botKey: authority.botKey,
            telegramUserId: authority.telegramUserId,
            telegramChatId: authority.telegramChatId,
            linkId: authority.linkId,
            globalAccountId: authority.globalAccountId,
            membershipId: authority.membershipId,
            tenantId: authority.tenantId,
            tenantUserId: authority.tenantUserId,
            selectionVersion: authority.selectionVersion,
            globalRevocationVersion: authority.globalRevocationVersion,
            membershipVersion: authority.membershipVersion,
            centralAuthVersion: authority.centralAuthVersion,
        },
        question: row.question,
        workContext: { pathname: '/warehouse/inventory' },
    };
    const worker = dependencies.worker ?? getAssistantWorkerClient();
    try {
        await renewLease(id, claimToken, currentTime());
        let snapshot = row.assistantConversationId
            ? await worker.status(envelope)
            : await worker.submit(envelope);
        await renewLease(id, claimToken, currentTime());
        await auditTelegramAssistant({
            action: 'ASSISTANT_SUBMITTED',
            outcome: snapshot.status,
            botKey: row.botKey,
            telegramUserId: row.telegramUserId,
            globalAccountId: authority.globalAccountId,
            tenantId: authority.tenantId,
            membershipId: authority.membershipId,
            updateId: row.updateId,
        });
        if (snapshot.publicConversationId) {
            const bindNow = currentTime();
            await links.bindConversation({
                linkId: authority.linkId,
                selectionVersion: authority.selectionVersion,
                conversationId: snapshot.publicConversationId,
                updateLogId: id,
                claimToken,
                leaseUntil: new Date(bindNow.getTime() + LEASE_MS),
            });
            envelope.publicConversationId = snapshot.publicConversationId;
        }
        if (snapshot.status !== 'done') {
            await renewLease(id, claimToken, currentTime());
            snapshot = await worker.status(envelope);
            await renewLease(id, claimToken, currentTime());
        }
        await settleAssistantSnapshot({
            id,
            claimToken,
            row: {
                botKey: row.botKey,
                telegramUserId: row.telegramUserId,
                telegramChatId: row.telegramChatId,
            },
            snapshot,
            authority,
            telegram,
            placeholderMessageId,
            currentTime,
        });
    } catch (error) {
        if (!isAuthorityEpochError(error)) throw error;
        await renewLease(id, claimToken, currentTime());
        await assertClaimOwnership(id, claimToken);
        await telegram.editMessageText({
            chatId: row.telegramChatId,
            messageId: placeholderMessageId,
            text: AUTHORITY_CHANGED,
        });
        await renewLease(id, claimToken, currentTime());
        await auditTelegramAssistant({
            action: 'AUTHORITY_DENIED',
            outcome: safeErrorCode(error),
            botKey: row.botKey,
            telegramUserId: row.telegramUserId,
            globalAccountId: authority.globalAccountId,
            tenantId: authority.tenantId,
            membershipId: authority.membershipId,
            updateId: row.updateId,
        });
        await finish(id, claimToken, 'DONE', currentTime());
    }
}

function persistedAuthority(row: {
    authorityLinkId: string | null;
    authorityGlobalAccountId: string | null;
    authorityMembershipId: string | null;
    authorityTenantId: string | null;
    authorityTenantUserId: string | null;
    authoritySelectionVersion: number | null;
    authorityGlobalRevocationVersion: number | null;
    authorityMembershipVersion: number | null;
    authorityCentralAuthVersion: number | null;
}): PersistedTelegramAuthority | undefined {
    const values = [
        row.authorityLinkId,
        row.authorityGlobalAccountId,
        row.authorityMembershipId,
        row.authorityTenantId,
        row.authorityTenantUserId,
        row.authoritySelectionVersion,
        row.authorityGlobalRevocationVersion,
        row.authorityMembershipVersion,
        row.authorityCentralAuthVersion,
    ];
    if (values.every((value) => value === null)) return undefined;
    if (values.some((value) => value === null)) {
        throw new TelegramAssistantLinkError(
            'AUTHORITY_REVOKED',
            'Snapshot authority pertanyaan tidak lengkap.',
        );
    }
    return {
        linkId: row.authorityLinkId!,
        globalAccountId: row.authorityGlobalAccountId!,
        membershipId: row.authorityMembershipId!,
        tenantId: row.authorityTenantId!,
        tenantUserId: row.authorityTenantUserId!,
        selectionVersion: row.authoritySelectionVersion!,
        globalRevocationVersion: row.authorityGlobalRevocationVersion!,
        membershipVersion: row.authorityMembershipVersion!,
        centralAuthVersion: row.authorityCentralAuthVersion!,
    };
}

function authoritySnapshot(authority: PersistedTelegramAuthority) {
    return {
        authorityLinkId: authority.linkId,
        authorityGlobalAccountId: authority.globalAccountId,
        authorityMembershipId: authority.membershipId,
        authorityTenantId: authority.tenantId,
        authorityTenantUserId: authority.tenantUserId,
        authoritySelectionVersion: authority.selectionVersion,
        authorityGlobalRevocationVersion:
            authority.globalRevocationVersion,
        authorityMembershipVersion: authority.membershipVersion,
        authorityCentralAuthVersion: authority.centralAuthVersion,
    };
}

async function handleCommand(input: {
    row: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
        callbackQueryId: string | null;
        callbackMembershipId: string | null;
        callbackSelectionVersion: number | null;
        type: string | null;
        question: string;
        id: string;
        requestId: string;
        claimToken: string;
        updateId: string;
    };
    links: TelegramAssistantLinkService;
    telegram: TelegramAssistantClient;
    config: TelegramAssistantConfig;
    currentTime: () => Date;
}): Promise<
    | { text: string; replyMarkup?: TelegramInlineKeyboard }
    | undefined
> {
    const identity = {
        botKey: input.row.botKey,
        telegramUserId: input.row.telegramUserId,
        telegramChatId: input.row.telegramChatId,
    };
    try {
        if (input.row.type === 'callback') {
            if (
                !input.row.callbackMembershipId ||
                input.row.callbackSelectionVersion === null
            ) {
                throw new TelegramAssistantLinkError(
                    'CALLBACK_INVALID',
                    'Pilihan workspace tidak valid.',
                );
            }
            const selected = await input.links.selectTenantReference({
                ...identity,
                membershipId: input.row.callbackMembershipId,
                selectionVersion: input.row.callbackSelectionVersion,
                updateId: input.row.updateId,
                requestId: input.row.requestId,
                claimToken: input.row.claimToken,
            });
            if (input.row.callbackQueryId) {
                await input.telegram.answerCallbackQuery(
                    input.row.callbackQueryId,
                );
                await renewLease(
                    input.row.id,
                    input.row.claimToken,
                    input.currentTime(),
                );
            }
            return {
                text: selected.text,
                replyMarkup: readReplyMarkup(selected.replyMarkup),
            };
        }
        const [command, argument] = input.row.question.split(/\s+/, 2);
        if (command.toLowerCase() === '/start') {
            return {
                text: `Buat token tautan dari akun pusat Polyflow, lalu kirim /start <token>. Bot: @${input.config.TELEGRAM_ASSISTANT_BOT_USERNAME}`,
            };
        }
        if (command.toLowerCase() === '/start-digest') {
            if (!argument) {
                return {
                    text: 'Token tautan tidak valid, kedaluwarsa, atau sudah digunakan.',
                };
            }
            const linked: {
                text: string;
                replyMarkup?: TelegramInlineKeyboard;
            } = {
                text: 'Akun berhasil ditautkan. Pilih workspace aktif dengan /tenant.',
            };
            const consumed = await input.links.consumeLinkTokenDigest({
                ...identity,
                tokenDigest: argument,
                updateId: input.row.updateId,
                requestId: input.row.requestId,
                claimToken: input.row.claimToken,
                result: linked,
            });
            const result = consumed.result ?? linked;
            return {
                text: result.text,
                replyMarkup: readReplyMarkup(result.replyMarkup),
            };
        }
        if (command.toLowerCase() === '/tenant') {
            return tenantMenu(
                await input.links.listActiveWorkspaces(identity),
                input.links,
                input.config.TELEGRAM_ASSISTANT_SELECTION_HMAC_SECRET,
            );
        }
        if (command.toLowerCase() === '/help') {
            return {
                text: 'Perintah: /tenant untuk memilih workspace, /unlink untuk memutus tautan, /help untuk bantuan. Pertanyaan bisnis hanya read-only.',
            };
        }
        if (command.toLowerCase() === '/unlink') {
            const unlinked = await input.links.unlink({
                ...identity,
                requestId: input.row.requestId,
                claimToken: input.row.claimToken,
            });
            return typeof unlinked === 'object'
                ? { text: unlinked.text }
                : {
                      text: unlinked
                          ? 'Tautan akun Telegram sudah diputus.'
                          : 'Tidak ada tautan akun pusat yang aktif.',
                  };
        }
        return undefined;
    } catch (error) {
        if (!(error instanceof TelegramAssistantLinkError)) throw error;
        return { text: telegramLinkErrorMessage(error) };
    }
}

function tenantMenu(
    listed: Awaited<ReturnType<TelegramAssistantLinkService['listActiveWorkspaces']>>,
    links: TelegramAssistantLinkService,
    secret: string,
): { text: string; replyMarkup?: TelegramInlineKeyboard } {
    if (listed.workspaces.length === 0) {
        return {
            text: 'Tidak ada workspace aktif dengan pengguna lokal CENTRAL yang valid. Akun LOCAL dan superadmin tidak didukung V1.',
        };
    }
    return {
        text: 'Pilih workspace yang akan dipakai:',
        replyMarkup: {
            inline_keyboard: listed.workspaces.map((workspace) => [
                {
                    text: workspace.tenantName.slice(0, 50),
                    callback_data: links.createTenantCallback({
                        membershipId: workspace.membershipId,
                        selectionVersion: listed.selectionVersion,
                        secret,
                    }),
                },
            ]),
        },
    };
}

function telegramLinkErrorMessage(error: TelegramAssistantLinkError): string {
    switch (error.code) {
        case 'LINK_REQUIRED':
            return 'Telegram belum tertaut. Buat token dari sesi akun pusat Polyflow lalu kirim /start <token>.';
        case 'SELECTION_REQUIRED':
            return 'Pilih workspace aktif terlebih dahulu dengan /tenant.';
        case 'CALLBACK_INVALID':
            return 'Pilihan workspace tidak valid atau sudah kedaluwarsa. Jalankan /tenant lagi.';
        case 'AUTHORITY_REVOKED':
            return 'Akses workspace sudah berubah atau dicabut. Pilih ulang dengan /tenant.';
        case 'TOKEN_CONFLICT':
            return 'Akun Telegram atau akun pusat sudah ditautkan ke identitas lain.';
        case 'CENTRAL_REQUIRED':
            return 'Asisten Telegram V1 hanya mendukung akun pusat CENTRAL; akun LOCAL dan superadmin ditolak.';
        default:
            return 'Token tautan tidak valid, kedaluwarsa, atau sudah digunakan.';
    }
}

async function settleAssistantSnapshot(input: {
    id: string;
    claimToken: string;
    row: { botKey: string; telegramUserId: string; telegramChatId: string };
    snapshot: DurableSubmissionSnapshot;
    authority: {
        tenantName: string;
        tenantId: string;
        membershipId: string;
        globalAccountId: string;
    };
    telegram: TelegramAssistantClient;
    placeholderMessageId: string;
    currentTime: () => Date;
}): Promise<void> {
    if (
        input.snapshot.status === 'queued' ||
        input.snapshot.status === 'running'
    ) {
        await ownedUpdate(input.id, input.claimToken, {
            status: 'WAITING',
            claimToken: null,
            leaseUntil: null,
            availableAt: new Date(input.currentTime().getTime() + RETRY_MS),
        });
        return;
    }
    const text =
        input.snapshot.status === 'done' && input.snapshot.response
            ? formatTelegramPlainText(
                  input.snapshot.response.answer,
                  input.authority.tenantName,
              )
            : 'Maaf, Asisten Polyflow belum dapat menyelesaikan pertanyaan ini. Silakan coba lagi.';
    await renewLease(input.id, input.claimToken, input.currentTime());
    await assertClaimOwnership(input.id, input.claimToken);
    await input.telegram.editMessageText({
        chatId: input.row.telegramChatId,
        messageId: input.placeholderMessageId,
        text,
    });
    await renewLease(input.id, input.claimToken, input.currentTime());
    await auditTelegramAssistant({
        action: 'DELIVERY_SENT',
        outcome: input.snapshot.status,
        botKey: input.row.botKey,
        telegramUserId: input.row.telegramUserId,
        globalAccountId: input.authority.globalAccountId,
        tenantId: input.authority.tenantId,
        membershipId: input.authority.membershipId,
    });
    await finish(input.id, input.claimToken, 'DONE', input.currentTime());
}

async function ensureOwnedPlaceholder(input: {
    id: string;
    claimToken: string;
    chatId: string;
    text: string;
    replyMarkup?: TelegramInlineKeyboard | null;
    existingMessageId: string | null;
    telegram: TelegramAssistantClient;
    currentTime: () => Date;
}): Promise<string> {
    await assertClaimOwnership(input.id, input.claimToken);
    if (input.existingMessageId) {
        await input.telegram.editMessageText({
            chatId: input.chatId,
            messageId: input.existingMessageId,
            text: input.text,
            replyMarkup: input.replyMarkup ?? undefined,
        });
        await renewLease(input.id, input.claimToken, input.currentTime());
        return input.existingMessageId;
    }
    // Known unavoidable crash window: Telegram can accept sendMessage before
    // placeholderMessageId commits. A retry may send one extra placeholder,
    // but stable requestId still prevents duplicate assistant/tool execution.
    const sent = await input.telegram.sendMessage({
        chatId: input.chatId,
        text: input.text,
        replyMarkup: input.replyMarkup ?? undefined,
    });
    await renewLease(input.id, input.claimToken, input.currentTime());
    await ownedUpdate(input.id, input.claimToken, {
        placeholderMessageId: sent.messageId,
    });
    return sent.messageId;
}

async function assertClaimOwnership(
    id: string,
    claimToken: string,
): Promise<void> {
    const owned = await getMainPrisma().telegramUpdateLog.findFirst({
        where: { id, claimToken, status: 'PROCESSING' },
        select: { id: true },
    });
    if (!owned) throw claimLostError();
}

async function finish(
    id: string,
    claimToken: string,
    status: 'DONE' | 'IGNORED',
    now: Date,
): Promise<void> {
    await ownedUpdate(id, claimToken, {
        status,
        claimToken: null,
        leaseUntil: null,
        processedAt: now,
        lastErrorCode: null,
    });
}

async function renewLease(
    id: string,
    claimToken: string,
    now: Date,
): Promise<void> {
    await ownedUpdate(id, claimToken, {
        leaseUntil: new Date(now.getTime() + LEASE_MS),
    });
}

async function ownedUpdate(
    id: string,
    claimToken: string,
    data: Record<string, unknown>,
): Promise<void> {
    const updated = await getMainPrisma().telegramUpdateLog.updateMany({
        where: { id, claimToken },
        data,
    });
    if (updated.count !== 1) throw claimLostError();
}

function claimLostError(): Error & { retryable: false } {
    return Object.assign(new Error('TELEGRAM_ASSISTANT_CLAIM_LOST'), {
        retryable: false as const,
    });
}

function readReplyMarkup(value: unknown): TelegramInlineKeyboard | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const keyboard = (value as { inline_keyboard?: unknown }).inline_keyboard;
    return Array.isArray(keyboard)
        ? (value as TelegramInlineKeyboard)
        : undefined;
}

function retryDelayMs(error: unknown): number {
    if (
        error &&
        typeof error === 'object' &&
        'retryAfterMs' in error &&
        typeof error.retryAfterMs === 'number' &&
        Number.isFinite(error.retryAfterMs)
    ) {
        return Math.max(0, Math.min(error.retryAfterMs, MAX_RETRY_AFTER_MS));
    }
    return RETRY_MS;
}

function isAuthorityEpochError(error: unknown): boolean {
    return (
        error instanceof TelegramAssistantLinkError ||
        (error instanceof AssistantWorkerProtocolError &&
            (error.code === 'PERMISSION_DENIED' ||
                error.code === 'CONTEXT_MISMATCH' ||
                error.code === 'NOT_FOUND'))
    );
}

function safeErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
        return String(error.code).slice(0, 80);
    }
    if (error instanceof Error) return error.message.slice(0, 80);
    return 'UNKNOWN';
}
