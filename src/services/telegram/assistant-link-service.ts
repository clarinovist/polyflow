import {
    createHash,
    createHmac,
    randomBytes,
    timingSafeEqual,
} from 'node:crypto';
import type {
    Prisma,
    PrismaClient,
    TelegramAssistantAuditAction,
} from '@prisma/client';
import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import { AssistantWorkerProtocolError } from '@/lib/bot/durable/protocol';
import { ValidationError } from '@/lib/errors/errors';

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
const CALLBACK_PREFIX = 't1';
const MAX_CALLBACK_BYTES = 64;

export type TelegramAssistantWorkspace = {
    membershipId: string;
    tenantId: string;
    tenantUserId: string;
    tenantName: string;
};

export type TelegramAssistantAuthority = TelegramAssistantWorkspace & {
    linkId: string;
    botKey: string;
    telegramUserId: string;
    telegramChatId: string;
    globalAccountId: string;
    selectionVersion: number;
    globalRevocationVersion: number;
    membershipVersion: number;
    centralAuthVersion: number;
    activeConversationId: string | null;
};

export type TelegramCommandResult = {
    text: string;
    replyMarkup?: Prisma.InputJsonObject;
};

type MainDb = ReturnType<typeof getMainPrisma>;
type CommandDb = Pick<
    MainDb,
    'telegramUpdateLog'
>;

async function readCommandResult(
    db: CommandDb,
    requestId: string,
): Promise<TelegramCommandResult | undefined> {
    const row = await db.telegramUpdateLog.findUnique({
        where: { requestId },
        select: { responseText: true, replyMarkup: true },
    });
    if (!row?.responseText) return undefined;
    return {
        text: row.responseText,
        ...(row.replyMarkup &&
        typeof row.replyMarkup === 'object' &&
        !Array.isArray(row.replyMarkup)
            ? { replyMarkup: row.replyMarkup as Prisma.InputJsonObject }
            : {}),
    };
}

async function writeCommandResult(
    db: CommandDb,
    requestId: string,
    claimToken: string,
    result: TelegramCommandResult,
): Promise<void> {
    const saved = await db.telegramUpdateLog.updateMany({
        where: { requestId, claimToken, responseText: null },
        data: {
            responseText: result.text.slice(0, 4096),
            replyMarkup: result.replyMarkup,
        },
    });
    if (saved.count !== 1) {
        throw Object.assign(new Error('TELEGRAM_ASSISTANT_CLAIM_LOST'), {
            retryable: false,
        });
    }
}

export class TelegramAssistantLinkError extends Error {
    constructor(
        readonly code:
            | 'CENTRAL_REQUIRED'
            | 'TOKEN_INVALID'
            | 'TOKEN_EXPIRED'
            | 'TOKEN_CONFLICT'
            | 'LINK_REQUIRED'
            | 'SELECTION_REQUIRED'
            | 'CALLBACK_INVALID'
            | 'AUTHORITY_REVOKED',
        message: string,
    ) {
        super(message);
        this.name = 'TelegramAssistantLinkError';
    }
}

function digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
}

function hmac(secret: string, payload: string): string {
    return createHmac('sha256', secret)
        .update(payload)
        .digest('base64url')
        .slice(0, 16);
}

function requireCallbackSecret(secret: string): void {
    if (secret.length < 32) {
        throw new ValidationError(
            'TELEGRAM_ASSISTANT_SELECTION_HMAC_SECRET must be at least 32 characters',
        );
    }
}

export function parseTelegramTenantCallback(input: {
    callbackData: string;
    secret: string;
}): { membershipId: string; selectionVersion: number } | undefined {
    requireCallbackSecret(input.secret);
    const parts = input.callbackData.split('.');
    if (parts.length !== 4 || parts[0] !== CALLBACK_PREFIX) return undefined;
    const [prefix, membershipId, rawVersion, signature] = parts;
    const selectionVersion = Number(rawVersion);
    const payload = `${prefix}.${membershipId}.${rawVersion}`;
    if (
        !membershipId ||
        !Number.isSafeInteger(selectionVersion) ||
        selectionVersion < 0 ||
        !safeEqual(signature, hmac(input.secret, payload))
    ) {
        return undefined;
    }
    return { membershipId, selectionVersion };
}

function asJson(value: Record<string, unknown>): Prisma.InputJsonObject {
    return value as Prisma.InputJsonObject;
}

export async function auditTelegramAssistant(
    input: {
        action: TelegramAssistantAuditAction;
        outcome: string;
        botKey?: string;
        telegramUserId?: string;
        globalAccountId?: string;
        tenantId?: string;
        membershipId?: string;
        updateId?: string;
        details?: Record<string, string | number | boolean | null>;
    },
    main: MainDb = getMainPrisma(),
): Promise<void> {
    await main.telegramAssistantAuditLog.create({
        data: {
            action: input.action,
            outcome: input.outcome.slice(0, 80),
            botKey: input.botKey,
            telegramUserIdHash: input.telegramUserId
                ? digest(input.telegramUserId).slice(0, 32)
                : undefined,
            globalAccountId: input.globalAccountId,
            tenantId: input.tenantId,
            membershipId: input.membershipId,
            updateIdHash: input.updateId
                ? digest(input.updateId).slice(0, 32)
                : undefined,
            details: input.details ? asJson(input.details) : undefined,
        },
    });
}

export class TelegramAssistantLinkService {
    constructor(
        private readonly main: MainDb = getMainPrisma(),
        private readonly loadTenantDb: (
            dbUrl: string,
        ) => Pick<PrismaClient, 'user'> = getTenantDb,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async createLinkToken(input: {
        globalAccountId?: string;
        isSuperAdmin?: boolean;
    }): Promise<{ token: string; expiresAt: Date }> {
        if (!input.globalAccountId || input.isSuperAdmin) {
            throw new TelegramAssistantLinkError(
                'CENTRAL_REQUIRED',
                'Asisten Telegram V1 hanya tersedia untuk akun pusat.',
            );
        }
        const account = await this.main.globalAccount.findFirst({
            where: { id: input.globalAccountId, status: 'ACTIVE' },
            select: { id: true },
        });
        if (!account) {
            throw new TelegramAssistantLinkError(
                'CENTRAL_REQUIRED',
                'Akun pusat tidak aktif.',
            );
        }

        const hasValidCentralActor = await this.hasAnyValidCentralActor(
            account.id,
        );
        if (!hasValidCentralActor) {
            throw new TelegramAssistantLinkError(
                'CENTRAL_REQUIRED',
                'Tidak ada workspace CENTRAL aktif yang valid.',
            );
        }

        const rawToken = randomBytes(24).toString('base64url');
        const tokenDigest = digest(rawToken);
        const expiresAt = new Date(this.now().getTime() + LINK_TOKEN_TTL_MS);
        await this.main.$transaction(async (tx) => {
            await tx.telegramAssistantLinkToken.updateMany({
                where: {
                    globalAccountId: account.id,
                    status: 'PENDING',
                },
                data: { status: 'REVOKED', revokedAt: this.now() },
            });
            await tx.telegramAssistantLinkToken.create({
                data: {
                    tokenDigest,
                    globalAccountId: account.id,
                    expiresAt,
                },
            });
            await auditTelegramAssistant(
                {
                    action: 'LINK_TOKEN_CREATED',
                    outcome: 'SUCCESS',
                    globalAccountId: account.id,
                },
                tx as MainDb,
            );
        });
        return { token: rawToken, expiresAt };
    }

    async consumeLinkToken(input: {
        token: string;
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
    }): Promise<{ globalAccountId: string; selectionVersion: number }> {
        const consumed = await this.consumeLinkTokenDigest({
            ...input,
            tokenDigest: digest(input.token),
        });
        return {
            globalAccountId: consumed.globalAccountId!,
            selectionVersion: consumed.selectionVersion!,
        };
    }

    /** Consume a digest passed through durable ingress. This permits webhook
     * reservation without ever persisting the raw /start link token. */
    async consumeLinkTokenDigest(input: {
        tokenDigest: string;
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
        updateId?: string;
        requestId?: string;
        claimToken?: string;
        result?: TelegramCommandResult;
    }): Promise<{
        globalAccountId?: string;
        selectionVersion?: number;
        result?: TelegramCommandResult;
    }> {
        const rejectToken = (
            code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED' | 'TOKEN_CONFLICT',
            message: string,
        ): never => {
            throw new TelegramAssistantLinkError(code, message);
        };
        if (!/^[a-f0-9]{64}$/.test(input.tokenDigest)) {
            await this.auditLinkTokenRejection(input, 'TOKEN_INVALID');
            return rejectToken('TOKEN_INVALID', 'Token tautan tidak valid.');
        }
        const tokenDigest = input.tokenDigest;
        const now = this.now();
        try {
            return await this.main.$transaction(
            async (tx) => {
                if (input.requestId) {
                    const existing = await readCommandResult(tx, input.requestId);
                    if (existing) return { result: existing };
                }
                const token = await tx.telegramAssistantLinkToken.findUnique({
                    where: { tokenDigest },
                    include: { globalAccount: { select: { status: true } } },
                });
                if (!token || token.status !== 'PENDING') {
                    return rejectToken(
                        'TOKEN_INVALID',
                        'Token tautan tidak valid atau sudah digunakan.',
                    );
                }
                if (
                    token.expiresAt <= now ||
                    token.globalAccount.status !== 'ACTIVE'
                ) {
                    // Expiry/status is re-evaluated on every retry; throwing
                    // keeps the rejected mutation and its audit atomic.
                    return rejectToken(
                        'TOKEN_EXPIRED',
                        'Token tautan sudah kedaluwarsa.',
                    );
                }

                const conflicts = await Promise.all([
                    tx.telegramAssistantLink.findUnique({
                        where: {
                            botKey_telegramUserId: {
                                botKey: input.botKey,
                                telegramUserId: input.telegramUserId,
                            },
                        },
                    }),
                    tx.telegramAssistantLink.findUnique({
                        where: { globalAccountId: token.globalAccountId },
                    }),
                ]);
                const ownershipConflict = conflicts.some(
                    (link) =>
                        link &&
                        (link.globalAccountId !== token.globalAccountId ||
                            link.telegramUserId !== input.telegramUserId ||
                            link.botKey !== input.botKey),
                );
                if (ownershipConflict) {
                    return rejectToken(
                        'TOKEN_CONFLICT',
                        'Akun Telegram atau akun pusat sudah ditautkan ke identitas lain.',
                    );
                }

                const consumed = await tx.telegramAssistantLinkToken.updateMany({
                    where: {
                        id: token.id,
                        status: 'PENDING',
                        expiresAt: { gt: now },
                    },
                    data: { status: 'CONSUMED', usedAt: now },
                });
                if (consumed.count !== 1) {
                    return rejectToken(
                        'TOKEN_INVALID',
                        'Token tautan sudah digunakan.',
                    );
                }
                const link = conflicts.find(Boolean)
                    ? await tx.telegramAssistantLink.update({
                          where: { globalAccountId: token.globalAccountId },
                          data: {
                              telegramChatId: input.telegramChatId,
                              status: 'ACTIVE',
                              revokedAt: null,
                              lastActiveAt: now,
                              selectionVersion: { increment: 1 },
                              selectedTenantId: null,
                              selectedMembershipId: null,
                              selectedTenantUserId: null,
                              activeConversationId: null,
                          },
                      })
                    : await tx.telegramAssistantLink.create({
                          data: {
                              botKey: input.botKey,
                              telegramUserId: input.telegramUserId,
                              telegramChatId: input.telegramChatId,
                              globalAccountId: token.globalAccountId,
                              lastActiveAt: now,
                          },
                      });
                await auditTelegramAssistant(
                    {
                        action: 'LINK_TOKEN_CONSUMED',
                        outcome: 'SUCCESS',
                        botKey: input.botKey,
                        telegramUserId: input.telegramUserId,
                        globalAccountId: token.globalAccountId,
                    },
                    tx as MainDb,
                );
                if (input.requestId && input.claimToken && input.result) {
                    await writeCommandResult(
                        tx,
                        input.requestId,
                        input.claimToken,
                        input.result,
                    );
                }
                return input.result
                    ? { result: input.result }
                    : {
                          globalAccountId: token.globalAccountId,
                          selectionVersion: link.selectionVersion,
                      };
            },
                { isolationLevel: 'Serializable' },
            );
        } catch (error) {
            if (
                error instanceof TelegramAssistantLinkError &&
                (error.code === 'TOKEN_INVALID' ||
                    error.code === 'TOKEN_EXPIRED' ||
                    error.code === 'TOKEN_CONFLICT')
            ) {
                await this.auditLinkTokenRejection(input, error.code);
            }
            throw error;
        }
    }

    async hasActiveLink(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
    }): Promise<boolean> {
        try {
            await this.requireActiveLink(input);
            return true;
        } catch (error) {
            if (
                error instanceof TelegramAssistantLinkError &&
                error.code === 'LINK_REQUIRED'
            ) {
                return false;
            }
            throw error;
        }
    }

    async listActiveWorkspaces(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
    }): Promise<{
        selectionVersion: number;
        workspaces: TelegramAssistantWorkspace[];
    }> {
        const link = await this.requireActiveLink(input);
        const memberships = await this.main.tenantMembership.findMany({
            where: {
                globalAccountId: link.globalAccountId,
                status: 'ACTIVE',
                tenant: { status: 'ACTIVE' },
            },
            include: {
                tenant: { select: { id: true, name: true, dbUrl: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        const checked = await Promise.all(
            memberships.map(async (membership) => {
                const actor = await this.loadTenantDb(
                    membership.tenant.dbUrl,
                ).user.findUnique({
                    where: { id: membership.tenantUserId },
                    select: {
                        isActive: true,
                        isSuperAdmin: true,
                        authMode: true,
                        centralAccountId: true,
                    },
                });
                if (
                    !actor?.isActive ||
                    actor.isSuperAdmin ||
                    actor.authMode !== 'CENTRAL' ||
                    actor.centralAccountId !== link.globalAccountId
                ) {
                    return null;
                }
                return {
                    membershipId: membership.id,
                    tenantId: membership.tenantId,
                    tenantUserId: membership.tenantUserId,
                    tenantName: membership.tenant.name,
                };
            }),
        );
        const workspaces = checked.filter(
            (item): item is TelegramAssistantWorkspace => !!item,
        );
        await auditTelegramAssistant(
            {
                action: 'WORKSPACES_LISTED',
                outcome: 'SUCCESS',
                botKey: link.botKey,
                telegramUserId: link.telegramUserId,
                globalAccountId: link.globalAccountId,
                details: { count: workspaces.length },
            },
            this.main,
        );
        return { selectionVersion: link.selectionVersion, workspaces };
    }

    createTenantCallback(input: {
        membershipId: string;
        selectionVersion: number;
        secret: string;
    }): string {
        requireCallbackSecret(input.secret);
        const payload = `${CALLBACK_PREFIX}.${input.membershipId}.${input.selectionVersion}`;
        const callback = `${payload}.${hmac(input.secret, payload)}`;
        if (Buffer.byteLength(callback) > MAX_CALLBACK_BYTES) {
            throw new TelegramAssistantLinkError(
                'CALLBACK_INVALID',
                'Referensi workspace terlalu panjang.',
            );
        }
        return callback;
    }

    async selectTenant(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
        callbackData: string;
        secret: string;
        updateId?: string;
        requestId: string;
        claimToken: string;
    }): Promise<TelegramCommandResult>;
    async selectTenant(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
        callbackData: string;
        secret: string;
        updateId?: string;
        requestId?: undefined;
        claimToken?: undefined;
    }): Promise<TelegramAssistantAuthority>;
    async selectTenant(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
        callbackData: string;
        secret: string;
        updateId?: string;
        requestId?: string;
        claimToken?: string;
    }): Promise<TelegramAssistantAuthority | TelegramCommandResult> {
        requireCallbackSecret(input.secret);
        if (input.requestId) {
            const existing = await readCommandResult(this.main, input.requestId);
            if (existing) return existing;
        }
        const parsedCallback = parseTelegramTenantCallback(input);
        if (!parsedCallback) {
            await this.auditTenantSelectionRejection(input);
            throw new TelegramAssistantLinkError(
                'CALLBACK_INVALID',
                'Pilihan workspace tidak valid.',
            );
        }
        const reference = {
            botKey: input.botKey,
            telegramUserId: input.telegramUserId,
            telegramChatId: input.telegramChatId,
            membershipId: parsedCallback.membershipId,
            selectionVersion: parsedCallback.selectionVersion,
            updateId: input.updateId,
        };
        return input.requestId && input.claimToken
            ? this.selectTenantReference({
                  ...reference,
                  requestId: input.requestId,
                  claimToken: input.claimToken,
              })
            : this.selectTenantReference(reference);
    }

    async selectTenantReference(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
        membershipId: string;
        selectionVersion: number;
        updateId?: string;
        requestId: string;
        claimToken: string;
    }): Promise<TelegramCommandResult>;
    async selectTenantReference(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
        membershipId: string;
        selectionVersion: number;
        updateId?: string;
        requestId?: undefined;
        claimToken?: undefined;
    }): Promise<TelegramAssistantAuthority>;
    async selectTenantReference(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
        membershipId: string;
        selectionVersion: number;
        updateId?: string;
        requestId?: string;
        claimToken?: string;
    }): Promise<TelegramAssistantAuthority | TelegramCommandResult> {
        if (input.requestId) {
            const existing = await readCommandResult(this.main, input.requestId);
            if (existing) return existing;
        }
        const reject = async (message: string): Promise<never> => {
            await this.auditTenantSelectionRejection(input);
            throw new TelegramAssistantLinkError('CALLBACK_INVALID', message);
        };
        const { membershipId, selectionVersion: version } = input;
        const listed = await this.listActiveWorkspaces(input);
        const workspace = listed.workspaces.find(
            (item) => item.membershipId === membershipId,
        );
        if (!workspace || listed.selectionVersion !== version) {
            return reject(
                'Pilihan workspace sudah kedaluwarsa atau bukan milik akun ini.',
            );
        }
        const commandResult = {
            text: `Workspace aktif: ${workspace.tenantName}. Silakan kirim pertanyaan read-only Anda.`,
        };
        const updated = await this.main.$transaction(async (tx) => {
            if (input.requestId) {
                const existing = await readCommandResult(tx, input.requestId);
                if (existing) return { count: 1, result: existing };
            }
            const globalAccountId = (
                await tx.telegramAssistantLink.findUniqueOrThrow({
                    where: {
                        botKey_telegramUserId: {
                            botKey: input.botKey,
                            telegramUserId: input.telegramUserId,
                        },
                    },
                    select: { globalAccountId: true },
                })
            ).globalAccountId;
            const mutation = await tx.telegramAssistantLink.updateMany({
                where: {
                    botKey: input.botKey,
                    telegramUserId: input.telegramUserId,
                    telegramChatId: input.telegramChatId,
                    status: 'ACTIVE',
                    globalAccountId,
                    selectionVersion: version,
                },
                data: {
                    selectedTenantId: workspace.tenantId,
                    selectedMembershipId: workspace.membershipId,
                    selectedTenantUserId: workspace.tenantUserId,
                    activeConversationId: null,
                    selectionVersion: { increment: 1 },
                    lastActiveAt: this.now(),
                },
            });
            if (mutation.count !== 1) return { count: 0 };
            await auditTelegramAssistant(
                {
                    action: 'TENANT_SELECTED',
                    outcome: 'SUCCESS',
                    botKey: input.botKey,
                    telegramUserId: input.telegramUserId,
                    globalAccountId,
                    tenantId: workspace.tenantId,
                    membershipId: workspace.membershipId,
                    updateId: input.updateId,
                },
                tx as MainDb,
            );
            if (input.requestId && input.claimToken) {
                await writeCommandResult(
                    tx,
                    input.requestId,
                    input.claimToken,
                    commandResult,
                );
            }
            return { count: 1, result: commandResult };
        });
        if (updated.count !== 1) {
            return reject('Pilihan workspace sudah kedaluwarsa.');
        }
        if (input.requestId && updated.result) return updated.result;
        return this.resolveSelectedAuthority({
            botKey: input.botKey,
            telegramUserId: input.telegramUserId,
            telegramChatId: input.telegramChatId,
        });
    }

    async resolveSelectedAuthority(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
        linkId?: string;
        globalAccountId?: string;
        membershipId?: string;
        tenantId?: string;
        tenantUserId?: string;
        selectionVersion?: number;
        globalRevocationVersion?: number;
        membershipVersion?: number;
        centralAuthVersion?: number;
    }): Promise<TelegramAssistantAuthority> {
        const link = await this.requireActiveLink(input);
        if (
            !link.selectedTenantId ||
            !link.selectedMembershipId ||
            !link.selectedTenantUserId
        ) {
            throw new TelegramAssistantLinkError(
                'SELECTION_REQUIRED',
                'Pilih workspace terlebih dahulu dengan /tenant.',
            );
        }
        if (
            (input.linkId && input.linkId !== link.id) ||
            (input.globalAccountId &&
                input.globalAccountId !== link.globalAccountId) ||
            (input.membershipId &&
                input.membershipId !== link.selectedMembershipId) ||
            (input.tenantId && input.tenantId !== link.selectedTenantId) ||
            (input.tenantUserId &&
                input.tenantUserId !== link.selectedTenantUserId) ||
            (input.selectionVersion !== undefined &&
                input.selectionVersion !== link.selectionVersion)
        ) {
            throw new TelegramAssistantLinkError(
                'AUTHORITY_REVOKED',
                'Konteks tenant tidak lagi berlaku.',
            );
        }
        const membership = await this.main.tenantMembership.findFirst({
            where: {
                id: link.selectedMembershipId,
                globalAccountId: link.globalAccountId,
                tenantId: link.selectedTenantId,
                tenantUserId: link.selectedTenantUserId,
                status: 'ACTIVE',
                tenant: { status: 'ACTIVE' },
            },
            include: {
                tenant: { select: { id: true, name: true, dbUrl: true } },
                globalAccount: {
                    select: { status: true, revocationVersion: true },
                },
            },
        });
        if (!membership || membership.globalAccount.status !== 'ACTIVE') {
            await this.clearInvalidSelection(link.id, link.selectionVersion);
            throw new TelegramAssistantLinkError(
                'AUTHORITY_REVOKED',
                'Akses workspace sudah tidak aktif.',
            );
        }
        const actor = await this.loadTenantDb(
            membership.tenant.dbUrl,
        ).user.findUnique({
            where: { id: membership.tenantUserId },
            select: {
                isActive: true,
                isSuperAdmin: true,
                authMode: true,
                centralAccountId: true,
                centralAuthVersion: true,
            },
        });
        if (
            !actor?.isActive ||
            actor.isSuperAdmin ||
            actor.authMode !== 'CENTRAL' ||
            actor.centralAccountId !== link.globalAccountId
        ) {
            await this.clearInvalidSelection(link.id, link.selectionVersion);
            throw new TelegramAssistantLinkError(
                'AUTHORITY_REVOKED',
                'Binding pengguna pusat sudah tidak berlaku.',
            );
        }
        if (
            (input.globalRevocationVersion !== undefined &&
                input.globalRevocationVersion !==
                    membership.globalAccount.revocationVersion) ||
            (input.membershipVersion !== undefined &&
                input.membershipVersion !== membership.membershipVersion) ||
            (input.centralAuthVersion !== undefined &&
                input.centralAuthVersion !== actor.centralAuthVersion)
        ) {
            throw new TelegramAssistantLinkError(
                'AUTHORITY_REVOKED',
                'Epoch otorisasi sudah berubah.',
            );
        }
        return {
            linkId: link.id,
            botKey: link.botKey,
            telegramUserId: link.telegramUserId,
            telegramChatId: link.telegramChatId,
            globalAccountId: link.globalAccountId,
            selectionVersion: link.selectionVersion,
            globalRevocationVersion:
                membership.globalAccount.revocationVersion,
            membershipVersion: membership.membershipVersion,
            centralAuthVersion: actor.centralAuthVersion,
            activeConversationId: link.activeConversationId,
            membershipId: membership.id,
            tenantId: membership.tenantId,
            tenantUserId: membership.tenantUserId,
            tenantName: membership.tenant.name,
        };
    }

    async bindConversation(input: {
        linkId: string;
        selectionVersion: number;
        conversationId: string;
        updateLogId: string;
        claimToken: string;
        leaseUntil: Date;
    }): Promise<void> {
        const updated = await this.main.$transaction(async (tx) => {
            const claimed = await tx.telegramUpdateLog.updateMany({
                where: {
                    id: input.updateLogId,
                    claimToken: input.claimToken,
                    status: 'PROCESSING',
                },
                data: {
                    assistantConversationId: input.conversationId,
                    leaseUntil: input.leaseUntil,
                },
            });
            if (claimed.count !== 1) return false;
            const linked = await tx.telegramAssistantLink.updateMany({
                where: {
                    id: input.linkId,
                    status: 'ACTIVE',
                    selectionVersion: input.selectionVersion,
                },
                data: { activeConversationId: input.conversationId },
            });
            if (linked.count !== 1) {
                throw new TelegramAssistantLinkError(
                    'AUTHORITY_REVOKED',
                    'Pilihan workspace berubah.',
                );
            }
            return true;
        });
        if (!updated) {
            throw Object.assign(
                new Error('TELEGRAM_ASSISTANT_CLAIM_LOST'),
                { retryable: false as const },
            );
        }
    }

    async unlink(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
        requestId?: string;
        claimToken?: string;
    }): Promise<boolean | TelegramCommandResult> {
        if (input.requestId) {
            const existing = await readCommandResult(this.main, input.requestId);
            if (existing) return existing;
        }
        const link = await this.main.telegramAssistantLink.findUnique({
            where: {
                botKey_telegramUserId: {
                    botKey: input.botKey,
                    telegramUserId: input.telegramUserId,
                },
            },
        });
        if (!link || link.telegramChatId !== input.telegramChatId) return false;
        const now = this.now();
        const result = { text: 'Tautan akun Telegram sudah diputus.' };
        await this.main.$transaction(async (tx) => {
            if (input.requestId) {
                const existing = await readCommandResult(tx, input.requestId);
                if (existing) return;
            }
            await tx.telegramAssistantLink.update({
                where: { id: link.id },
                data: {
                    status: 'REVOKED',
                    revokedAt: now,
                    selectedTenantId: null,
                    selectedMembershipId: null,
                    selectedTenantUserId: null,
                    activeConversationId: null,
                    selectionVersion: { increment: 1 },
                },
            });
            await tx.telegramAssistantLinkToken.updateMany({
                where: {
                    globalAccountId: link.globalAccountId,
                    status: 'PENDING',
                },
                data: { status: 'REVOKED', revokedAt: now },
            });
            await auditTelegramAssistant(
                {
                    action: 'LINK_REVOKED',
                    outcome: 'SUCCESS',
                    botKey: link.botKey,
                    telegramUserId: link.telegramUserId,
                    globalAccountId: link.globalAccountId,
                },
                tx as MainDb,
            );
            if (input.requestId && input.claimToken) {
                await writeCommandResult(
                    tx,
                    input.requestId,
                    input.claimToken,
                    result,
                );
            }
        });
        return input.requestId ? result : true;
    }

    private async auditTenantSelectionRejection(input: {
        botKey: string;
        telegramUserId: string;
        updateId?: string;
    }): Promise<void> {
        await auditTelegramAssistant(
            {
                action: 'TENANT_SELECTION_REJECTED',
                outcome: 'CALLBACK_INVALID',
                botKey: input.botKey,
                telegramUserId: input.telegramUserId,
                updateId: input.updateId,
                details: { errorCode: 'CALLBACK_INVALID' },
            },
            this.main,
        );
    }

    private async auditLinkTokenRejection(
        input: {
            botKey: string;
            telegramUserId: string;
            updateId?: string;
        },
        code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED' | 'TOKEN_CONFLICT',
    ): Promise<void> {
        await auditTelegramAssistant(
            {
                action: 'LINK_TOKEN_REJECTED',
                outcome: code,
                botKey: input.botKey,
                telegramUserId: input.telegramUserId,
                updateId: input.updateId,
                details: { errorCode: code },
            },
            this.main,
        );
    }

    private async hasAnyValidCentralActor(
        globalAccountId: string,
    ): Promise<boolean> {
        const memberships = await this.main.tenantMembership.findMany({
            where: {
                globalAccountId,
                status: 'ACTIVE',
                tenant: { status: 'ACTIVE' },
            },
            include: {
                tenant: { select: { dbUrl: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        for (const membership of memberships) {
            const actor = await this.loadTenantDb(
                membership.tenant.dbUrl,
            ).user.findUnique({
                where: { id: membership.tenantUserId },
                select: {
                    isActive: true,
                    isSuperAdmin: true,
                    authMode: true,
                    centralAccountId: true,
                },
            });
            if (
                actor?.isActive &&
                !actor.isSuperAdmin &&
                actor.authMode === 'CENTRAL' &&
                actor.centralAccountId === globalAccountId
            ) {
                return true;
            }
        }
        return false;
    }

    private async requireActiveLink(input: {
        botKey: string;
        telegramUserId: string;
        telegramChatId: string;
    }) {
        const link = await this.main.telegramAssistantLink.findUnique({
            where: {
                botKey_telegramUserId: {
                    botKey: input.botKey,
                    telegramUserId: input.telegramUserId,
                },
            },
            include: { globalAccount: { select: { status: true } } },
        });
        if (
            !link ||
            link.status !== 'ACTIVE' ||
            link.telegramChatId !== input.telegramChatId ||
            link.globalAccount.status !== 'ACTIVE'
        ) {
            throw new TelegramAssistantLinkError(
                'LINK_REQUIRED',
                'Telegram belum ditautkan ke akun pusat aktif.',
            );
        }
        return link;
    }

    private async clearInvalidSelection(
        linkId: string,
        selectionVersion: number,
    ): Promise<void> {
        await this.main.telegramAssistantLink.updateMany({
            where: { id: linkId, selectionVersion },
            data: {
                selectedTenantId: null,
                selectedMembershipId: null,
                selectedTenantUserId: null,
                activeConversationId: null,
                selectionVersion: { increment: 1 },
            },
        });
    }
}

export async function verifyTelegramWorkerAuthority(input: {
    botKey: string;
    telegramUserId: string;
    telegramChatId: string;
    linkId: string;
    globalAccountId: string;
    membershipId: string;
    tenantId: string;
    tenantUserId: string;
    selectionVersion: number;
    globalRevocationVersion: number;
    membershipVersion: number;
    centralAuthVersion: number;
}): Promise<TelegramAssistantAuthority> {
    try {
        return await new TelegramAssistantLinkService().resolveSelectedAuthority(
            input,
        );
    } catch (error) {
        if (error instanceof TelegramAssistantLinkError) {
            throw new AssistantWorkerProtocolError(
                'PERMISSION_DENIED',
                'Telegram assistant authority is no longer available.',
                403,
            );
        }
        throw error;
    }
}
