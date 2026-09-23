// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ path: '/sales/orders/create' }));
vi.mock('next/navigation', () => ({ usePathname: () => state.path, useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/layout/sidebar-collapse-context', () => ({ useSidebarCollapse: () => ({ isCollapsed: false }) }));
vi.mock('@/components/layout/admin-back-button', () => ({ AdminBackButton: () => null }));
vi.mock('@/components/layout/portal-sidebar-base', () => ({ PortalSidebarBase: ({ children, assistantSlots, assistantSlotPrefix }: { children: ReactNode; assistantSlots: boolean; assistantSlotPrefix: string }) => <nav data-assistant={assistantSlots ? assistantSlotPrefix : undefined}>{children}</nav> }));
import { SalesSidebar } from '../sales-sidebar';
afterEach(cleanup);
describe('sales navigation refresh', () => {
    it.each(['/sales/orders/create', '/sales/delivery-schedules/fixture'])('highlights only the relevant entry at %s and keeps quotation pipeline', (path) => {
        state.path = path;
        render(<SalesSidebar user={{}} permissions="ALL" />);
        expect(screen.queryByRole('link', { name: 'Penawaran' })).toBeNull();
        expect(screen.getByRole('link', { name: 'Pipeline Penawaran' })).toBeTruthy();
        const dashboard = screen.getByRole('link', { name: 'Papan Sales' });
        expect(dashboard.className).not.toContain('border-blue-100');
        const active = screen.getAllByRole('link').filter((link) => link.className.includes('border-blue-100'));
        expect(active).toHaveLength(1);
        expect(active[0].getAttribute('href')).toBe(path.includes('delivery-schedules') ? '/sales/delivery-schedules' : '/sales/orders');
        expect(screen.getByRole('navigation').getAttribute('data-assistant')).toBe('sales');
    });
});
