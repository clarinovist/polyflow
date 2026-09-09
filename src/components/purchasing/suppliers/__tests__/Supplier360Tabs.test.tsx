// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Supplier360Tabs } from '../Supplier360Tabs';
import type { SupplierProductSummary } from '@/services/purchasing/supplier-products-service';

import { installHistoryIntegration } from '@/components/shared/partner-detail/__tests__/navigation-mock';
vi.mock('next/navigation', async () => {
    const { useTestSearchParams } = await import('@/components/shared/partner-detail/__tests__/navigation-mock');
    return { useSearchParams: useTestSearchParams };
});
vi.mock('../LinkProductDialog', () => ({ LinkProductDialog: () => <button>Tautkan produk</button> }));
vi.mock('../UnlinkProductButton', () => ({ UnlinkProductButton: ({ id }: { id: string }) => <button>Unlink {id}</button> }));
vi.mock('../360/SupplierOrdersTab', () => ({ SupplierOrdersTab: () => <div>Order content</div> }));
vi.mock('../360/SupplierReturnsTab', () => ({ SupplierReturnsTab: () => <div>Retur content</div> }));
vi.mock('../360/SupplierPaymentsTab', () => ({ SupplierPaymentsTab: () => <div>Hutang content</div> }));
vi.mock('../360/SupplierPerformanceTab', () => ({ SupplierPerformanceTab: () => <div>Performa content</div> }));
vi.mock('../360/SupplierAnalyticsTab', () => ({ SupplierAnalyticsTab: () => <div>Analitik content</div> }));

const supplier = { id: 'supplier-1', name: 'Supplier A', isActive: true };
const product: SupplierProductSummary = {
    id: 'variant-1', linkId: null, isPreferred: false,
    unitPrice: null, leadTimeDays: null, minOrderQty: null,
    hasReceiptHistory: true, lastReceiptUnitCost: 9000,
    productVariant: { name: 'Varian A', skuCode: 'SKU-A', product: { name: 'Bahan A' } },
};
function show(products: SupplierProductSummary[], initialTab = 'products') {
    window.history.replaceState(null, '', `/purchasing/suppliers/supplier-1?tab=${initialTab}`);
    return render(<Supplier360Tabs supplier={supplier} supplierProducts={products} initialTab={initialTab} />);
}
beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/purchasing/suppliers/supplier-1');
    installHistoryIntegration();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('supplier supplied products', () => {
    it('shows receipt-only SKU, cost source and no unlink action', () => {
        show([product]);
        expect(screen.getByRole('tab', { name: 'Produk (1)' })).toBeDefined();
        expect(screen.getByText('Barang masuk')).toBeDefined();
        expect(screen.getByText('SKU-A')).toBeDefined();
        expect(screen.getByText('Rp 9.000')).toBeDefined();
        expect(document.querySelector('.lucide-dollar-sign')).toBeNull();
        expect(screen.queryByText(/\$/)).toBeNull();
        expect(screen.getByText('Biaya penerimaan terakhir')).toBeDefined();
        expect(screen.queryByRole('button', { name: /Unlink/ })).toBeNull();
        expect(screen.getByText(/Melepas tautan manual tidak menghapus/)).toBeDefined();
    });

    it('renders one row for a linked-and-received SKU with actual mapping ID for unlink', () => {
        show([{ ...product, linkId: 'mapping-1', isPreferred: true, unitPrice: 1250000, leadTimeDays: 3, minOrderQty: 5 }]);
        expect(screen.getAllByRole('row')).toHaveLength(2);
        expect(screen.getByText('Manual')).toBeDefined();
        expect(screen.getByText('Barang masuk')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Unlink mapping-1' })).toBeDefined();
        expect(screen.getByText('Rp 1.250.000')).toBeDefined();
        expect(screen.queryByText('Rp 9.000')).toBeNull();
        expect(screen.queryByText('Biaya penerimaan terakhir')).toBeNull();
        expect(screen.getByText('3 hari')).toBeDefined();
    });

    it('retains manual-only products and distinguishes missing values from zero', () => {
        show([
            { ...product, hasReceiptHistory: false, lastReceiptUnitCost: null, linkId: 'mapping-1', unitPrice: 0, leadTimeDays: 0, minOrderQty: 0 },
            { ...product, id: 'variant-2', hasReceiptHistory: false, lastReceiptUnitCost: null, linkId: 'mapping-2' },
        ]);
        const rows = screen.getAllByRole('row');
        expect(within(rows[1]).getByText('Rp 0')).toBeDefined();
        expect(within(rows[1]).getByText('0')).toBeDefined();
        expect(within(rows[1]).getByText('0 hari')).toBeDefined();
        expect(within(rows[2]).getAllByText('-')).toHaveLength(3);
        expect(screen.queryByText('Barang masuk')).toBeNull();
    });

    it('renders a zero-cost receipt as zero, not unknown', () => {
        show([{ ...product, lastReceiptUnitCost: 0 }]);
        expect(screen.getByText('Rp 0')).toBeDefined();
        expect(screen.getByText('Biaya penerimaan terakhir')).toBeDefined();
    });

    it('shows honest empty state only when the merged list is empty', () => {
        show([]);
        expect(screen.getByRole('tab', { name: 'Produk (0)' })).toBeDefined();
        expect(screen.getByText('Belum ada tautan produk atau riwayat barang masuk dari supplier ini.')).toBeDefined();
    });

    it('keeps overview and products tab counts consistent and supports tab navigation', () => {
        show([product], 'overview');
        expect(screen.getByText('1')).toBeDefined();
        expect(screen.getByText('Produk / Varian')).toBeDefined();
        expect(screen.queryByText('Produk Aktif')).toBeNull();
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Produk (1)' }), { button: 0, ctrlKey: false });
        expect(screen.getByText('SKU-A')).toBeDefined();
        expect(window.location.search).toBe('?tab=products');
    });

    it('retains complete overview details', () => {
        render(<Supplier360Tabs supplier={{
            ...supplier, isActive: false, code: 'SUP-1', email: 'contact@example.test',
            phone: '123', address: 'Alamat contoh', taxId: 'TAX-1', paymentTermDays: 30,
            bankName: 'Bank A', bankAccount: 'ACC-1', notes: 'Catatan supplier',
        }} supplierProducts={[]} initialTab="" />);
        fireEvent.click(screen.getByRole('button', { name: 'Profil supplier' }));
        for (const text of ['SUP-1', 'Nonaktif', 'contact@example.test', '123', 'Alamat contoh', 'TAX-1', '30 Hari', 'Bank A', 'ACC-1', 'Catatan supplier']) {
            expect(screen.getByText(text)).toBeDefined();
        }
    });

    it('groups navigation into five tabs and keeps profile across subtab changes', () => {
        show([product], 'returns');
        expect(screen.getByRole('tab', { name: 'Transaksi' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('tab', { name: 'Retur' }).getAttribute('aria-selected')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'Profil supplier' }));
        const panel = screen.getByRole('complementary', { name: 'Profil supplier' });
        expect(within(panel).getByText('Rekening bank')).toBeDefined();
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Kinerja' }), { button: 0, ctrlKey: false });
        expect(screen.getByText('Performa content')).toBeDefined();
        expect(within(panel).getByText('Rekening bank')).toBeDefined();
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Analitik' }), { button: 0, ctrlKey: false });
        expect(window.location.search).toBe('?tab=analytics');
        expect(screen.getByText('Analitik content')).toBeDefined();
        expect(within(screen.getByRole('tablist', { name: 'Bagian detail' })).getAllByRole('tab')).toHaveLength(5);
    });

    it('falls back from unknown legacy tab and opens finance from overview', () => {
        show([], 'unknown');
        expect(screen.getByText('Sekilas hubungan bisnis')).toBeDefined();
        expect(screen.getByText('Order content')).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: /Utang supplier/ }));
        expect(screen.getByText('Hutang content')).toBeDefined();
        expect(window.location.search).toBe('?tab=payments');
    });

    it.each([
        ['orders', 'Order content'], ['returns', 'Retur content'], ['payments', 'Hutang content'],
        ['performance', 'Performa content'], ['analytics', 'Analitik content'],
    ])('preserves %s tab', (tab, content) => {
        show([], tab);
        expect(screen.getByText(content)).toBeDefined();
    });
});
