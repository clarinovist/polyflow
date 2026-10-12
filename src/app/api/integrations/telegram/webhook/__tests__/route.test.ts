import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: vi.fn(), handle: vi.fn() }));
vi.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: ResponseInit) =>
            Response.json(body, init),
    },
}));
vi.mock('@/lib/telegram/assistant-config', () => ({
    loadTelegramAssistantConfig: mocks.config,
}));
vi.mock('@/lib/telegram/assistant-webhook', () => ({
    handleTelegramAssistantWebhook: mocks.handle,
}));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.mockReturnValue({ TELEGRAM_ASSISTANT_BOT_KEY: 'assistant-v1' });
    mocks.handle.mockResolvedValue({ status: 200, body: { ok: true } });
});

describe('live Telegram assistant webhook route', () => {
    it('stays live at the new endpoint with no-store responses', async () => {
        const request = new Request(
            'https://example.test/api/integrations/telegram/webhook',
            { method: 'POST' },
        );
        const { POST } = await import('../route');
        const response = await POST(request);
        expect(await response.json()).toEqual({ ok: true });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(mocks.handle).toHaveBeenCalledWith(
            request,
            expect.objectContaining({
                TELEGRAM_ASSISTANT_BOT_KEY: 'assistant-v1',
            }),
        );
    });

    it('returns 503 when complete Telegram config is unavailable', async () => {
        mocks.config.mockImplementation(() => {
            throw new Error('missing config');
        });
        const { POST } = await import('../route');
        const response = await POST(
            new Request('https://example.test/api/integrations/telegram/webhook'),
        );
        expect(response.status).toBe(503);
        expect(mocks.handle).not.toHaveBeenCalled();
    });
});
