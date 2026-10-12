import { createHash, timingSafeEqual } from 'node:crypto';
import type { TelegramAssistantConfig } from './assistant-config';
import {
    auditTelegramAssistant,
    parseTelegramTenantCallback,
} from '@/services/telegram/assistant-link-service';
import {
    parseTelegramAssistantUpdate,
    type TelegramAssistantIngress,
} from './assistant-update';
import { getMainPrisma } from '@/lib/core/prisma';
import { rateLimit } from '@/lib/api/rate-limit';

const MAX_BODY_BYTES = 16 * 1024;

export type WebhookResult =
    | { status: 200; body: { ok: true; duplicate?: true; ignored?: true } }
    | { status: 400 | 401 | 413 | 429; body: { ok: false } };

function safeSecretMatches(actual: string | null, expected: string): boolean {
    if (!actual) return false;
    const left = Buffer.from(actual);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
}

export async function handleTelegramAssistantWebhook(
    request: Request,
    config: TelegramAssistantConfig,
): Promise<WebhookResult> {
    const actualSecret = request.headers.get('x-telegram-bot-api-secret-token');
    if (!safeSecretMatches(actualSecret, config.TELEGRAM_ASSISTANT_WEBHOOK_SECRET)) {
        await auditTelegramAssistant({
            action: 'WEBHOOK_REJECTED',
            outcome: 'BAD_SECRET',
            botKey: config.TELEGRAM_ASSISTANT_BOT_KEY,
        }).catch(() => undefined);
        return { status: 401, body: { ok: false } };
    }
    if (config.TELEGRAM_ASSISTANT_KILL_SWITCH) {
        await auditTelegramAssistant({
            action: 'KILL_SWITCH_ACK',
            outcome: 'ACK_ONLY',
            botKey: config.TELEGRAM_ASSISTANT_BOT_KEY,
        }).catch(() => undefined);
        return { status: 200, body: { ok: true, ignored: true } };
    }
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
        return { status: 413, body: { ok: false } };
    }
    const body = await readBoundedJson(request, MAX_BODY_BYTES);
    if (body === 'TOO_LARGE') return { status: 413, body: { ok: false } };
    if (body === undefined) return { status: 400, body: { ok: false } };
    const parsed = parseTelegramAssistantUpdate(body);
    if (!parsed.ok) {
        await auditTelegramAssistant({
            action: 'WEBHOOK_REJECTED',
            outcome: parsed.reason,
            botKey: config.TELEGRAM_ASSISTANT_BOT_KEY,
        }).catch(() => undefined);
        return { status: 400, body: { ok: false } };
    }

    // Primary limiter follows the Telegram identity. IP limiting already runs in
    // proxy.ts and remains only a secondary perimeter signal.
    if (
        !rateLimit(
            `telegram-assistant:${config.TELEGRAM_ASSISTANT_BOT_KEY}:${parsed.update.telegramUserId}`,
            30,
            60_000,
        ).success
    ) {
        return { status: 429, body: { ok: false } };
    }
    const callback = parsed.update.callbackData
        ? parseTelegramTenantCallback({
              callbackData: parsed.update.callbackData,
              secret: config.TELEGRAM_ASSISTANT_SELECTION_HMAC_SECRET,
          })
        : undefined;
    if (parsed.update.callbackData && !callback) {
            await auditTelegramAssistant({
                action: 'TENANT_SELECTION_REJECTED',
                outcome: 'CALLBACK_INVALID',
                botKey: config.TELEGRAM_ASSISTANT_BOT_KEY,
                telegramUserId: parsed.update.telegramUserId,
                updateId: parsed.update.updateId,
                details: { errorCode: 'CALLBACK_INVALID' },
        }).catch(() => undefined);
        return { status: 200, body: { ok: true, ignored: true } };
    }
    const reserved = await reserveTelegramUpdate(parsed.update, config, callback);
    if (!reserved) {
        await auditTelegramAssistant({
            action: 'WEBHOOK_DUPLICATE',
            outcome: 'RESUME_EXISTING',
            botKey: config.TELEGRAM_ASSISTANT_BOT_KEY,
            telegramUserId: parsed.update.telegramUserId,
            updateId: parsed.update.updateId,
        }).catch(() => undefined);
        return { status: 200, body: { ok: true, duplicate: true } };
    }
    return { status: 200, body: { ok: true } };
}

async function reserveTelegramUpdate(
    update: TelegramAssistantIngress,
    config: TelegramAssistantConfig,
    callback?: { membershipId: string; selectionVersion: number },
): Promise<boolean> {
    try {
        const normalizedQuestion = persistedQuestion(update);
        await getMainPrisma().telegramUpdateLog.create({
            data: {
                botKey: config.TELEGRAM_ASSISTANT_BOT_KEY,
                updateId: update.updateId,
                type: update.type,
                telegramUserId: update.telegramUserId,
                telegramChatId: update.telegramChatId,
                callbackQueryId: update.callbackQueryId,
                callbackMembershipId: callback?.membershipId,
                callbackSelectionVersion: callback?.selectionVersion,
                sourceMessageId: update.sourceMessageId,
                // Only bounded normalized commands/questions are persisted.
                // /start stores a digest and callbacks store membership/version,
                // never the raw token or signed callback payload.
                question: normalizedQuestion,
                status: 'RESERVED',
            },
        });
        await auditTelegramAssistant({
            action: 'WEBHOOK_RESERVED',
            outcome: update.type.toUpperCase(),
            botKey: config.TELEGRAM_ASSISTANT_BOT_KEY,
            telegramUserId: update.telegramUserId,
            updateId: update.updateId,
        });
        return true;
    } catch (error) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P2002'
        ) {
            return false;
        }
        throw error;
    }
}

function persistedQuestion(update: TelegramAssistantIngress): string | undefined {
    // Callback signatures are verified at ingress and only their bounded
    // membership/version claims are persisted. Raw callback data is discarded.
    if (update.callbackData) return '/tenant-callback';
    const text = update.text;
    if (!text) return undefined;
    const [command, argument] = text.split(/\s+/, 2);
    if (command.toLowerCase() !== '/start' || !argument) return text;
    return `/start-digest ${createHash('sha256').update(argument).digest('hex')}`;
}

async function readBoundedJson(
    request: Request,
    maxBytes: number,
): Promise<unknown | 'TOO_LARGE' | undefined> {
    const reader = request.body?.getReader();
    if (!reader) return undefined;
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) {
                await reader.cancel();
                return 'TOO_LARGE';
            }
            chunks.push(value);
        }
        const combined = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return JSON.parse(new TextDecoder().decode(combined));
    } catch {
        return undefined;
    }
}
