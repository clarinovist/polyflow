// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PathBreadCrumb } from '../path-breadcrumb';
const route = vi.hoisted(() => ({ value: '/production/orders/create' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.value }));
describe('contextual order breadcrumb', () => {
    it('names production orders SPK without changing sales orders', () => {
        const { rerender } = render(<PathBreadCrumb />);
        expect(
            screen.getByRole('link', { name: 'SPK' }).getAttribute('href'),
        ).toBe('/production/orders');
        expect(screen.getByText('Buat SPK')).toBeTruthy();
        expect(screen.queryByText('Pesanan Penjualan')).toBeNull();
        route.value = '/sales/orders';
        rerender(<PathBreadCrumb />);
        expect(screen.getByText('Pesanan Penjualan')).toBeTruthy();
    });
});
