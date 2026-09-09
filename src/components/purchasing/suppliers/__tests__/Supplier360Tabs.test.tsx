// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Supplier360Tabs } from '../Supplier360Tabs';
import type { SupplierProductSummary } from '@/services/purchasing/supplier-products-service';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
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
    hasReceiptHistory: true, lastReceiptUnitCost: 125.5,
    productVariant: { name: 'Varian A', skuCode: 'SKU-A', product: { name: 'Bahan A' } },
};
function show(products: SupplierProductSummary[], initialTab = 'products') {
    return render(<Supplier360Tabs supplier={supplier} supplierProducts={products} initialTab={initialTab} />);
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('supplier supplied products', () => {
    it('shows receipt-only SKU, cost source and no unlink action', () => {
        show([product]);
        expect(screen.getByRole('tab', { name: 'Produk (1)' })).toBeDefined();
        expect(screen.getByText('Barang masuk')).toBeDefined();
        expect(screen.getByText('SKU-A')).toBeDefined();
        expect(screen.getByText('125.5')).toBeDefined();
        expect(screen.getByText('Biaya penerimaan terakhir')).toBeDefined();
        expect(screen.queryByRole('button', { name: /Unlink/ })).toBeNull();
        expect(screen.getByText(/Melepas tautan manual tidak menghapus/)).toBeDefined();
    });

    it('renders one row for a linked-and-received SKU with actual mapping ID for unlink', () => {
        show([{ ...product, linkId: 'mapping-1', isPreferred: true, unitPrice: 200, leadTimeDays: 3, minOrderQty: 5 }]);
        expect(screen.getAllByRole('row')).toHaveLength(2);
        expect(screen.getByText('Manual')).toBeDefined();
        expect(screen.getByText('Barang masuk')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Unlink mapping-1' })).toBeDefined();
        expect(screen.getByText('200')).toBeDefined();
        expect(screen.queryByText('125.5')).toBeNull();
        expect(screen.queryByText('Biaya penerimaan terakhir')).toBeNull();
        expect(screen.getByText('3 hari')).toBeDefined();
    });

    it('retains manual-only products and distinguishes missing values from zero', () => {
        show([
            { ...product, hasReceiptHistory: false, lastReceiptUnitCost: null, linkId: 'mapping-1', unitPrice: 0, leadTimeDays: 0, minOrderQty: 0 },
            { ...product, id: 'variant-2', hasReceiptHistory: false, lastReceiptUnitCost: null, linkId: 'mapping-2' },
        ]);
        const rows = screen.getAllByRole('row');
        expect(within(rows[1]).getAllByText('0')).toHaveLength(2);
        expect(within(rows[1]).getByText('0 hari')).toBeDefined();
        expect(within(rows[2]).getAllByText('-')).toHaveLength(3);
        expect(screen.queryByText('Barang masuk')).toBeNull();
    });

    it('renders a zero-cost receipt as zero, not unknown', () => {
        show([{ ...product, lastReceiptUnitCost: 0 }]);
        expect(screen.getByText('0')).toBeDefined();
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
        expect(replace).toHaveBeenCalledWith(expect.stringContaining('tab=products'), { scroll: false });
    });

    it('retains complete overview details', () => {
        render(<Supplier360Tabs supplier={{
            ...supplier, isActive: false, code: 'SUP-1', email: 'contact@example.test',
            phone: '123', address: 'Alamat contoh', taxId: 'TAX-1', paymentTermDays: 30,
            bankName: 'Bank A', bankAccount: 'ACC-1', notes: 'Catatan supplier',
        }} supplierProducts={[]} initialTab="" />);
        for (const text of ['SUP-1', 'Nonaktif', 'contact@example.test', '123', 'Alamat contoh', 'TAX-1', '30 Hari', 'Bank A', 'ACC-1', 'Catatan supplier']) {
            expect(screen.getByText(text)).toBeDefined();
        }
    });

    it.each([
        ['orders', 'Order content'], ['returns', 'Retur content'], ['payments', 'Hutang content'],
        ['performance', 'Performa content'], ['analytics', 'Analitik content'],
    ])('preserves %s tab', (tab, content) => {
        show([], tab);
        expect(screen.getByText(content)).toBeDefined();
    });
});
