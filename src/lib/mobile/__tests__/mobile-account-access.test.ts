import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    tenantDb: vi.fn(),
    findUser: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: m.tenantDb,
}));
vi.mock('@/lib/core/tenant', () => ({
    withTenantPage: (fn: () => Promise<unknown>) => fn,
}));

import { resolveMobileAccountAccess } from '../mobile-account-access';

const profile = {
    id: 'actor-a',
    name: 'Synthetic User',
    email: 'staff@example.test',
    locale: 'id',
    avatarUrl: null,
    authMode: 'LOCAL',
    isActive: true,
};

beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({
        user: {
            id: 'actor-a',
            name: 'Synthetic User',
            role: 'SALES',
            roles: ['SALES'],
            tenantId: 'tenant-a',
        },
    });
    m.tenantDb.mockReturnValue({ user: { findUnique: m.findUser } });
    m.findUser.mockResolvedValue(profile);
});

describe('mobile account access', () => {
    it('fails closed without a session before resolving a database', async () => {
        m.auth.mockResolvedValue(null);
        await expect(resolveMobileAccountAccess()).resolves.toEqual({
            status: 'no-session',
        });
        expect(m.tenantDb).not.toHaveBeenCalled();
        expect(m.findUser).not.toHaveBeenCalled();
    });

    it.each([
        { isSuperAdmin: true },
        { impersonatedBy: 'support-user' },
    ])('keeps restricted central sessions desktop-only: %j', async (claims) => {
        m.auth.mockResolvedValue({
            user: { id: 'actor-a', role: 'ADMIN', ...claims },
        });
        const result = await resolveMobileAccountAccess();
        expect(result.status).toBe('desktop-only');
        expect(m.tenantDb).not.toHaveBeenCalled();
        expect(m.findUser).not.toHaveBeenCalled();
    });

    it('requires an explicit tenant client and never queries a fallback', async () => {
        m.tenantDb.mockReturnValue(undefined);
        const result = await resolveMobileAccountAccess();
        expect(result.status).toBe('tenant-context');
        expect(m.findUser).not.toHaveBeenCalled();
    });

    it('fails closed when the session user is absent in the tenant', async () => {
        m.findUser.mockResolvedValue(null);
        const result = await resolveMobileAccountAccess();
        expect(result.status).toBe('user-not-found');
        expect(m.findUser).toHaveBeenCalledWith({
            where: { id: 'actor-a' },
            select: {
                id: true,
                name: true,
                email: true,
                locale: true,
                avatarUrl: true,
                authMode: true,
                isActive: true,
            },
        });
    });

    it('fails closed when the tenant account is inactive', async () => {
        m.findUser.mockResolvedValue({ ...profile, isActive: false });
        const result = await resolveMobileAccountAccess();
        expect(result.status).toBe('account-inactive');
    });

    it('maps an unknown tenant resolution to the generic tenant-context status', async () => {
        m.tenantDb.mockImplementation(() => {
            throw new Error(
                'Tenant database not found for subdomain: unknown-workspace',
            );
        });
        const result = await resolveMobileAccountAccess();
        expect(result.status).toBe('tenant-context');
        expect(m.findUser).not.toHaveBeenCalled();
    });

    it.each([
        'ADMIN',
        'WAREHOUSE',
        'PRODUCTION',
        'SALES',
        'PLANNING',
        'FINANCE',
        'PROCUREMENT',
        'HRD',
        'MARKETING',
        'FACTORY_MANAGER',
    ])('allows tenant role %s without a portal permission gate', async (role) => {
        m.auth.mockResolvedValue({
            user: { id: 'actor-a', role, roles: [role], tenantId: 'tenant-a' },
        });
        const result = await resolveMobileAccountAccess();
        expect(result.status).toBe('allowed');
        if (result.status === 'allowed') {
            expect(result.profile).toEqual({
                id: profile.id,
                name: profile.name,
                email: profile.email,
                locale: profile.locale,
                avatarUrl: profile.avatarUrl,
                authMode: profile.authMode,
            });
        }
    });

    it('allows multi-role tenant users through the same self-service route', async () => {
        m.auth.mockResolvedValue({
            user: {
                id: 'actor-a',
                role: 'FINANCE',
                roles: ['FINANCE', 'HRD', 'WAREHOUSE'],
                tenantId: 'tenant-a',
            },
        });
        await expect(resolveMobileAccountAccess()).resolves.toMatchObject({
            status: 'allowed',
            profile: {
                id: profile.id,
                name: profile.name,
                email: profile.email,
                locale: profile.locale,
                avatarUrl: profile.avatarUrl,
                authMode: profile.authMode,
            },
        });
    });
});
