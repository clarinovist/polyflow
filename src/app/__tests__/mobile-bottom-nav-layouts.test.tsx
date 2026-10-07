// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinanceMobileLayout from '../finance/mobile/layout';
import HrdMobileLayout from '../hrd/mobile/layout';
import ProductionMobileLayout from '../production/mobile/layout';
import PurchasingMobileLayout from '../purchasing/mobile/layout';

let pathname = '/finance/mobile';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/auth', () => ({
    auth: async () => ({ user: { id: 'synthetic', role: 'PRODUCTION' } }),
}));
vi.mock('@/lib/mobile/mobile-portal-page-access', () => ({
    requireMobilePortalPageAccess: vi.fn().mockResolvedValue({}),
}));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));
vi.mock('@/components/mobile', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/components/mobile')>();
    return {
        ...actual,
        MobileConnectivityBanner: () => null,
    };
});

const layouts = [
    [
        'finance',
        FinanceMobileLayout,
        'Navigasi finance mobile',
        '/finance/mobile',
        'finance-mobile-content',
    ],
    ['HRD', HrdMobileLayout, 'Navigasi HRD mobile', '/hrd/mobile', 'hrd-mobile-content'],
    [
        'produksi',
        ProductionMobileLayout,
        'Navigasi produksi mobile',
        '/production/mobile',
        'production-mobile-content',
    ],
    [
        'purchasing',
        PurchasingMobileLayout,
        'Navigasi purchasing mobile',
        '/purchasing/mobile',
        'purchasing-mobile-content',
    ],
] as const;

describe('mobile portal bottom navigation safety', () => {
    beforeEach(() => {
        pathname = '/finance/mobile';
    });

    it.each(layouts)(
        '%s reserves nav and safe-area space with touch-sized destinations',
        async (_name, Layout, navLabel, rootPath, mainId) => {
            pathname = rootPath;
            const { container } = render(
                await Layout({
                    children: <button type="button">Aksi terakhir</button>,
                }),
            );

            const shell = container.firstElementChild;
            expect(shell?.className).toContain(
                'pb-[calc(5rem+env(safe-area-inset-bottom))]',
            );
            const main = screen.getByRole('main');
            expect(main.id).toBe(mainId);
            const nav = screen.getByRole('navigation', { name: navLabel });
            expect(nav.className).toContain(
                'pb-[calc(0.5rem+env(safe-area-inset-bottom))]',
            );
            expect(nav.className).toContain('z-50');
            const navLinks = screen
                .getAllByRole('link')
                .filter((link) => link.closest('nav') === nav);
            for (const link of navLinks) {
                expect(link.className).toContain('min-h-11');
            }
            expect(
                navLinks.filter(
                    (link) => link.getAttribute('aria-current') === 'page',
                ),
            ).toHaveLength(1);
            expect(screen.getByRole('button', { name: 'Aksi terakhir' })).toBeTruthy();
        },
    );

    it.each([
        ['/production/mobile/tasks/new', '/production/mobile/tasks'],
        [
            '/production/mobile/maintenance/request-1',
            '/production/mobile/maintenance',
        ],
    ])(
        'marks only the matching nested destination as current for %s',
        async (currentPath, expectedHref) => {
            pathname = currentPath;
            render(
                await ProductionMobileLayout({
                    children: <p>Halaman produksi</p>,
                }),
            );

            const nav = screen.getByRole('navigation', {
                name: 'Navigasi produksi mobile',
            });
            const currentLinks = screen
                .getAllByRole('link')
                .filter(
                    (link) =>
                        link.closest('nav') === nav &&
                        link.getAttribute('aria-current') === 'page',
                );
            expect(currentLinks).toHaveLength(1);
            expect(currentLinks[0].getAttribute('href')).toBe(expectedHref);
        },
    );
});
