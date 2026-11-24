// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
    usePathname: () => '/sales',
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/layout/sidebar-collapse-context', () => ({
    useSidebarCollapse: () => ({ isCollapsed: false }),
}));
vi.mock('@/components/layout/admin-back-button', () => ({
    AdminBackButton: () => null,
}));
vi.mock('@/components/layout/portal-sidebar-base', () => ({
    PortalSidebarBase: ({ children }: { children: ReactNode }) => (
        <nav>{children}</nav>
    ),
}));

import { SalesSidebar } from '../sales-sidebar';

afterEach(cleanup);

describe('sales sidebar claim review entry', () => {
    it.each([['ADMIN'], ['MARKETING']])('shows "Klaim Reimburse" to %s', (role) => {
        render(
            <SalesSidebar user={{ role, roles: [role] }} permissions="ALL" />,
        );

        expect(
            screen.getByRole('link', { name: 'Klaim Reimburse' }).getAttribute('href'),
        ).toBe('/sales/claims');
    });

    it('hides it from SALES even with a broad grant', () => {
        render(
            <SalesSidebar
                user={{ role: 'SALES', roles: ['SALES'] }}
                permissions={['/sales']}
            />,
        );

        expect(screen.queryByRole('link', { name: 'Klaim Reimburse' })).toBeNull();
        expect(screen.getByRole('link', { name: 'Kunjungan' })).toBeTruthy();
    });

    it('shows it to a user who holds MARKETING as a secondary role', () => {
        render(
            <SalesSidebar
                user={{ role: 'SALES', roles: ['SALES', 'MARKETING'] }}
                permissions="ALL"
            />,
        );

        expect(screen.getByRole('link', { name: 'Klaim Reimburse' })).toBeTruthy();
    });
});
