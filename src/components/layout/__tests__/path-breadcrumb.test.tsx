// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PathBreadCrumb } from '../path-breadcrumb';
const route = vi.hoisted(() => ({ value: '/production/orders/create' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.value }));
afterEach(cleanup);
describe('contextual order breadcrumb', () => {
    it.each([
        ['inventory', 'Stok Lantai'], ['requests', 'Permintaan Barang Jadi'],
        ['machines', 'Status Mesin'], ['shifts', 'Pengaturan Shift'],
        ['history', 'Log Hasil'], ['analytics', 'Analitik Produksi'],
        ['material-orders', 'Permintaan Bahan'],
    ])('uses production-specific label for %s', (segment, label) => {
        route.value = '/production/' + segment;
        const { rerender } = render(<PathBreadCrumb />);
        expect(screen.getByText(label)).toBeTruthy();
        route.value = '/warehouse/inventory'; rerender(<PathBreadCrumb />);
        expect(screen.getByText('Stok')).toBeTruthy();
        expect(screen.queryByText('Stok Lantai')).toBeNull();
    });
    it('names production orders SPK without changing sales orders', () => {
        route.value = '/production/orders/create';
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
