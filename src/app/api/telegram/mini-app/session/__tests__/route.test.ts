import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
    class MockNextResponse {
        status: number;
        _body: unknown;
        headers: Map<string, string>;
        constructor(body?: unknown, init?: { status?: number }) {
            this._body = body;
            this.status = init?.status ?? 200;
            this.headers = new Map();
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

vi.mock('@/lib/core/tenant', () => ({
    withTenantRoute: (handler: (req: unknown) => unknown) => handler,
}));

vi.mock('@/lib/core/prisma', () => ({
    getTenantIdFromContext: vi.fn(() => 'tenant-melindo'),
    prisma: {
        user: {
            findUnique: vi.fn().mockResolvedValue({
                id: 'user-1',
                name: 'Budi',
                email: 'budi@melindo.test',
                role: 'ADMIN',
                isActive: true,
                isSuperAdmin: false,
            }),
        },
        userRole: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        rolePermission: {
            findMany: vi.fn().mockResolvedValue([]),
        },
    },
}));

vi.mock('@/lib/telegram/kill-switch', () => ({
    isMiniAppEnabled: vi.fn(() => true),
    getBotToken: vi.fn(() => 'test-bot-token'),
    getInitDataMaxAgeSec: vi.fn(() => 86400),
}));

vi.mock('@/lib/api/rate-limit', () => ({
    rateLimit: vi.fn(() => ({ success: true, count: 1, remaining: 29 })),
}));

vi.mock('@/lib/telegram/init-data-validation', () => ({
    validateTelegramInitData: vi.fn(),
}));

vi.mock('@/lib/telegram/session', () => ({
    createTelegramSession: vi.fn().mockResolvedValue({
        rawToken: 'raw-token',
        expiresAt: new Date(Date.now() + 3600_000),
    }),
    buildSessionCookieHeader: vi.fn(() => 'polyflow_tg=raw-token; Path=/; HttpOnly'),
}));

vi.mock('@/lib/telegram/allowlist', () => ({
    checkPilotAdminGate: vi.fn(() => ({ allowed: true })),
    isPilotTenant: vi.fn(() => true),
}));

vi.mock('@/lib/telegram/audit', () => ({
    logTelegramAudit: vi.fn(),
}));

vi.mock('@/lib/telegram/identity-service', () => ({
    findIdentityByTelegramUserId: vi.fn(),
    touchIdentityLastActive: vi.fn(),
}));

function assertResponse(res: void | Response): Response {
    if (res && typeof res === 'object' && 'status' in res && typeof (res as Response).json === 'function') {
        return res as Response;
    }
    throw new Error(`Expected Response but got ${String(res)}`);
}

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return {
        headers: {
            get: (key: string) => headers[key.toLowerCase()] ?? headers[key] ?? null,
        },
        json: async () => body,
    } as unknown as Parameters<typeof import('../route').POST>[0];
}

describe('Telegram mini-app session route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 INVALID when initData validation fails', async () => {
        const { validateTelegramInitData } = await import('@/lib/telegram/init-data-validation');
        (validateTelegramInitData as ReturnType<typeof vi.fn>).mockReturnValue({
            valid: false,
            error: 'invalid hash',
        });

        const { POST } = await import('../route');
        const res = assertResponse(await POST(makeRequest({ initData: 'bad' })));
        const body = await res.json();

        expect(res.status).toBe(401);
        expect(body.status).toBe('INVALID');
    });

    it('returns 401 EXPIRED when auth_date has expired', async () => {
        const { validateTelegramInitData } = await import('@/lib/telegram/init-data-validation');
        (validateTelegramInitData as ReturnType<typeof vi.fn>).mockReturnValue({
            valid: false,
            error: 'auth_date expired',
        });

        const { POST } = await import('../route');
        const res = assertResponse(await POST(makeRequest({ initData: 'stale' })));
        const body = await res.json();

        expect(res.status).toBe(401);
        expect(body.status).toBe('EXPIRED');
    });

    it('returns 200 UNLINKED when no matching identity exists', async () => {
        const { validateTelegramInitData } = await import('@/lib/telegram/init-data-validation');
        (validateTelegramInitData as ReturnType<typeof vi.fn>).mockReturnValue({
            valid: true,
            data: { user: { id: 123, username: 'budi' }, auth_date: Math.floor(Date.now() / 1000) },
        });
        const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
        (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const { POST } = await import('../route');
        const res = assertResponse(await POST(makeRequest({ initData: 'valid' })));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe('UNLINKED');
    });

    it('returns 403 REVOKED when identity status is REVOKED', async () => {
        const { validateTelegramInitData } = await import('@/lib/telegram/init-data-validation');
        (validateTelegramInitData as ReturnType<typeof vi.fn>).mockReturnValue({
            valid: true,
            data: { user: { id: 123, username: 'budi' }, auth_date: Math.floor(Date.now() / 1000) },
        });
        const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
        (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'identity-1',
            status: 'REVOKED',
            userId: 'user-1',
            linkedAt: new Date(),
        });

        const { POST } = await import('../route');
        const res = assertResponse(await POST(makeRequest({ initData: 'valid' })));
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(body.status).toBe('REVOKED');
    });

    it('returns 403 NOT_ALLOWLISTED when the admin gate rejects due to allowlist', async () => {
        const { validateTelegramInitData } = await import('@/lib/telegram/init-data-validation');
        (validateTelegramInitData as ReturnType<typeof vi.fn>).mockReturnValue({
            valid: true,
            data: { user: { id: 123, username: 'budi' }, auth_date: Math.floor(Date.now() / 1000) },
        });
        const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
        (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'identity-1',
            status: 'ACTIVE',
            userId: 'user-1',
            linkedAt: new Date(),
        });
        const { checkPilotAdminGate } = await import('@/lib/telegram/allowlist');
        (checkPilotAdminGate as ReturnType<typeof vi.fn>).mockReturnValue({
            allowed: false,
            reason: 'not in pilot allowlist',
        });

        const { POST } = await import('../route');
        const res = assertResponse(await POST(makeRequest({ initData: 'valid' })));
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(body.status).toBe('NOT_ALLOWLISTED');
    });

    it('returns 403 NOT_ADMIN when the admin gate rejects due to missing ADMIN role', async () => {
        const { validateTelegramInitData } = await import('@/lib/telegram/init-data-validation');
        (validateTelegramInitData as ReturnType<typeof vi.fn>).mockReturnValue({
            valid: true,
            data: { user: { id: 123, username: 'budi' }, auth_date: Math.floor(Date.now() / 1000) },
        });
        const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
        (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'identity-1',
            status: 'ACTIVE',
            userId: 'user-1',
            linkedAt: new Date(),
        });
        const { checkPilotAdminGate } = await import('@/lib/telegram/allowlist');
        (checkPilotAdminGate as ReturnType<typeof vi.fn>).mockReturnValue({
            allowed: false,
            reason: 'ADMIN role required',
        });

        const { POST } = await import('../route');
        const res = assertResponse(await POST(makeRequest({ initData: 'valid' })));
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(body.status).toBe('NOT_ADMIN');
    });

    it('returns 200 LINKED with a Set-Cookie header on the full success path', async () => {
        const { validateTelegramInitData } = await import('@/lib/telegram/init-data-validation');
        (validateTelegramInitData as ReturnType<typeof vi.fn>).mockReturnValue({
            valid: true,
            data: { user: { id: 123, username: 'budi' }, auth_date: Math.floor(Date.now() / 1000) },
        });
        const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
        (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'identity-1',
            status: 'ACTIVE',
            userId: 'user-1',
            linkedAt: new Date(),
        });
        const { checkPilotAdminGate } = await import('@/lib/telegram/allowlist');
        (checkPilotAdminGate as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: true });

        const { POST } = await import('../route');
        const res = assertResponse(await POST(makeRequest({ initData: 'valid' })));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe('LINKED');
        expect(res.headers.get('Set-Cookie')).toContain('polyflow_tg=raw-token');
    });
});
