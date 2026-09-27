import { describe, expect, it, vi } from 'vitest';
import type { Session } from 'next-auth';
import { assertTenantSession } from '@/lib/auth/tenant-session';

function session(overrides: Record<string, unknown> = {}): Session {
    return {
        expires: '2099-01-01T00:00:00.000Z',
        user: {
            id: 'local-user-a',
            role: 'ADMIN',
            roles: ['ADMIN'],
            tenantId: 'tenant-a',
            tenantSubdomain: 'tenant-a',
            ...overrides,
        },
    } as Session;
}

const requestTenant = {
    tenantId: 'tenant-a',
    subdomain: 'tenant-a',
};

describe('assertTenantSession', () => {
    it('allows a local session only on its server-bound tenant host', async () => {
        const central = { validateSessionBinding: vi.fn() };
        await expect(
            assertTenantSession(session(), requestTenant, central as never),
        ).resolves.toBeUndefined();
        expect(central.validateSessionBinding).not.toHaveBeenCalled();
    });

    it('rejects the same local user id on another tenant', async () => {
        await expect(
            assertTenantSession(
                session(),
                {
                    ...requestTenant,
                    tenantId: 'tenant-b',
                    subdomain: 'tenant-b',
                },
                { validateSessionBinding: vi.fn() } as never,
            ),
        ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    });

    it('allows an unbound legacy local session until strict rollout is enabled', async () => {
        const legacy = session({ tenantId: undefined, tenantSubdomain: undefined });
        await expect(
            assertTenantSession(
                legacy,
                requestTenant,
                { validateSessionBinding: vi.fn() } as never,
            ),
        ).resolves.toBeUndefined();
        await expect(
            assertTenantSession(
                legacy,
                requestTenant,
                { validateSessionBinding: vi.fn() } as never,
                { requireLocalBinding: true },
            ),
        ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    });

    it('requires complete central revocation claims', async () => {
        await expect(
            assertTenantSession(
                session({ globalAccountId: 'account-a' }),
                requestTenant,
                { validateSessionBinding: vi.fn() } as never,
            ),
        ).rejects.toThrow('Sesi akun pusat tidak lengkap.');
    });

    it('revalidates a complete central binding', async () => {
        const central = { validateSessionBinding: vi.fn() };
        await assertTenantSession(
            session({
                globalAccountId: 'account-a',
                membershipId: 'membership-a',
                globalRevocationVersion: 2,
                membershipVersion: 3,
                localAuthVersion: 4,
            }),
            requestTenant,
            central as never,
        );
        expect(central.validateSessionBinding).toHaveBeenCalledWith({
            globalAccountId: 'account-a',
            membershipId: 'membership-a',
            tenantId: 'tenant-a',
            tenantUserId: 'local-user-a',
            globalRevocationVersion: 2,
            membershipVersion: 3,
            localAuthVersion: 4,
        });
    });
});
