// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DashboardLayout from '../dashboard/layout';
import FinanceLayout from '../finance/layout';
import HrdLayout from '../hrd/layout';
import MaklonLayout from '../maklon/layout';
import ProductionLayout from '../production/layout';
import PurchasingLayout from '../purchasing/layout';
import SalesLayout from '../sales/layout';
import WarehouseLayout from '../warehouse/layout';

vi.mock('@/auth', () => ({
    auth: async () => ({ user: { id: 'user-1', name: 'Test User' } }),
}));
vi.mock('next/navigation', () => ({
    redirect: (destination: string) => {
        throw new Error(`Unexpected redirect to ${destination}`);
    },
}));
let requestedPath = '/dashboard';
vi.mock('next/headers', () => ({
    headers: async () => ({ get: () => requestedPath }),
}));
vi.mock('@/actions/admin/permissions', () => ({
    getMyPermissions: async () => ({ success: true, data: 'ALL' }),
}));
vi.mock('@/lib/auth/access-policy', () => ({
    canAccessWorkspace: () => true,
    getPreferredWorkspaceLanding: () => '/dashboard',
    getTenantActiveModules: () => [],
    hasWorkspaceEntitlement: () => true,
    hasWorkspaceResourceAccess: () => true,
    isPathAllowedByResources: () => true,
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock('@/components/layout/path-breadcrumb', () => ({
    PathBreadCrumb: () => null,
}));
vi.mock('@/components/layout/sidebar-spacer', () => ({
    SidebarSpacer: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));
vi.mock('../kiosk/ClockDisplay', () => ({ ClockDisplay: () => null }));

vi.mock('@/components/layout/sidebar-nav', () => ({
    SidebarNav: () => <button type="button">Navigasi dashboard</button>,
}));
vi.mock('@/components/purchasing/purchasing-sidebar', () => ({
    PurchasingSidebar: () => <button type="button">Navigasi pembelian</button>,
}));
vi.mock('@/components/finance/finance-sidebar', () => ({
    FinanceSidebar: () => <button type="button">Navigasi keuangan</button>,
}));
vi.mock('@/components/sales/sales-sidebar', () => ({
    SalesSidebar: () => <button type="button">Navigasi penjualan</button>,
}));
vi.mock('@/components/production/production-sidebar', () => ({
    ProductionSidebar: () => <button type="button">Navigasi produksi</button>,
}));
vi.mock('@/components/warehouse/warehouse-sidebar', () => ({
    WarehouseSidebar: () => <button type="button">Navigasi gudang</button>,
}));
vi.mock('@/components/hrd/hrd-sidebar', () => ({
    HrdSidebar: () => <button type="button">Navigasi HRD</button>,
}));
vi.mock('@/components/maklon/maklon-sidebar', () => ({
    MaklonSidebar: () => <button type="button">Navigasi maklon</button>,
}));

const layouts = [
    ['dashboard', DashboardLayout],
    ['purchasing', PurchasingLayout],
    ['finance', FinanceLayout],
    ['sales', SalesLayout],
    ['production', ProductionLayout],
    ['warehouse', WarehouseLayout],
    ['hrd', HrdLayout],
    ['maklon', MaklonLayout],
] as const;

afterEach(() => {
    cleanup();
    requestedPath = '/dashboard';
});

describe('desktop workspace layout accessibility', () => {
    it.each(layouts)(
        '%s puts the skip link first and renders exactly one target main landmark',
        async (_name, Layout) => {
            render(await Layout({ children: <p>Isi halaman</p> }));

            const skipLink = screen.getByRole('link', {
                name: 'Lewati ke konten utama',
            });
            const focusableControls = document.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            const mainLandmarks = screen.getAllByRole('main');

            expect(focusableControls[0]).toBe(skipLink);
            expect(skipLink.getAttribute('href')).toBe('#main-content');
            expect(mainLandmarks).toHaveLength(1);
            expect(mainLandmarks[0].id).toBe('main-content');
            expect(mainLandmarks[0].getAttribute('tabindex')).toBe('-1');
        },
    );

    it.each([
        ['finance', FinanceLayout, '/finance/mobile'],
        ['HRD', HrdLayout, '/hrd/mobile'],
        ['production', ProductionLayout, '/production/mobile'],
        ['purchasing', PurchasingLayout, '/purchasing/mobile'],
    ] as const)(
        '%s parent delegates mobile chrome and main ownership to its nested layout',
        async (_name, Layout, pathname) => {
            requestedPath = pathname;
            render(
                await Layout({
                    children: <main id="nested-mobile-main">Isi mobile</main>,
                }),
            );

            expect(screen.getAllByRole('main')).toHaveLength(1);
            expect(screen.getByRole('main').id).toBe('nested-mobile-main');
            expect(
                screen.queryByRole('link', { name: 'Lewati ke konten utama' }),
            ).toBeNull();
        },
    );
});
