import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCentralWorkspaceOptions } from '../central-workspaces';

const m = vi.hoisted(() => ({ account: vi.fn(), tenant: vi.fn(), user: vi.fn(), tenantDb: vi.fn(), configured: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({ globalAccount: { findUnique: m.account }, tenant: { findUnique: m.tenant } }),
    getTenantDb: m.tenantDb,
}));
vi.mock('../central-oidc-config', () => ({ isCentralSsoConfigured: m.configured }));

const membership = {
    id: 'membership-a', tenantId: 'tenant-a', tenantUserId: 'actor-a',
    tenant: { id: 'tenant-a', name: 'Synthetic A', subdomain: 'tenant-a', status: 'ACTIVE' },
};
const actor = { isActive: true, authMode: 'CENTRAL', centralAccountId: 'account-a' };

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'example.test');
    m.configured.mockReturnValue(true);
    m.account.mockResolvedValue({ status: 'ACTIVE', memberships: [membership] });
    m.tenant.mockResolvedValue({ dbUrl: 'synthetic-db-reference' });
    m.tenantDb.mockReturnValue({ user: { findUnique: m.user } });
    m.user.mockResolvedValue(actor);
});
afterEach(() => vi.unstubAllEnvs());

describe('central workspace options shared by desktop and mobile', () => {
    it('queries active memberships of exactly the session identity and returns trusted login links', async () => {
        await expect(getCentralWorkspaceOptions('account-a')).resolves.toEqual([
            { tenantId: 'tenant-a', name: 'Synthetic A', subdomain: 'tenant-a', href: 'https://tenant-a.example.test/login' },
        ]);
        expect(m.account).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'account-a' },
            include: expect.objectContaining({ memberships: expect.objectContaining({ where: { status: 'ACTIVE' } }) }),
        }));
        expect(m.user).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'actor-a' } }));
    });

    it('does not query memberships for a local account', async () => {
        await expect(getCentralWorkspaceOptions(undefined)).resolves.toEqual([]);
        expect(m.account).not.toHaveBeenCalled();
    });

    it('does not expose central navigation when SSO is disabled', async () => {
        m.configured.mockReturnValue(false);
        await expect(getCentralWorkspaceOptions('account-a')).resolves.toEqual([]);
        expect(m.account).not.toHaveBeenCalled();
    });

    it.each([null, { status: 'SUSPENDED', memberships: [membership] }])('rejects a missing or inactive global account', async (account) => {
        m.account.mockResolvedValue(account);
        await expect(getCentralWorkspaceOptions('account-a')).rejects.toThrow();
        expect(m.tenantDb).not.toHaveBeenCalled();
    });

    it('excludes inactive tenant memberships without opening their databases', async () => {
        m.account.mockResolvedValue({ status: 'ACTIVE', memberships: [{ ...membership, tenant: { ...membership.tenant, status: 'SUSPENDED' } }] });
        await expect(getCentralWorkspaceOptions('account-a')).resolves.toEqual([]);
        expect(m.tenantDb).not.toHaveBeenCalled();
    });

    it.each([null, { dbUrl: '' }])('excludes missing tenant databases', async (tenant) => {
        m.tenant.mockResolvedValue(tenant);
        await expect(getCentralWorkspaceOptions('account-a')).resolves.toEqual([]);
        expect(m.tenantDb).not.toHaveBeenCalled();
    });

    it.each([
        null,
        { ...actor, isActive: false },
        { ...actor, authMode: 'LOCAL' },
        { ...actor, centralAccountId: 'different-account' },
    ])('excludes invalid tenant-local actors: %j', async (localActor) => {
        m.user.mockResolvedValue(localActor);
        await expect(getCentralWorkspaceOptions('account-a')).resolves.toEqual([]);
    });

    it('does not emit partial choices when a tenant database is unavailable', async () => {
        m.user.mockRejectedValue(new Error('unavailable'));
        await expect(getCentralWorkspaceOptions('account-a')).rejects.toThrow('unavailable');
    });
});
