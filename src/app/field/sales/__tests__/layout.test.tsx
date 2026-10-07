import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SalesFieldLayout from '../layout';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';

const m = vi.hoisted(() => ({
    guard: vi.fn(),
    auth: vi.fn(),
    permissions: vi.fn(),
    stats: vi.fn(),
}));
vi.mock('@/lib/mobile/mobile-portal-page-access', () => ({
    requireMobilePortalPageAccess: m.guard,
}));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/actions/admin/permissions', () => ({
    getMyPermissions: m.permissions,
}));
vi.mock('@/actions/inventory/inventory', () => ({
    getDashboardStats: m.stats,
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

function findAccountMenu(node: ReactNode): Record<string, unknown> | undefined {
    for (const child of Children.toArray(node)) {
        if (!isValidElement<{ children?: ReactNode; header?: ReactNode; actions?: ReactNode; user?: unknown }>(child)) continue;
        if (child.type === MobileAccountMenuServer) return child.props;
        for (const nested of [child.props.children, child.props.header, child.props.actions]) {
            const result = findAccountMenu(nested);
            if (result) return result;
        }
    }
}

const user = { id: 'sales-1', role: 'SALES' };

describe('Sales Field mobile layout guard and shell', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        m.guard.mockResolvedValue({});
        m.auth.mockResolvedValue({ user });
        m.permissions.mockResolvedValue({ success: true, data: ['/field/sales'] });
        m.stats.mockResolvedValue({ success: true, data: { lowStockCount: 2 } });
    });

    it('guards before rendering the relocated sales shell', async () => {
        const tree = await SalesFieldLayout({ children: <p>Konten sales</p> });
        expect(m.guard).toHaveBeenCalledWith('sales-field');
        expect(findAccountMenu(tree)?.user).toBe(user);
        expect(m.permissions).toHaveBeenCalledOnce();
        expect(m.stats).toHaveBeenCalledOnce();
    });

    it('does not read sales shell data after a direct guard denial', async () => {
        m.guard.mockRejectedValue(new Error('Denied'));
        await expect(
            SalesFieldLayout({ children: <p>Konten sales</p> }),
        ).rejects.toThrow('Denied');
        expect(m.auth).not.toHaveBeenCalled();
        expect(m.permissions).not.toHaveBeenCalled();
        expect(m.stats).not.toHaveBeenCalled();
    });
});
