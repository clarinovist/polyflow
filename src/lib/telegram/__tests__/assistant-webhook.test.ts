import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    create: vi.fn(),
    audit: vi.fn(),
    consume: vi.fn(),
    list: vi.fn(),
    select: vi.fn(),
    resolve: vi.fn(),
    unlink: vi.fn(),
    callback: vi.fn(),
    parseCallback: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({
        telegramUpdateLog: { create: mocks.create },
    }),
}));
vi.mock('@/services/telegram/assistant-link-service', async (load) => {
    const original = await load<
        typeof import('@/services/telegram/assistant-link-service')
    >();
    return {
        ...original,
        auditTelegramAssistant: mocks.audit,
        parseTelegramTenantCallback: mocks.parseCallback,
        TelegramAssistantLinkError: class extends Error {},
        TelegramAssistantLinkService: class {
        consumeLinkToken = mocks.consume;
        listActiveWorkspaces = mocks.list;
        selectTenant = mocks.select;
        resolveSelectedAuthority = mocks.resolve;
        unlink = mocks.unlink;
            createTenantCallback = mocks.callback;
        },
    };
});

import { handleTelegramAssistantWebhook } from '../assistant-webhook';
import type { TelegramAssistantConfig } from '../assistant-config';

const config: TelegramAssistantConfig = {
    TELEGRAM_ASSISTANT_BOT_TOKEN: '1:'.padEnd(24, 'x'),
    TELEGRAM_ASSISTANT_BOT_KEY: 'assistant-v1',
    TELEGRAM_ASSISTANT_WEBHOOK_SECRET: 'w'.repeat(32),
    TELEGRAM_ASSISTANT_SELECTION_HMAC_SECRET: 'h'.repeat(32),
    TELEGRAM_ASSISTANT_BOT_USERNAME: 'polyflow_bot',
    TELEGRAM_ASSISTANT_PUBLIC_BASE_URL: 'https://example.test',
    TELEGRAM_ASSISTANT_KILL_SWITCH: false,
};

function request(
    body: unknown,
    options: { secret?: string; contentLength?: string } = {},
) {
    const payload = JSON.stringify(body);
    return new Request('https://example.test/api/integrations/telegram/webhook', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-telegram-bot-api-secret-token':
                options.secret ?? config.TELEGRAM_ASSISTANT_WEBHOOK_SECRET,
            'content-length': options.contentLength ?? String(payload.length),
        },
        body: payload,
    });
}

const update = {
    update_id: 100,
    message: {
        message_id: 5,
        from: { id: 123 },
        chat: { id: 123, type: 'private' },
        text: 'stok HD1?',
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.audit.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({});
    mocks.resolve.mockResolvedValue({ tenantId: 'tenant-a' });
    mocks.parseCallback.mockReturnValue({
        membershipId: 'membership-a',
        selectionVersion: 1,
    });
});

describe('Telegram assistant webhook boundary', () => {
    it('requires the webhook secret before reading/reserving work', async () => {
        const response = await handleTelegramAssistantWebhook(
            request(update, { secret: 'bad' }),
            config,
        );
        expect(response.status).toBe(401);
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('ACKs kill switch without reserving new work', async () => {
        const response = await handleTelegramAssistantWebhook(request(update), {
            ...config,
            TELEGRAM_ASSISTANT_KILL_SWITCH: true,
        });
        expect(response).toEqual({
            status: 200,
            body: { ok: true, ignored: true },
        });
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('enforces declared body limit, private chat, and sender match', async () => {
        expect(
            (
                await handleTelegramAssistantWebhook(
                    request(update, { contentLength: String(20_000) }),
                    config,
                )
            ).status,
        ).toBe(413);
        expect(
            (
                await handleTelegramAssistantWebhook(
                    request({
                        ...update,
                        message: {
                            ...update.message,
                            chat: { id: 123, type: 'group' },
                        },
                    }),
                    config,
                )
            ).status,
        ).toBe(400);
        expect(
            (
                await handleTelegramAssistantWebhook(
                    request({
                        ...update,
                        message: { ...update.message, from: { id: 999 } },
                    }),
                    config,
                )
            ).status,
        ).toBe(400);
    });

    it('accepts a real callback with bot-authored message and rejects actor mismatch', async () => {
        const signedCallback = 't1.membership-a.1.valid-signature';
        const callback = {
            update_id: 102,
            callback_query: {
                id: 'callback-1',
                from: { id: 123 },
                data: signedCallback,
                message: {
                    message_id: 6,
                    from: { id: 777000, is_bot: true },
                    chat: { id: 123, type: 'private' },
                    text: 'Pilih workspace',
                },
            },
        };
        await expect(
            handleTelegramAssistantWebhook(request(callback), config),
        ).resolves.toMatchObject({ status: 200 });
        expect(mocks.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                type: 'callback',
                telegramUserId: '123',
                telegramChatId: '123',
                callbackMembershipId: 'membership-a',
                callbackSelectionVersion: 1,
                question: '/tenant-callback',
            }),
        });
        expect(JSON.stringify(mocks.create.mock.calls)).not.toContain(
            signedCallback,
        );

        const mismatch = await handleTelegramAssistantWebhook(
            request({
                ...callback,
                update_id: 103,
                callback_query: {
                    ...callback.callback_query,
                    from: { id: 999 },
                },
            }),
            config,
        );
        expect(mismatch.status).toBe(400);
    });

    it('audits a tampered callback with only hashed identifiers and never reserves raw callback data', async () => {
        const tampered = 't1.membership-a.1.tampered';
        mocks.parseCallback.mockReturnValueOnce(undefined);
        const response = await handleTelegramAssistantWebhook(
            request({
                update_id: 104,
                callback_query: {
                    id: 'callback-rejected',
                    from: { id: 123 },
                    data: tampered,
                    message: {
                        message_id: 7,
                        from: { id: 777000, is_bot: true },
                        chat: { id: 123, type: 'private' },
                    },
                },
            }),
            config,
        );
        expect(response).toEqual({
            status: 200,
            body: { ok: true, ignored: true },
        });
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'TENANT_SELECTION_REJECTED',
                outcome: 'CALLBACK_INVALID',
                telegramUserId: '123',
                updateId: '104',
                details: { errorCode: 'CALLBACK_INVALID' },
            }),
        );
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(tampered);
    });

    it('reserves only normalized fields and treats concurrent duplicate as resume', async () => {
        const first = await handleTelegramAssistantWebhook(
            request(update),
            config,
        );
        expect(first.status).toBe(200);
        expect(mocks.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                botKey: 'assistant-v1',
                updateId: '100',
                telegramUserId: '123',
                telegramChatId: '123',
                question: 'stok HD1?',
            }),
        });
        expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty('rawUpdate');

        await handleTelegramAssistantWebhook(
            request({
                ...update,
                update_id: 101,
                message: { ...update.message, text: '/start raw-secret-token' },
            }),
            config,
        );
        expect(mocks.create.mock.calls[1][0].data.question).toMatch(
            /^\/start-digest [a-f0-9]{64}$/,
        );
        expect(mocks.create.mock.calls[1][0].data.question).not.toContain(
            'raw-secret-token',
        );

        const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
        mocks.create.mockRejectedValueOnce(conflict);
        const duplicate = await handleTelegramAssistantWebhook(
            request(update),
            config,
        );
        expect(duplicate).toEqual({
            status: 200,
            body: { ok: true, duplicate: true },
        });
    });
});
