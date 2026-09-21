// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { getProductionNavGroups, productionLinks } from '../production-sidebar';
import { ProductionOrderViews } from '../ProductionOrderViews';
import { getMyPermissions } from '@/actions/admin/permissions';

vi.mock('@/components/layout/portal-sidebar-base', () => ({ PortalSidebarBase: () => null }));
vi.mock('@/components/layout/portal-nav-item', () => ({ PortalNavGroup: () => null }));
vi.mock('@/components/layout/admin-back-button', () => ({ AdminBackButton: () => null }));
vi.mock('@/actions/admin/permissions', () => ({ getMyPermissions: vi.fn() }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('production work navigation', () => {
    it('groups SPK views once and preserves independent deep links', () => {
        const items = productionLinks.flatMap((group) => group.items);
        const spk = items.filter((item) => item.label === 'SPK');
        expect(spk).toHaveLength(1);
        expect(spk[0].children?.map((child) => [child.label, child.href])).toEqual([
            ['Daftar', '/production/orders'], ['Board Proses', '/production/daily'],
        ]);
        expect(items.some((item) => item.href === '/production/daily')).toBe(false);
    });

    it.each(['/production/daily', '/production/orders'])('preserves %s-only access including collapsed parent target', (href) => {
        const groups = getProductionNavGroups([href]);
        const items = groups.flatMap((group) => group.items);
        expect(items).toHaveLength(1);
        expect(items[0].href).toBe(href);
        expect(items[0].children?.map((child) => child.href)).toEqual([href]);
    });

    it('keeps all reports and evidence together without broadening costing access', () => {
        const reports = productionLinks.find((group) => group.heading === 'Laporan & Audit');
        expect(reports?.items.map((item) => item.href)).toEqual(expect.arrayContaining([
            '/production/daily-report', '/production/output-report', '/production/history',
            '/production/analytics', '/production/packing-monthly', '/production/costing',
        ]));
        const onlyHistory = getProductionNavGroups(['/production/history']);
        expect(onlyHistory).toHaveLength(1);
        expect(onlyHistory[0].heading).toBe('Laporan & Audit');
        expect(onlyHistory[0].items.map((item) => item.href)).toEqual(['/production/history']);
        expect(getProductionNavGroups([])).toEqual([]);
    });

    it('links Tim and Pengaturan Shift to distinct existing pages; all menu targets exist', () => {
        const items = productionLinks.flatMap((group) => group.items);
        expect(items.find((item) => item.label === 'Tim')?.href).toBe('/production/resources');
        expect(items.find((item) => item.label === 'Pengaturan Shift')?.href).toBe('/production/shifts');
        for (const item of items.flatMap((item) => [item, ...(item.children ?? [])])) {
            expect(existsSync(`src/app${item.href}/page.tsx`), item.href).toBe(true);
        }
    });

    it('renders accessible view links with the current view selected', async () => {
        vi.mocked(getMyPermissions).mockResolvedValue({ success: true, data: 'ALL' });
        render(await ProductionOrderViews({ current: 'board' }));
        expect(screen.getByRole('navigation', { name: 'Tampilan SPK' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Board Proses' }).getAttribute('aria-current')).toBe('page');
        expect(screen.getByRole('link', { name: 'Daftar' }).getAttribute('aria-current')).toBeNull();
    });

    it('hides an ungranted list view and fails closed on permissions lookup errors', async () => {
        vi.mocked(getMyPermissions).mockResolvedValue({ success: true, data: ['/production/daily'] });
        render(await ProductionOrderViews({ current: 'board' }));
        expect(screen.queryByRole('link', { name: 'Daftar' })).toBeNull();
        cleanup();
        vi.mocked(getMyPermissions).mockResolvedValue({ success: false, error: 'Unavailable', code: 'UNAVAILABLE' });
        render(await ProductionOrderViews({ current: 'list' }));
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
});
