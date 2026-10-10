import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminMobileLayout from '../mobile/admin/layout';
import FinanceMobileLayout from '../finance/mobile/layout';
import HrdMobileLayout from '../hrd/mobile/layout';
import PurchasingMobileLayout from '../purchasing/mobile/layout';
import ProductionMobileLayout from '../production/mobile/layout';
import FieldSalesLayout from '../field/sales/layout';
import MarketingMobileLayout from '../field/marketing/layout';
import SalesMobileLayout from '../sales/mobile/layout';
import WarehouseMobileLayout from '../warehouse/mobile/layout';
import MobileSelectorPage from '../mobile/page';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    permissions: vi.fn(),
    stats: vi.fn(),
    portals: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/actions/admin/permissions', () => ({
    getMyPermissions: m.permissions,
}));
vi.mock('@/actions/inventory/inventory', () => ({
    getDashboardStats: m.stats,
}));
vi.mock('@/actions/settings/mobile-portals', () => ({
    getMyMobilePortals: m.portals,
}));
vi.mock('@/lib/mobile/mobile-portal-page-access', () => ({
    requireMobilePortalPageAccess: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/auth/access-policy', () => ({
    hasWorkspaceEntitlement: () => true,
}));
vi.mock('next/headers', () => ({
    headers: async () => new Headers({ 'user-agent': 'Android Mobile' }),
}));
vi.mock('next/navigation', () => ({
    redirect: (path: string) => {
        throw new Error(`redirect:${path}`);
    },
}));
vi.mock('@/components/layout/mobile-account-menu-server', () => ({
    MobileAccountMenuServer: () => null,
}));
vi.mock('@/components/field/FieldBottomNav', () => ({
    FieldBottomNav: () => null,
}));
vi.mock('@/components/field/FieldMobileFrame', () => ({
    FieldMobileFrame: () => null,
}));
vi.mock('@/components/sales/mobile/BottomNav', () => ({
    BottomNav: () => null,
}));
vi.mock('@/components/warehouse/mobile/WarehouseBottomNav', () => ({
    WarehouseBottomNav: () => null,
}));

function findAccountMenu(node: ReactNode): Record<string, unknown> | undefined {
    for (const child of Children.toArray(node)) {
        if (
            !isValidElement<{
                children?: ReactNode;
                header?: ReactNode;
                actions?: ReactNode;
                user?: unknown;
            }>(child)
        )
            continue;
        if (child.type === MobileAccountMenuServer) return child.props;
        for (const nested of [
            child.props.children,
            child.props.header,
            child.props.actions,
        ]) {
            const result = findAccountMenu(nested);
            if (result) return result;
        }
    }
}

const user = {
    id: 'actor-a',
    name: 'Synthetic User',
    role: 'SALES',
    roles: ['SALES'],
    tenantId: 'tenant-a',
    globalAccountId: 'account-a',
};

beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ user });
    m.permissions.mockResolvedValue({ success: true, data: [] });
    m.stats.mockResolvedValue({ success: true, data: { lowStockCount: 0 } });
    m.portals.mockResolvedValue({ success: true, data: [] });
});

describe('mobile account menu integration', () => {
    it.each([
        ['admin', AdminMobileLayout],
        ['finance', FinanceMobileLayout],
        ['hrd-supervisor', HrdMobileLayout],
        ['purchasing', PurchasingMobileLayout],
        ['production-supervisor', ProductionMobileLayout],
        ['warehouse', WarehouseMobileLayout],
        ['sales-field', FieldSalesLayout],
        ['marketing-supervisor', MarketingMobileLayout],
    ])('%s passes the authenticated tenant identity to the server-only menu', async (_portal, Layout) => {
        const tree = await Layout({ children: <p>Portal content</p> });
        expect(findAccountMenu(tree)?.user).toBe(user);
    });

    it('keeps the legacy sales alias wired to the same account menu', async () => {
        const tree = await SalesMobileLayout({
            children: <p>Portal content</p>,
        });
        expect(findAccountMenu(tree)?.user).toBe(user);
    });

    it('adds account navigation to the selector but suppresses its self link', async () => {
        const menu = findAccountMenu(await MobileSelectorPage());
        expect(menu?.user).toBe(user);
        expect(menu?.hidePortalLink).toBe(true);
    });
});
