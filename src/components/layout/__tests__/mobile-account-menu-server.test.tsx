import type { Session } from 'next-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileAccountMenuServer } from '../mobile-account-menu-server';

const m = vi.hoisted(() => ({ tenant: vi.fn(), workspaces: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => ({ tenant: { findUnique: m.tenant } }) }));
vi.mock('@/lib/auth/central-workspaces', () => ({ getCentralWorkspaceOptions: m.workspaces }));
vi.mock('../mobile-account-menu', () => ({ MobileAccountMenu: () => null }));

const user: Session['user'] = {
    id: 'actor-a', name: 'Synthetic User', email: 'staff@example.test',
    role: 'SALES', roles: ['SALES'], tenantId: 'tenant-a', globalAccountId: 'account-a',
};
const workspaces = [
    { tenantId: 'tenant-a', name: 'Synthetic A', subdomain: 'tenant-a', href: 'https://tenant-a.example.test/login' },
    { tenantId: 'tenant-b', name: 'Synthetic B', subdomain: 'tenant-b', href: 'https://tenant-b.example.test/login' },
];

beforeEach(() => {
    vi.resetAllMocks();
    m.tenant.mockResolvedValue({ name: 'Synthetic A' });
    m.workspaces.mockResolvedValue(workspaces);
});

describe('mobile account server boundary', () => {
    it('loads only the authenticated identity and passes display/link props to the client', async () => {
        const result = await MobileAccountMenuServer({ user, accentColor: 'bg-blue-600', hideAccountLink: true });
        expect(m.tenant).toHaveBeenCalledWith({ where: { id: user.tenantId }, select: { name: true } });
        expect(m.workspaces).toHaveBeenCalledWith(user.globalAccountId);
        expect(result?.props).toMatchObject({
            currentTenantId: 'tenant-a', currentTenantName: 'Synthetic A', workspaces,
            accentColor: 'bg-blue-600', workspacesUnavailable: false, hideAccountLink: true,
        });
        expect(result?.props.user).toEqual({ name: user.name, role: 'SALES', image: undefined, avatarUrl: undefined });
        expect(JSON.stringify(result?.props)).not.toContain('account-a');
        expect(JSON.stringify(result?.props)).not.toContain(user.email);
    });

    it('does not query identities for an unauthenticated caller', async () => {
        expect(await MobileAccountMenuServer({})).toBeNull();
        expect(m.tenant).not.toHaveBeenCalled();
        expect(m.workspaces).not.toHaveBeenCalled();
    });

    it('keeps non-tenant accounts usable without querying tenant navigation', async () => {
        const result = await MobileAccountMenuServer({ user: { ...user, tenantId: undefined } });
        expect(result?.props.workspaces).toEqual([]);
        expect(m.tenant).not.toHaveBeenCalled();
        expect(m.workspaces).not.toHaveBeenCalled();
    });

    it('passes no central identity for local accounts', async () => {
        m.workspaces.mockResolvedValue([]);
        const result = await MobileAccountMenuServer({ user: { ...user, globalAccountId: undefined } });
        expect(m.workspaces).toHaveBeenCalledWith(undefined);
        expect(result?.props.currentTenantName).toBe('Synthetic A');
        expect(result?.props.workspaces).toEqual([]);
    });

    it('does not expose workspace choices when the current tenant cannot be resolved', async () => {
        m.tenant.mockResolvedValue(null);
        const result = await MobileAccountMenuServer({ user });
        expect(result?.props.currentTenantName).toBeUndefined();
        expect(result?.props.workspaces).toEqual([]);
        expect(m.workspaces).not.toHaveBeenCalled();
    });

    it.each(['tenant', 'workspaces'] as const)('fails safely when %s lookup throws', async (lookup) => {
        m[lookup].mockRejectedValue(new Error('private database detail'));
        const result = await MobileAccountMenuServer({ user });
        expect(result?.props.workspaces).toEqual([]);
        expect(result?.props.workspacesUnavailable).toBe(true);
        expect(result?.props.user.name).toBe(user.name);
        expect(JSON.stringify(result?.props)).not.toContain('private database');
        if (lookup === 'workspaces') expect(result?.props.currentTenantName).toBe('Synthetic A');
    });
});
