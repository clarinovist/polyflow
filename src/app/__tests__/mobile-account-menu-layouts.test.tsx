import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FieldLayout from '../field/layout';
import SalesMobileLayout from '../sales/mobile/layout';
import WarehouseMobileLayout from '../warehouse/mobile/layout';
import MobileSelectorPage from '../mobile/page';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';

const m = vi.hoisted(() => ({ auth: vi.fn(), permissions: vi.fn(), stats: vi.fn(), portals: vi.fn() }));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/actions/admin/permissions', () => ({ getMyPermissions: m.permissions }));
vi.mock('@/actions/inventory/inventory', () => ({ getDashboardStats: m.stats }));
vi.mock('@/actions/settings/mobile-portals', () => ({ getMyMobilePortals: m.portals }));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    requireMobilePortalPageAccess: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/auth/access-policy', () => ({ hasWorkspaceEntitlement: () => true }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'user-agent': 'Android Mobile' }) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/components/layout/mobile-account-menu-server', () => ({ MobileAccountMenuServer: () => null }));
vi.mock('@/components/field/FieldBottomNav', () => ({ FieldBottomNav: () => null }));
vi.mock('@/components/field/FieldMobileFrame', () => ({ FieldMobileFrame: () => null }));
vi.mock('@/components/sales/mobile/BottomNav', () => ({ BottomNav: () => null }));
vi.mock('@/components/warehouse/mobile/WarehouseBottomNav', () => ({ WarehouseBottomNav: () => null }));

function findAccountMenu(node: ReactNode): Record<string, unknown> | undefined {
    for (const child of Children.toArray(node)) {
        if (!isValidElement<{ children?: ReactNode; user?: unknown }>(child)) continue;
        if (child.type === MobileAccountMenuServer) return child.props;
        const result = findAccountMenu(child.props.children);
        if (result) return result;
    }
}

const user = { id: 'actor-a', name: 'Synthetic User', role: 'SALES', roles: ['SALES'], tenantId: 'tenant-a', globalAccountId: 'account-a' };
beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ user });
    m.permissions.mockResolvedValue({ success: true, data: [] });
    m.stats.mockResolvedValue({ success: true, data: { lowStockCount: 0 } });
    m.portals.mockResolvedValue({ success: true, data: [] });
});

describe('mobile account menu integration', () => {
    it.each([FieldLayout, SalesMobileLayout, WarehouseMobileLayout])('%s passes the authenticated tenant identity to the server-only menu', async (Layout) => {
        const tree = await Layout({ children: <p>Portal content</p> });
        expect(findAccountMenu(tree)?.user).toBe(user);
    });

    it('adds company navigation to the portal selector as well', async () => {
        expect(findAccountMenu(await MobileSelectorPage())?.user).toBe(user);
    });

    it('does not render field navigation for an unauthenticated caller', async () => {
        m.auth.mockResolvedValue(null);
        await expect(FieldLayout({ children: null })).rejects.toThrow('redirect:/login');
    });
});
