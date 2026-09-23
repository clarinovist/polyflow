// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PortalSidebarBase } from '../portal-sidebar-base';
import { SidebarNav } from '../sidebar-nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));
vi.mock('next/link', () => ({
    default: ({
        href,
        children,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock('@/components/auth/polyflow-logo', () => ({
    default: () => <span>PolyFlow</span>,
}));
vi.mock('@/components/layout/GlobalSearch', () => ({
    GlobalSearch: () => null,
}));
vi.mock('@/components/layout/theme-provider', () => ({
    useTheme: () => ({
        theme: 'light',
        resolvedTheme: 'light',
        setTheme: vi.fn(),
    }),
}));
vi.mock('@/components/layout/sidebar-collapse-context', () => ({
    useSidebarCollapse: () => ({ isCollapsed: false, toggle: vi.fn() }),
}));
vi.mock('@/lib/modules/module-registry', () => ({
    resolvePathToModule: () => null,
}));

describe('sidebar navigation landmarks', () => {
    it.each(['finance', 'sales'] as const)('reserves %s assistant slots outside the scrollable navigation', (portal) => {
        const { container } = render(
            <PortalSidebarBase user={{ name: 'Synthetic user' }} portalName={portal} assistantSlots assistantSlotPrefix={portal}>
                <a href={`/${portal}`}>Beranda</a>
            </PortalSidebarBase>,
        );
        const desktop = container.querySelector(`#${portal}-assistant-desktop`);
        const mobile = container.querySelector(`#${portal}-assistant-mobile`);
        expect(desktop).toBeTruthy();
        expect(mobile).toBeTruthy();
        expect(desktop?.closest('nav')).toBeNull();
        expect(mobile?.closest('header')).toBeTruthy();
    });

    it('names the dashboard navigation landmark', () => {
        render(
            <SidebarNav
                user={{ name: 'Test User' }}
                permissions="ALL"
            />,
        );

        expect(
            screen.getByRole('navigation', { name: 'Navigasi utama' }),
        ).toBeTruthy();
        expect(screen.queryByRole('link', { name: 'Catatan CEO' })).toBeNull();
        expect(document.querySelector('a[href="/ceo-notes"]')).toBeNull();
    });

    it('uses the portal name for each portal navigation landmark', () => {
        render(
            <PortalSidebarBase
                user={{ name: 'Test User' }}
                portalName="Pembelian"
            >
                <a href="/purchasing">Pesanan</a>
            </PortalSidebarBase>,
        );

        expect(
            screen.getByRole('navigation', {
                name: 'Navigasi Pembelian',
            }),
        ).toBeTruthy();
    });
});
