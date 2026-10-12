import { describe, expect, it, vi } from 'vitest';
import { parseTelegramAssistantUpdate } from '../assistant-update';
import {
    formatTelegramPlainText,
    TelegramAssistantClient,
} from '../assistant-client';

function message(overrides: Record<string, unknown> = {}) {
    return {
        update_id: 7,
        message: {
            message_id: 9,
            from: { id: 123 },
            chat: { id: 123, type: 'private' },
            text: 'stok HD1 berapa?',
            ...overrides,
        },
    };
}

describe('Telegram assistant update validation', () => {
    it('normalizes a private message without retaining raw update fields', () => {
        expect(parseTelegramAssistantUpdate(message())).toEqual({
            ok: true,
            update: {
                updateId: '7',
                type: 'message',
                telegramUserId: '123',
                telegramChatId: '123',
                sourceMessageId: '9',
                text: 'stok HD1 berapa?',
            },
        });
    });

    it('accepts a real callback where message.from is the bot', () => {
        expect(
            parseTelegramAssistantUpdate({
                update_id: 8,
                callback_query: {
                    id: 'callback-1',
                    from: { id: 123 },
                    data: 't1.membership.4.signature',
                    message: {
                        message_id: 10,
                        from: { id: 777000, is_bot: true },
                        chat: { id: 123, type: 'private' },
                        text: 'Pilih workspace',
                    },
                },
            }),
        ).toEqual({
            ok: true,
            update: {
                updateId: '8',
                type: 'callback',
                telegramUserId: '123',
                telegramChatId: '123',
                sourceMessageId: '10',
                callbackQueryId: 'callback-1',
                callbackData: 't1.membership.4.signature',
            },
        });
    });

    it('rejects group chat and human sender/chat mismatch', () => {
        expect(
            parseTelegramAssistantUpdate(
                message({ chat: { id: 123, type: 'group' } }),
            ),
        ).toEqual({ ok: false, reason: 'PRIVATE_ONLY' });
        expect(
            parseTelegramAssistantUpdate(message({ from: { id: 999 } })),
        ).toEqual({ ok: false, reason: 'SENDER_MISMATCH' });
        expect(
            parseTelegramAssistantUpdate({
                update_id: 8,
                callback_query: {
                    id: 'callback-1',
                    from: { id: 999 },
                    data: 'signed-callback',
                    message: {
                        message_id: 10,
                        from: { id: 777000 },
                        chat: { id: 123, type: 'private' },
                    },
                },
            }),
        ).toEqual({ ok: false, reason: 'SENDER_MISMATCH' });
    });

    it('rejects unsupported/oversized bodies at schema boundary', () => {
        expect(parseTelegramAssistantUpdate({ update_id: 1 })).toEqual({
            ok: false,
            reason: 'SCHEMA',
        });
        expect(
            parseTelegramAssistantUpdate(
                message({ text: 'x'.repeat(2001) }),
            ),
        ).toEqual({ ok: false, reason: 'SCHEMA' });
    });
});

describe('Telegram assistant delivery status handling', () => {
    it.each([408, 425, 500, 503])(
        'marks transient HTTP %s delivery failures retryable',
        async (status) => {
            const client = new TelegramAssistantClient({
                token: '1:'.padEnd(24, 'x'),
                fetch: vi.fn(async () => ({
                    ok: false,
                    status,
                    headers: new Headers(),
                    body: { cancel: vi.fn(async () => undefined) },
                })) as never,
            });
            await expect(
                client.sendMessage({ chatId: '123', text: 'test' }),
            ).rejects.toMatchObject({ retryable: true });
        },
    );

    it('marks 429 retryable with a bounded Retry-After without reading the body', async () => {
        const cancel = vi.fn(async () => undefined);
        const client = new TelegramAssistantClient({
            token: '1:'.padEnd(24, 'x'),
            fetch: vi.fn(async () => ({
                ok: false,
                status: 429,
                headers: new Headers({ 'retry-after': '12' }),
                body: { cancel },
            })) as never,
        });
        await expect(
            client.sendMessage({ chatId: '123', text: 'test' }),
        ).rejects.toMatchObject({ retryable: true, retryAfterMs: 12_000 });
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('marks terminal 400 delivery failures non-retryable', async () => {
        const client = new TelegramAssistantClient({
            token: '1:'.padEnd(24, 'x'),
            fetch: vi.fn(async () => ({
                ok: false,
                status: 400,
                headers: new Headers(),
                body: { cancel: vi.fn(async () => undefined) },
            })) as never,
        });
        await expect(
            client.sendMessage({ chatId: '123', text: 'test' }),
        ).rejects.toMatchObject({ retryable: false });
    });
});

describe('Telegram plain text formatting', () => {
    it('uses plain text, strips controls, names active tenant, and stays in limit', () => {
        const result = formatTelegramPlainText(
            `<b>stok</b>\u0000 ${'x'.repeat(5000)}`,
            'Tenant A',
        );
        expect(result).toContain('Workspace aktif: Tenant A');
        expect(result).toContain('<b>stok</b>');
        expect(result).not.toContain('\u0000');
        expect(result.length).toBeLessThanOrEqual(4096);
        expect(result.endsWith('…')).toBe(true);
    });
});
