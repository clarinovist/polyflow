// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KioskPackagingPanel } from '../KioskPackagingPanel';
import type { KioskPackagingContext } from '@/lib/production/kiosk-packaging';

afterEach(cleanup);

const context: KioskPackagingContext = {
    enabled: true,
    baseVariantId: 'base',
    fixedBrandId: null,
    brands: [{ id: 'base', name: 'Produk dasar', labelVariantId: null, labelName: null }],
    plannedPackagingIds: [],
    stock: [
        { id: 's1', productVariantId: 'label', name: 'Etiket A', unit: 'PCS', locationId: 'pack', locationName: 'Gudang Kemasan', ownerCustomerId: null, ownerName: null, quantity: 3200 },
        { id: 's2', productVariantId: 'sack', name: 'Karung', unit: 'PCS', locationId: 'pack', locationName: 'Gudang Kemasan', ownerCustomerId: null, ownerName: null, quantity: 5 },
    ],
    usage: [
        { productVariantId: 'label', name: 'Etiket A', unit: 'PCS', quantity: 790, lastSourceLocationId: 'pack' },
        { productVariantId: 'sack', name: 'Karung', unit: 'PCS', quantity: 16, lastSourceLocationId: 'pack' },
    ],
    producedBaseQty: 80,
};

describe('KioskPackagingPanel', () => {
    it('shows usage on this SPK, stock and the estimated remaining need', () => {
        render(<KioskPackagingPanel context={context} isLoading={false} error="" onRetry={() => {}} remainingBaseQty={120} />);

        const label = screen.getByRole('listitem', { name: 'Etiket A' });
        expect(label.textContent).toContain('790');
        expect(label.textContent).toContain('3.200');
        expect(label.textContent).toContain('±1.185');
        expect(screen.getByRole('listitem', { name: 'Karung' }).textContent).toMatch(/Stok kurang/);
        expect(screen.getByText('Stok menipis')).toBeTruthy();
        expect(screen.getByText(/hanya untuk cek stok/)).toBeTruthy();
    });

    it('says stock is enough when every item lasts', () => {
        const plenty = { ...context, stock: context.stock.map((row) => ({ ...row, quantity: 5000 })) };
        render(<KioskPackagingPanel context={plenty} isLoading={false} error="" onRetry={() => {}} remainingBaseQty={120} />);

        expect(screen.getByText('Stok cukup')).toBeTruthy();
    });

    it('explains an SPK without recorded packaging yet', () => {
        render(<KioskPackagingPanel context={{ ...context, usage: [], producedBaseQty: 0 }} isLoading={false} error="" onRetry={() => {}} remainingBaseQty={200} />);

        expect(screen.getByText(/Belum ada pemakaian kemasan/)).toBeTruthy();
    });

    it('shows loading and lets the operator retry after an error', () => {
        const onRetry = vi.fn();
        const { rerender } = render(<KioskPackagingPanel context={null} isLoading error="" onRetry={onRetry} remainingBaseQty={0} />);
        expect(screen.getByRole('status').textContent).toMatch(/Memuat/);

        rerender(<KioskPackagingPanel context={null} isLoading={false} error="Gagal memuat." onRetry={onRetry} remainingBaseQty={0} />);
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(onRetry).toHaveBeenCalled();
    });
});
