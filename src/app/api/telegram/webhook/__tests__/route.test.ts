import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
    class MockNextResponse {
        status: number;
        _body: unknown;
        constructor(body?: unknown, init?: { status?: number }) {
            this._body = body;
            this.status = init?.status ?? 200;
        }
        async json() {
            return this._body;
        }
        static json(body: unknown, init?: { status?: number }) {
            return new MockNextResponse(body, init);
        }
    }
    return { NextResponse: MockNextResponse, NextRequest: class {} };
});

const findUnique = vi.fn();
const create = vi.fn().mockResolvedValue({});

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        telegramUpdateLog: {
            findUnique: (...args: unknown[]) => findUnique(...args),
            create: (...args: unknown[]) => create(...args),
        },
    },
    getTenantDb: vi.fn(),
    getMainPrisma: vi.fn(() => ({
        tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    })),
}));

vi.mock('@/lib/telegram/kill-switch', () => ({
    isMiniAppEnabled: vi.fn(() => true),
    getWebhookSecret: vi.fn(() => 'expected-secret'),
    getMiniAppUrl: vi.fn(() => 'https://melindo.polyflow.uk/telegram'),
    getPilotSubdomain: vi.fn(() => 'melindo'),
    getBotUsername: vi.fn(() => 'pico2004_bot'),
}));

vi.mock('@/lib/telegram/audit', () => ({
    logTelegramAudit: vi.fn(),
}));

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return {
        headers: {
            get: (key: string) => headers[key.toLowerCase()] ?? headers[key] ?? null,
        },
        json: async () => body,
    } as unknown as Parameters<typeof import('../route').POST>[0];
}

describe('Telegram webhook route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        findUnique.mockReset();
        create.mockReset().mockResolvedValue({});
    });

    it('returns 401 when X-Telegram-Bot-Api-Secret-Token does not match', async () => {
        const { POST } = await import('../route');
        const req = makeRequest(
            { update_id: 1 },
            { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
        );

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it('returns 200 with dedup true for a duplicate update_id and does not create a new log', async () => {
        findUnique.mockResolvedValue({ id: 'existing-log', updateId: '42' });
        const { POST } = await import('../route');
        const req = makeRequest(
            { update_id: 42 },
            { 'x-telegram-bot-api-secret-token': 'expected-secret' },
        );

        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ ok: true, dedup: true });
        expect(create).not.toHaveBeenCalled();
    });

    it('returns 400 when update_id is missing', async () => {
        findUnique.mockResolvedValue(null);
        const { POST } = await import('../route');
        const req = makeRequest(
            {},
            { 'x-telegram-bot-api-secret-token': 'expected-secret' },
        );

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it('returns 200 with skipped when kill switch disables the mini app', async () => {
        const { isMiniAppEnabled } = await import('@/lib/telegram/kill-switch');
        (isMiniAppEnabled as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

        const { POST } = await import('../route');
        const req = makeRequest(
            { update_id: 7 },
            { 'x-telegram-bot-api-secret-token': 'expected-secret' },
        );

        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ ok: true, skipped: 'kill switch' });
    });
});
