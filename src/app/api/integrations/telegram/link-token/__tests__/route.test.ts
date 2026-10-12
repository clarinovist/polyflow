import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    config: vi.fn(),
    validate: vi.fn(),
    create: vi.fn(),
    tenant: vi.fn(),
    tenantDb: vi.fn(),
}));

vi.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: ResponseInit) =>
            Response.json(body, init),
    },
}));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/telegram/assistant-config', () => ({
    loadTelegramAssistantConfig: mocks.config,
}));
vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({ tenant: { findFirst: mocks.tenant } }),
    getTenantDb: mocks.tenantDb,
}));
vi.mock('@/services/auth/central-identity-service', async (load) => {
    const original = await load<
        typeof import('@/services/auth/central-identity-service')
    >();
    return {
        ...original,
        CentralIdentityService: class {
            validateSessionBinding = mocks.validate;
        },
    };
});
vi.mock('@/services/telegram/assistant-link-service', async (load) => {
    const original = await load<
        typeof import('@/services/telegram/assistant-link-service')
    >();
    return {
        ...original,
        TelegramAssistantLinkService: class {
            createLinkToken = mocks.create;
        },
    };
});

const centralUser = {
    id: 'user-a',
    globalAccountId: 'account-a',
    membershipId: 'membership-a',
    tenantId: 'tenant-a',
    globalRevocationVersion: 1,
    membershipVersion: 2,
    localAuthVersion: 3,
    isSuperAdmin: false,
};

beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.mockReturnValue({
        TELEGRAM_ASSISTANT_BOT_USERNAME: 'synthetic_bot',
    });
    mocks.tenant.mockResolvedValue({ dbUrl: 'postgres://synthetic' });
    mocks.validate.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({
        token: 'opaque-token',
        expiresAt: new Date('2026-10-12T00:10:00.000Z'),
    });
});

describe('Telegram assistant link-token route', () => {
    it('returns 401 for unauthenticated callers', async () => {
        mocks.auth.mockResolvedValue(null);
        const { POST } = await import('../route');
        const response = await POST();
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
            error: 'Autentikasi diperlukan.',
        });
    });

    it.each([
        { id: 'local-user' },
        { ...centralUser, globalAccountId: undefined },
        { ...centralUser, isSuperAdmin: true },
        { ...centralUser, impersonatedBy: 'support-user' },
    ])('returns 403 for LOCAL/missing, superadmin, or impersonation claims: %j', async (user) => {
        mocks.auth.mockResolvedValue({ user });
        const { POST } = await import('../route');
        const response = await POST();
        expect(response.status).toBe(403);
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('maps revoked session binding to 403', async () => {
        const { CentralIdentityAccessError } = await import(
            '@/services/auth/central-identity-service'
        );
        mocks.auth.mockResolvedValue({ user: centralUser });
        mocks.validate.mockRejectedValue(
            new CentralIdentityAccessError('SESSION_REVOKED'),
        );
        const { POST } = await import('../route');
        expect((await POST()).status).toBe(403);
    });

    it('maps unavailable config or infrastructure to 503', async () => {
        mocks.auth.mockResolvedValue({ user: centralUser });
        mocks.config.mockImplementation(() => {
            throw new Error('missing config');
        });
        const { POST } = await import('../route');
        expect((await POST()).status).toBe(503);
    });

    it('returns an HTTPS start URL and private no-store response on success', async () => {
        mocks.auth.mockResolvedValue({ user: centralUser });
        const { POST } = await import('../route');
        const response = await POST();
        expect(await response.json()).toEqual({
            token: 'opaque-token',
            expiresAt: '2026-10-12T00:10:00.000Z',
            startUrl: 'https://t.me/synthetic_bot?start=opaque-token',
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('vary')).toBe('Cookie');
        expect(mocks.validate).toHaveBeenCalledWith({
            globalAccountId: 'account-a',
            membershipId: 'membership-a',
            tenantId: 'tenant-a',
            tenantUserId: 'user-a',
            globalRevocationVersion: 1,
            membershipVersion: 2,
            localAuthVersion: 3,
        });
    });
});
