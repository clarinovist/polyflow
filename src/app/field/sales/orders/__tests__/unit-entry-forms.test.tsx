// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickOrderWizard } from '../create/QuickOrderWizard';
import { EditOrderClient } from '../[id]/edit/EditOrderClient';
import { salesEntryForEdit } from '@/lib/sales/unit-entry';
import type { ComponentProps } from 'react';
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), quick: vi.fn(), push: vi.fn(), error: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, back: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/actions/sales/sales', () => ({ createSalesOrder: mocks.create }));
vi.mock('@/actions/sales/field-actions', () => ({ updateFieldSalesOrder: mocks.update }));
vi.mock('@/actions/sales/customer', () => ({ quickCreateCustomer: vi.fn() }));
vi.mock('@/actions/product', () => ({ quickCreateProduct: mocks.quick }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
const units = { primaryUnit: 'KG' as const, salesUnit: 'BAL' as const, conversionFactor: 25 };
const product = { id: 'v', name: 'Contoh 15', productName: 'Produk Contoh', skuCode: 'FIXTURE-15', sellPrice: 18500, ...units, inventories: [{ locationId: 'loc', quantity: 1250 }] };
const customer = { id: 'c', name: 'Customer Contoh', code: 'FIXTURE', creditLimit: null, paymentTermDays: null };
const date = '2026-10-23T00:00:00.000Z';
function order(extra: Record<string, unknown> = {}): ComponentProps<typeof EditOrderClient>['order'] {
    const persisted = { quantity: 50, unitPrice: 18500, enteredQuantity: 2, enteredUnit: 'BAL', enteredUnitPrice: 462500, conversionFactorSnapshot: 25, ...extra };
    return { id: 'so', orderNumber: 'SO-FIXTURE', expectedUpdatedAt: date, status: 'CONFIRMED', customerName: customer.name, customerId: customer.id, salesRepId: null, sourceLocationId: '', orderDate: date, expectedDate: null, notes: '', shippingCost: 0, hasInvoices: false,
        items: [{ id: 'line', productVariantId: 'v', productName: product.productName, variantName: product.name, ...salesEntryForEdit({ ...persisted, productVariant: product }), units, subtotal: 925000, discountPercent: 0, taxPercent: 0, dppOtherAmount: null, ppnMode: 'EXCLUDE', isFreeItem: false, deliveredQty: 0 }],
    };
}
function wizard() { render(<QuickOrderWizard customers={[customer]} products={[product]} locations={[]} preselectedCustomerId="c" />); }
function click(name: string) { fireEvent.click(screen.getAllByRole('button', { name })[0]); }
function number(name: string, value: string) { const el = screen.getByRole('spinbutton', { name }); fireEvent.change(el, { target: { value } }); fireEvent.blur(el); }
async function pick() { click('Selanjutnya'); fireEvent.click(screen.getByRole('button', { name: /Produk Contoh - Contoh 15/ })); }
function submitCreate() { click('Review Order'); click('Buat Order'); }
beforeEach(() => {
    vi.clearAllMocks(); mocks.create.mockResolvedValue({ success: true }); mocks.update.mockResolvedValue({ success: true });
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('actual Sales Field wizard/edit UOM boundaries', () => {
    it('wizard defaults to labelled KG, converts both fields, and submits complete BAL snapshot', async () => {
        wizard(); await pick();
        number('Jumlah (KG)', '100');
        fireEvent.change(screen.getByRole('combobox', { name: 'Satuan item 1' }), { target: { value: 'BAL' } });
        expect(screen.getByRole('spinbutton', { name: 'Jumlah (BAL)' })).toHaveProperty('value', '4');
        expect(screen.getByRole('spinbutton', { name: 'Harga per BAL' })).toHaveProperty('value', '462500');
        submitCreate(); await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
        expect(mocks.create.mock.calls[0][0].items[0]).toMatchObject({ quantity: 100, unitPrice: 18500, enteredQuantity: 4, enteredUnit: 'BAL', enteredUnitPrice: 462500, conversionFactorSnapshot: 25 });
    });
    it('wizard accepts fractional KG and rejects lossy BAL snapshots without calling server', async () => {
        wizard(); await pick(); number('Jumlah (KG)', '.5'); submitCreate();
        await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
        expect(mocks.create.mock.calls[0][0].items[0]).toMatchObject({ quantity: .5, enteredUnit: 'KG', conversionFactorSnapshot: 1 });
        cleanup(); vi.clearAllMocks(); wizard(); await pick(); number('Jumlah (KG)', '1.001');
        fireEvent.change(screen.getByRole('combobox', { name: 'Satuan item 1' }), { target: { value: 'BAL' } });
        submitCreate(); await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('disimpan tepat')));
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('wizard rejects positive quantities below storage precision instead of saving zero', async () => {
        wizard(); await pick(); number('Jumlah (KG)', '0.0000000001'); submitCreate();
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('terlalu kecil')));
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('quick-create returns a complete primary-unit snapshot instead of a display-only cast', async () => {
        mocks.quick.mockResolvedValue({ success: true, data: { id: 'new', name: 'New Product', productName: 'New Product', skuCode: 'NEW01', sellPrice: 1200, displayUnit: 'KG', inventories: [] } });
        wizard(); click('Selanjutnya'); click('Tambah Produk Baru');
        fireEvent.change(screen.getByPlaceholderText('Contoh: Rafia Hitam'), { target: { value: 'New Product' } });
        fireEvent.change(screen.getByPlaceholderText('RFH001'), { target: { value: 'NEW01' } });
        click('Simpan Produk');
        await waitFor(() => expect(screen.getByRole('spinbutton', { name: 'Jumlah (KG)' })).toBeTruthy());
        submitCreate(); await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
        expect(mocks.create.mock.calls[0][0].items[0]).toMatchObject({ productVariantId: 'new', quantity: 1, unitPrice: 1200, enteredQuantity: 1, enteredUnitPrice: 1200, enteredUnit: 'KG', conversionFactorSnapshot: 1 });
    });
    it('edit round-trips original snapshots and version; toggles retain base quantities', async () => {
        render(<EditOrderClient order={order()} products={[product]} />);
        fireEvent.change(screen.getByRole('combobox', { name: 'Satuan item 1' }), { target: { value: 'KG' } });
        expect(screen.getByRole('spinbutton', { name: 'Jumlah (KG)' })).toHaveProperty('value', '50');
        click('Simpan Perubahan'); await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
        expect(mocks.update.mock.calls[0][0]).toMatchObject({ expectedUpdatedAt: new Date(date), items: [{ id: 'line', quantity: 50, unitPrice: 18500, enteredUnit: 'KG', conversionFactorSnapshot: 1 }] });
    });
    it('edit preserves rounded historical prices and legacy no-snapshot values', async () => {
        const rounded = order({ quantity: 3, unitPrice: 33.33, enteredQuantity: 1, enteredUnitPrice: 100, conversionFactorSnapshot: 3 });
        rounded.items[0].subtotal = 100;
        render(<EditOrderClient order={rounded} products={[{ ...product, salesUnit: 'ZAK', conversionFactor: 50 }]} />);
        expect(screen.getByRole('combobox', { name: 'Satuan item 1' })).toHaveProperty('value', 'BAL');
        fireEvent.change(screen.getByRole('combobox', { name: 'Satuan item 1' }), { target: { value: 'KG' } });
        fireEvent.change(screen.getByRole('combobox', { name: 'Satuan item 1' }), { target: { value: 'BAL' } });
        expect(screen.getByRole('spinbutton', { name: 'Harga per BAL' })).toHaveProperty('value', '100');
        click('Simpan Perubahan'); await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
        expect(mocks.update.mock.calls[0][0].items[0]).toMatchObject({ quantity: 3, unitPrice: 33.33, enteredUnit: 'BAL', enteredUnitPrice: 100, conversionFactorSnapshot: 3 });
        cleanup(); vi.clearAllMocks();
        render(<EditOrderClient order={order({ enteredQuantity: null, enteredUnit: null, enteredUnitPrice: null, conversionFactorSnapshot: null })} products={[product]} />);
        expect(screen.getByRole('spinbutton', { name: 'Jumlah (KG)' })).toHaveProperty('value', '50');
        click('Simpan Perubahan'); await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
        expect(mocks.update.mock.calls[0][0].items[0]).toMatchObject({ quantity: 50, unitPrice: 18500, enteredUnit: undefined });
    });
    it('unit round-trip never restores old values after an actual price edit', async () => {
        const rounded = order({ quantity: 3, unitPrice: 33.33, enteredQuantity: 1, enteredUnitPrice: 100, conversionFactorSnapshot: 3 });
        render(<EditOrderClient order={rounded} products={[product]} />);
        fireEvent.change(screen.getByRole('combobox', { name: 'Satuan item 1' }), { target: { value: 'KG' } });
        number('Harga per KG', '34');
        fireEvent.change(screen.getByRole('combobox', { name: 'Satuan item 1' }), { target: { value: 'BAL' } });
        expect(screen.getByRole('spinbutton', { name: 'Harga per BAL' })).toHaveProperty('value', '102');
        click('Simpan Perubahan'); await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
        expect(mocks.update.mock.calls[0][0].items[0]).toMatchObject({ quantity: 3, unitPrice: 34, enteredUnitPrice: 102 });
    });
    it('locks units/prices for delivered lines and checks delivered minimum in KG, not BAL', async () => {
        const o = order(); o.items[0].deliveredQty = 25;
        render(<EditOrderClient order={o} products={[product]} />);
        expect(screen.getByRole('combobox', { name: 'Satuan item 1' })).toHaveProperty('disabled', true);
        expect(screen.getByRole('spinbutton', { name: 'Harga per BAL' })).toHaveProperty('disabled', true);
        number('Jumlah (BAL)', '1'); click('Simpan Perubahan');
        await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
        expect(mocks.update.mock.calls[0][0].items[0].quantity).toBe(25);
        mocks.update.mockClear(); number('Jumlah (BAL)', '.5'); click('Simpan Perubahan');
        expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('tidak boleh kurang'));
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('adds another line for the same product without corrupting original item identity', async () => {
        render(<EditOrderClient order={order()} products={[product]} />);
        const picker = screen.getByRole('combobox', { name: '' });
        fireEvent.click(picker);
        fireEvent.click(await screen.findByRole('option', { name: 'Produk Contoh — Contoh 15' }));
        click('Simpan Perubahan'); await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
        const lines = mocks.update.mock.calls[0][0].items;
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatchObject({ id: 'line', enteredUnit: 'BAL', quantity: 50 });
        expect(lines[1]).toMatchObject({ quantity: 1, unitPrice: 18500, enteredUnit: 'KG', conversionFactorSnapshot: 1 });
        expect(lines[1].id).toBeUndefined();
    });
    it('preserves scoped-action errors without navigating on stale edit', async () => {
        mocks.update.mockResolvedValue({ success: false, error: 'SO telah berubah. Muat ulang.' });
        const o = order(); o.hasInvoices = true;
        render(<EditOrderClient order={o} products={[product]} />);
        expect(screen.getByRole('combobox', { name: 'Satuan item 1' })).toHaveProperty('disabled', true);
        click('Simpan Perubahan'); await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('SO telah berubah. Muat ulang.'));
        expect(mocks.push).not.toHaveBeenCalled();
    });
});
