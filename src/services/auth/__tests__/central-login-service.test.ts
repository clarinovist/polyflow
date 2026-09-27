import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCentralLoginUser } from '@/services/auth/central-login-service';

function dependencies() {
    const mainDb = {
        tenant: { findUnique: vi.fn() },
        globalAccount: { findUnique: vi.fn(), update: vi.fn() },
        tenantMembership: { findUnique: vi.fn() },
        $transaction: vi.fn(),
    };
    const tenantDb = {
        user: {
            findUnique: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        userRole: { findMany: vi.fn() },
        rolePermission: { findMany: vi.fn() },
        $transaction: vi.fn(),
    };
    return {
        mainDb,
        tenantDb,
        loadTenantDb: vi.fn(() => tenantDb),
    };
}

const input = {
    tenantSubdomain: 'tenant-a',
    identity: {
        issuer: 'https://identity.test',
        subject: 'subject-a',
        email: 'staff@example.test',
        emailVerified: true,
    },
};

describe('resolveCentralLoginUser', () => {
    beforeEach(() => {
        vi.stubEnv('CENTRAL_OIDC_ISSUER', 'https://identity.test');
    });

    it('returns tenant-local roles and permissions with revocation claims', async () => {
        const deps = dependencies();
        deps.mainDb.tenant.findUnique.mockResolvedValue({
            id: 'tenant-a-id',
            dbUrl: 'postgresql://synthetic.invalid/tenant-a',
            status: 'ACTIVE',
        });
        deps.mainDb.globalAccount.findUnique.mockResolvedValue({
            id: 'account-a',
            status: 'ACTIVE',
            revocationVersion: 2,
        });
        deps.mainDb.tenantMembership.findUnique.mockResolvedValue({
            id: 'membership-a',
            globalAccountId: 'account-a',
            tenantId: 'tenant-a-id',
            tenantUserId: 'local-user-a',
            status: 'ACTIVE',
            membershipVersion: 3,
            tenant: { status: 'ACTIVE' },
        });
        deps.tenantDb.user.findUnique
            .mockResolvedValueOnce({
                id: 'local-user-a',
                isActive: true,
                authMode: 'CENTRAL',
                centralAccountId: 'account-a',
                centralAuthVersion: 4,
            })
            .mockResolvedValueOnce({
                id: 'local-user-a',
                name: 'Staff',
                email: input.identity.email,
                avatarUrl: null,
                role: 'FINANCE',
                isActive: true,
                isSuperAdmin: false,
                tokenVersion: 5,
                authMode: 'CENTRAL',
                centralAccountId: 'account-a',
            });
        deps.tenantDb.userRole.findMany.mockResolvedValue([
            { role: 'FINANCE' },
            { role: 'ADMIN' },
        ]);
        deps.tenantDb.rolePermission.findMany.mockResolvedValue([
            { resource: '/finance' },
            { resource: '/dashboard' },
            { resource: '/finance' },
        ]);

        await expect(
            resolveCentralLoginUser(input, deps as never),
        ).resolves.toMatchObject({
            id: 'local-user-a',
            tenantId: 'tenant-a-id',
            tenantSubdomain: 'tenant-a',
            globalAccountId: 'account-a',
            membershipId: 'membership-a',
            globalRevocationVersion: 2,
            membershipVersion: 3,
            localAuthVersion: 4,
            roles: ['FINANCE', 'ADMIN'],
            allowedResources: ['ALL'],
            isSuperAdmin: false,
        });
    });

    it('does not load a tenant DB for an inactive tenant', async () => {
        const deps = dependencies();
        deps.mainDb.tenant.findUnique.mockResolvedValue({
            id: 'tenant-a-id',
            dbUrl: 'postgresql://synthetic.invalid/tenant-a',
            status: 'SUSPENDED',
        });

        await expect(
            resolveCentralLoginUser(input, deps as never),
        ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
        expect(deps.loadTenantDb).not.toHaveBeenCalled();
    });

    it('rejects a superadmin-shaped local actor', async () => {
        const deps = dependencies();
        deps.mainDb.tenant.findUnique.mockResolvedValue({
            id: 'tenant-a-id',
            dbUrl: 'postgresql://synthetic.invalid/tenant-a',
            status: 'ACTIVE',
        });
        deps.mainDb.globalAccount.findUnique.mockResolvedValue({
            id: 'account-a',
            status: 'ACTIVE',
            revocationVersion: 0,
        });
        deps.mainDb.tenantMembership.findUnique.mockResolvedValue({
            id: 'membership-a',
            globalAccountId: 'account-a',
            tenantId: 'tenant-a-id',
            tenantUserId: 'local-user-a',
            status: 'ACTIVE',
            membershipVersion: 1,
            tenant: { status: 'ACTIVE' },
        });
        deps.tenantDb.user.findUnique
            .mockResolvedValueOnce({
                id: 'local-user-a',
                isActive: true,
                authMode: 'CENTRAL',
                centralAccountId: 'account-a',
                centralAuthVersion: 1,
            })
            .mockResolvedValueOnce({
                id: 'local-user-a',
                isActive: true,
                isSuperAdmin: true,
                authMode: 'CENTRAL',
                centralAccountId: 'account-a',
            });

        await expect(
            resolveCentralLoginUser(input, deps as never),
        ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    });
});
