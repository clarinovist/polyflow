import { describe, expect, it, vi } from 'vitest';

interface CapturedAuthConfig {
    providers: Array<{
        authorize: (
            credentials: Record<string, unknown>,
            request?: Request,
        ) => Promise<unknown>;
    }>;
}

function mockAuthModule(captured: { config: CapturedAuthConfig | null }) {
    vi.doMock('next-auth', () => ({
        default: vi.fn((config) => {
            captured.config = config as CapturedAuthConfig;
            return {
                auth: vi.fn(),
                signIn: vi.fn(),
                signOut: vi.fn(),
                handlers: {},
            };
        }),
    }));
    vi.doMock('next-auth/providers/credentials', () => ({
        default: vi.fn((options) => options),
    }));
    vi.doMock('@/auth.config', () => ({ authConfig: {} }));
    vi.doMock('@/lib/core/tenant', () => ({
        extractSubdomain: vi.fn(() => null),
    }));
}

describe('credentials authorize behavior', () => {
    it('returns null instead of throwing when a user is not found', async () => {
        vi.resetModules();
        const captured = { config: null as CapturedAuthConfig | null };
        mockAuthModule(captured);
        vi.doMock('@/lib/core/prisma', () => ({
            prisma: {
                user: {
                    findUnique: vi.fn().mockResolvedValue(null),
                },
            },
        }));

        await import('@/auth');

        const authorize = captured.config?.providers[0]?.authorize;
        expect(authorize).toBeDefined();
        await expect(
            authorize?.({
                email: 'missing@example.com',
                password: 'secret123',
            }),
        ).resolves.toBeNull();
    });

    it('returns null instead of throwing when a user is inactive', async () => {
        vi.resetModules();
        const captured = { config: null as CapturedAuthConfig | null };
        mockAuthModule(captured);
        vi.doMock('@/lib/core/prisma', () => ({
            prisma: {
                user: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'user-1',
                        name: 'Inactive User',
                        email: 'inactive@example.com',
                        password: 'hash',
                        role: 'ADMIN',
                        isActive: false,
                        isSuperAdmin: false,
                        avatarUrl: null,
                        tokenVersion: 0,
                    }),
                },
            },
        }));

        await import('@/auth');

        const authorize = captured.config?.providers[0]?.authorize;
        expect(authorize).toBeDefined();
        await expect(
            authorize?.({
                email: 'inactive@example.com',
                password: 'secret123',
            }),
        ).resolves.toBeNull();
    });

    it('rate limits direct credentials callback attempts inside authorize', async () => {
        vi.resetModules();
        process.env.LOGIN_RATE_LIMIT_IDENTITY_MAX = '1';
        process.env.LOGIN_RATE_LIMIT_IP_MAX = '10';
        process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '300000';
        const captured = { config: null as CapturedAuthConfig | null };
        mockAuthModule(captured);
        vi.doMock('@/lib/core/prisma', () => ({
            prisma: {
                user: {
                    findUnique: vi.fn().mockResolvedValue(null),
                },
            },
        }));

        try {
            await import('@/auth');

            const authorize = captured.config?.providers[0]?.authorize;
            expect(authorize).toBeDefined();

            const request = new Request(
                'https://example.test/api/auth/callback/credentials',
                { headers: { 'x-forwarded-for': '10.91.0.1' } },
            );

            await expect(
                authorize?.(
                    {
                        email: 'direct-callback@example.com',
                        password: 'secret123',
                    },
                    request,
                ),
            ).resolves.toBeNull();

            await expect(
                authorize?.(
                    {
                        email: 'direct-callback@example.com',
                        password: 'secret123',
                    },
                    request,
                ),
            ).rejects.toThrow('LoginRateLimited');
        } finally {
            delete process.env.LOGIN_RATE_LIMIT_IDENTITY_MAX;
            delete process.env.LOGIN_RATE_LIMIT_IP_MAX;
            delete process.env.LOGIN_RATE_LIMIT_WINDOW_MS;
        }
    });

    it('rejects direct impersonation credentials without a valid server signature', async () => {
        vi.resetModules();
        const captured = { config: null as CapturedAuthConfig | null };
        mockAuthModule(captured);
        vi.doMock('@/lib/core/prisma', () => ({
            prisma: {
                user: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'user-2',
                        name: 'Target User',
                        email: 'target@example.com',
                        password: 'hash',
                        role: 'ADMIN',
                        isActive: true,
                        isSuperAdmin: false,
                        avatarUrl: null,
                        tokenVersion: 0,
                    }),
                },
            },
        }));

        await import('@/auth');

        const authorize = captured.config?.providers[0]?.authorize;
        expect(authorize).toBeDefined();
        await expect(
            authorize?.({
                email: 'target@example.com',
                password: 'wrong-password',
                impersonationBy: 'super-admin-id',
                impersonationExpiresAt: Math.floor(Date.now() / 1000) + 300,
            }),
        ).rejects.toThrow('InvalidImpersonationSignature');
    });
});
