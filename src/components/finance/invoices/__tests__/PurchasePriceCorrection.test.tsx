// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    load: vi.fn(),
    preview: vi.fn(),
    post: vi.fn(),
    refresh: vi.fn(),
    success: vi.fn(),
}));
vi.mock('@/actions/finance/purchase-price-correction', () => ({
    getFinancePurchasePriceCorrectionContext: mocks.load,
    previewFinancePurchasePriceCorrection: mocks.preview,
    postFinancePurchasePriceCorrection: mocks.post,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success } }));

import { PurchasePriceCorrection } from '../PurchasePriceCorrection';
import { FinancialPurchaseInvoiceDetail } from '../FinancialPurchaseInvoiceDetail';

const previewData = {
    invoiceId: 'invoice-example',
    purchaseOrderId: 'order-example',
    purchaseOrderItemId: 'item-example',
    name: 'Bahan contoh',
    skuCode: 'SYNTHETIC-MATERIAL',
    oldUnitPrice: '100.0000',
    newUnitPrice: '120.0000',
    oldNetUnitCost: '100.0000',
    newNetUnitCost: '120.0000',
    sourceFingerprint: 'b'.repeat(64),
    billTotalBefore: '1110.00',
    billTotalAfter: '1332.00',
    billTotalDelta: '222.00',
    billNetDelta: '200.00',
    billTaxDelta: '22.00',
    receiptAmount: '200.00',
    inventoryAmount: '80.00',
    varianceAmount: '120.00',
    locations: [
        {
            locationId: 'location-example-a',
            locationName: 'Gudang Contoh A',
            skuCode: 'SYNTHETIC-MATERIAL',
            receivedQuantity: '6.0000',
            stockQuantity: '3.0000',
            retainedQuantity: '3.0000',
            receiptAmount: '120.00',
            inventoryAmount: '60.00',
            oldAverageCost: '90.1234',
            newAverageCost: '110.1234',
        },
        {
            locationId: 'location-example-b',
            locationName: 'Gudang Contoh B',
            skuCode: 'SYNTHETIC-MATERIAL',
            receivedQuantity: '4.0000',
            stockQuantity: '1.0000',
            retainedQuantity: '1.0000',
            receiptAmount: '80.00',
            inventoryAmount: '20.00',
            oldAverageCost: '100.0000',
            newAverageCost: '120.0000',
        },
    ],
};
const contextData = {
    eligible: true,
    invoiceId: 'invoice-example',
    purchaseOrderId: 'order-example',
    sourceFingerprint: 'a'.repeat(64),
    billTotal: '1110.00',
    items: [
        {
            purchaseOrderItemId: 'item-example',
            productVariantId: 'product-example',
            name: 'Bahan contoh',
            skuCode: 'SYNTHETIC-MATERIAL',
            unitPrice: '100.0000',
            receivedQuantity: '10.0000',
            receipts: [],
            inventory: previewData.locations.map(location => ({
                locationId: location.locationId,
                locationName: location.locationName,
                skuCode: 'SYNTHETIC-MATERIAL',
                productVariantId: 'product-example',
                id: `inventory-${location.locationId}`,
                quantity: location.stockQuantity,
                averageCost: location.oldAverageCost,
            })),
        },
        {
            purchaseOrderItemId: 'item-example-other',
            productVariantId: 'product-example-other',
            name: 'Bahan alternatif',
            skuCode: 'SYNTHETIC-ALTERNATIVE',
            unitPrice: '80.0000',
            receivedQuantity: '0.0000',
            receipts: [],
            inventory: [],
        },
    ],
    history: [],
};
const historyEntry = {
    id: 'correction-example',
    purchaseOrderItemId: 'item-example',
    postingDate: '2026-10-29T17:00:00.000Z',
    oldUnitPrice: 90,
    newUnitPrice: 100,
    receiptAmount: 100,
    inventoryAmount: 40,
    varianceAmount: 60,
    reason: 'Koreksi sesuai dokumen contoh',
};
const uuid = '11111111-1111-4111-8111-111111111111';
const nextUuid = '22222222-2222-4222-8222-222222222222';
const reason = 'Harga sesuai dokumen pembelian';
const previewButton = () => screen.getByRole('button', { name: 'Pratinjau' });
const postButton = () => screen.getByRole('button', { name: 'Posting koreksi' });
const priceInput = () => screen.getByLabelText('Harga baru per unit (Rp)');
const reasonInput = () => screen.getByLabelText('Alasan koreksi');
const text = (element: Element) => element.textContent?.replace(/\s+/g, ' ');

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

async function fillPrice(price = '120') {
    fireEvent.click(await screen.findByRole('radio', { name: 'Baris 1: Bahan contoh' }));
    fireEvent.change(priceInput(), { target: { value: price } });
}

async function showPreview() {
    await fillPrice();
    fireEvent.click(previewButton());
    return screen.findByRole('region', { name: 'Pratinjau koreksi harga' });
}

function confirm() {
    fireEvent.change(reasonInput(), { target: { value: reason } });
    fireEvent.click(screen.getByRole('checkbox'));
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(uuid).mockReturnValue(nextUuid);
    mocks.load.mockResolvedValue({ success: true, data: contextData });
    mocks.preview.mockResolvedValue({ success: true, data: previewData });
    mocks.post.mockResolvedValue({ success: true, data: { id: 'correction-example' } });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('PurchasePriceCorrection context and display', () => {
    it.each([
        'Akses Finance tidak tersedia.',
        'Tagihan sudah dilindungi atau memiliki pembayaran. Koreksi harga tidak dapat dilanjutkan.',
        'Koreksi memerlukan tepat satu tagihan aktif tanpa tagihan suplementer. Rekonsiliasi terlebih dahulu.',
        'Penerimaan maklon tidak dapat dikoreksi melalui koreksi harga pembelian.',
    ])('shows server denial without a form: %s', async error => {
        mocks.load.mockResolvedValue({ success: false, error, code: 'BLOCKED' });
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        expect(screen.getByRole('status').textContent).toContain('Memuat konteks');
        expect((await screen.findByRole('alert')).textContent).toContain(error);
        expect(screen.queryByRole('radio')).toBeNull();
        expect(screen.queryByLabelText('Harga baru per unit (Rp)')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Pratinjau' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Posting koreksi' })).toBeNull();
        expect(mocks.load).toHaveBeenCalledWith('invoice-example');
    });

    it.each([
        ['PURCHASE_PRICE_BILL_PROTECTED', 'Tagihan sudah dilindungi atau memiliki pembayaran. Koreksi harga tidak dapat dilanjutkan.'],
        ['PURCHASE_PRICE_BILL_AMBIGUOUS', 'Koreksi memerlukan tepat satu tagihan aktif tanpa tagihan suplementer. Rekonsiliasi terlebih dahulu.'],
        ['PURCHASE_PRICE_MAKLON', 'Penerimaan maklon tidak dapat dikoreksi melalui koreksi harga pembelian.'],
    ])('shows an ineligible %s reason and history table without the correction form', async (reasonCode, reasonMessage) => {
        mocks.load.mockResolvedValue({ success: true, data: {
            eligible: false, invoiceId: contextData.invoiceId, purchaseOrderId: contextData.purchaseOrderId,
            reasonCode, reasonMessage, history: [historyEntry],
            items: contextData.items.map(({ purchaseOrderItemId, productVariantId, name, skuCode }) => ({ purchaseOrderItemId, productVariantId, name, skuCode })),
        } });
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        expect((await screen.findByRole('alert')).textContent).toContain(reasonMessage);
        const history = screen.getByRole('region', { name: 'Riwayat koreksi harga' });
        expect(within(history).getByRole('table')).toBeTruthy();
        expect(text(history)).toContain('Baris 1: Bahan contoh');
        expect(text(history)).toContain('SYNTHETIC-MATERIAL');
        expect(text(history)).toContain(historyEntry.reason);
        expect(screen.queryByRole('radio')).toBeNull();
        expect(screen.queryByLabelText('Harga baru per unit (Rp)')).toBeNull();
        expect(screen.queryByLabelText('Alasan koreksi')).toBeNull();
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Pratinjau' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Posting koreksi' })).toBeNull();
        expect(mocks.preview).not.toHaveBeenCalled();
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it('keeps an empty history visible for an ineligible bill', async () => {
        mocks.load.mockResolvedValue({ success: true, data: { ...contextData, eligible: false, reasonCode: 'PURCHASE_PRICE_MAKLON', reasonMessage: 'Penerimaan maklon tidak dapat dikoreksi.' } });
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await screen.findByRole('alert');
        expect(within(screen.getByRole('region', { name: 'Riwayat koreksi harga' })).getByText('Belum ada koreksi harga.')).toBeTruthy();
        expect(screen.queryByRole('radio')).toBeNull();
    });

    it('handles a rejected load and allows a clean retry', async () => {
        mocks.load.mockRejectedValueOnce(new Error('network'));
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        expect((await screen.findByRole('alert')).textContent).toContain('Gagal memuat konteks');
        fireEvent.click(screen.getByRole('button', { name: 'Muat ulang konteks' }));
        await screen.findByRole('radio', { name: 'Baris 1: Bahan contoh' });
        expect(screen.queryByRole('alert')).toBeNull();
        expect(mocks.load).toHaveBeenCalledTimes(2);
    });

    it('shows item prices, receipts, location stocks and dated history in WIB', async () => {
        mocks.load.mockResolvedValue({ success: true, data: { ...contextData, history: [historyEntry] } });
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await screen.findByRole('radio', { name: 'Baris 1: Bahan contoh' });
        expect(text(screen.getByText(/Harga saat ini:.*100/))).toContain('Rp 100,00');
        expect(screen.getByText('Qty diterima: 10')).toBeTruthy();
        expect(screen.getByText('Lokasi Gudang Contoh A: stok 3')).toBeTruthy();
        expect(screen.getByText('Lokasi Gudang Contoh B: stok 1')).toBeTruthy();
        expect(screen.queryByText(/location-example-/)).toBeNull();
        expect(screen.getAllByText('SKU: SYNTHETIC-MATERIAL').length).toBeGreaterThan(0);
        const history = screen.getByRole('region', { name: 'Riwayat koreksi harga' });
        expect(text(history)).toContain('30 Okt 2026');
        expect(text(history)).toContain('Baris 1: Bahan contoh');
        expect(text(history)).toContain('Rp 90,00 → Rp 100,00');
        expect(text(history)).toContain('R: Rp 100,00 · Persediaan: Rp 40,00 · HPP: Rp 60,00');
        expect(text(history)).toContain(historyEntry.reason);
    });

    it('mounts the correction card in the invoice detail, including blocked invoices', async () => {
        mocks.load.mockResolvedValue({ success: true, data: { ...contextData, eligible: false, reasonCode: 'PURCHASE_PRICE_BILL_PROTECTED', reasonMessage: 'Tagihan memiliki pembayaran.', history: [historyEntry] } });
        render(<FinancialPurchaseInvoiceDetail invoice={{
            id: 'invoice-example', invoiceNumber: 'Dokumen contoh', invoiceDate: '2026-10-30',
            dueDate: null, status: 'PAID', totalAmount: 1110, paidAmount: 1110,
            purchaseOrder: { orderNumber: 'Pesanan contoh', supplier: { name: 'Pemasok contoh' }, totalAmount: 1110 },
        }} />);
        expect(screen.getByRole('heading', { name: 'Koreksi harga pembelian' })).toBeTruthy();
        expect((await screen.findByRole('alert')).textContent).toContain('Tagihan memiliki pembayaran.');
        expect(text(screen.getByRole('region', { name: 'Riwayat koreksi harga' }))).toContain(historyEntry.reason);
        expect(screen.queryByRole('radio')).toBeNull();
        expect(mocks.load).toHaveBeenCalledWith('invoice-example');
    });
});

describe('PurchasePriceCorrection preview', () => {
    it.each(['0', '-1', '1.23456', '1,23456', '1e3', '01', '100000000000', 'abc', '1.000,50'])('rejects invalid price %s without calling the action', async price => {
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await fillPrice(price);
        expect(priceInput().getAttribute('aria-invalid')).toBe('true');
        expect(previewButton()).toHaveProperty('disabled', true);
        fireEvent.click(previewButton());
        expect(mocks.preview).not.toHaveBeenCalled();
    });

    it('accepts a four-decimal comma price as a decimal string and requires selection', async () => {
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await screen.findByRole('radio', { name: 'Baris 1: Bahan contoh' });
        fireEvent.change(priceInput(), { target: { value: '120,1234' } });
        expect(previewButton()).toHaveProperty('disabled', true);
        fireEvent.click(screen.getByRole('radio', { name: 'Baris 1: Bahan contoh' }));
        fireEvent.click(previewButton());
        await screen.findByRole('region', { name: 'Pratinjau koreksi harga' });
        expect(mocks.preview).toHaveBeenCalledWith({
            invoiceId: 'invoice-example', purchaseOrderItemId: 'item-example', newUnitPrice: '120.1234',
        });
    });

    it('renders the server totals, PPN, R, inventory, HPP and four-decimal average costs', async () => {
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        const preview = await showPreview();
        const summary = (label: string) => text(within(preview).getByText(label).parentElement!);
        expect(summary('Harga per unit')).toContain('Rp 100,00 → Rp 120,00');
        expect(summary('Total tagihan (termasuk PPN)')).toContain('Rp 1.110,00 → Rp 1.332,00');
        expect(summary('Δ tagihan (termasuk PPN)')).toContain('Rp 222,00');
        expect(summary('Δ sebelum PPN / Δ PPN')).toContain('Rp 200,00 / Rp 22,00');
        expect(summary('Perubahan nilai penerimaan (R)')).toContain('Rp 200,00');
        expect(summary('Bagian HPP (barang sudah terpakai)')).toContain('Rp 120,00');
        const allocation = within(preview).getByRole('region', { name: 'Alokasi persediaan per lokasi' });
        expect(allocation.tabIndex).toBe(0);
        expect(allocation.classList.contains('overflow-x-auto')).toBe(true);
        const rows = within(allocation).getAllByRole('row');
        expect(within(rows[1]).getByRole('rowheader').textContent).toBe('Gudang Contoh A');
        expect(within(rows[2]).getByRole('rowheader').textContent).toBe('Gudang Contoh B');
        expect(within(preview).getByText('SKU: SYNTHETIC-MATERIAL')).toBeTruthy();
        expect(text(rows[1])).toContain('Rp 60,00');
        expect(text(rows[1])).toContain('Rp 90,1234 → Rp 110,1234');
        expect(text(rows[2])).toContain('Rp 20,00');
        expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    });

    it('falls back to location IDs only when names are absent in context and preview', async () => {
        mocks.load.mockResolvedValue({ success: true, data: { ...contextData, items: contextData.items.map(item => ({
            ...item, inventory: item.inventory.map(stock => ({ ...stock, locationName: null })),
        })) } });
        mocks.preview.mockResolvedValue({ success: true, data: { ...previewData, locations: previewData.locations.map(location => ({ ...location, locationName: null })) } });
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        const preview = await showPreview();
        expect(screen.getByText('Lokasi location-example-a: stok 3')).toBeTruthy();
        expect(screen.getByText('Lokasi location-example-b: stok 1')).toBeTruthy();
        expect(within(preview).getByRole('rowheader', { name: 'location-example-a' })).toBeTruthy();
        expect(within(preview).getByRole('rowheader', { name: 'location-example-b' })).toBeTruthy();
    });

    it('preserves negative server amounts and unavailable average costs for zero stock', async () => {
        mocks.preview.mockResolvedValue({ success: true, data: {
            ...previewData, newUnitPrice: '90.0000', billTotalAfter: '999.00', billTotalDelta: '-111.00',
            billNetDelta: '-100.00', billTaxDelta: '-11.00', receiptAmount: '-100.00', inventoryAmount: '0.00', varianceAmount: '-100.00',
            locations: [{ ...previewData.locations[0], stockQuantity: '0.0000', retainedQuantity: '0.0000', inventoryAmount: '0.00', oldAverageCost: null, newAverageCost: null }],
        } });
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        const preview = await showPreview();
        expect(text(within(preview).getByText('Δ tagihan (termasuk PPN)').parentElement!)).toContain('-Rp 111,00');
        expect(text(within(preview).getByText('Bagian HPP (barang sudah terpakai)').parentElement!)).toContain('-Rp 100,00');
        expect(within(preview).getByText('Belum tersedia → Belum tersedia')).toBeTruthy();
    });

    it.each(['price', 'item', 'reload'])('invalidates preview and confirmation when changing %s', async field => {
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await showPreview();
        confirm();
        if (field === 'price') fireEvent.change(priceInput(), { target: { value: '125' } });
        if (field === 'item') fireEvent.click(screen.getByRole('radio', { name: 'Baris 2: Bahan alternatif' }));
        if (field === 'reload') fireEvent.click(screen.getByRole('button', { name: 'Muat ulang konteks' }));
        expect(screen.queryByRole('region', { name: 'Pratinjau koreksi harga' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Posting koreksi' })).toBeNull();
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it('locks inputs and prevents duplicate preview requests while pending', async () => {
        const pending = deferred<{ success: true; data: typeof previewData }>();
        mocks.preview.mockReturnValue(pending.promise);
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await fillPrice();
        const button = previewButton();
        fireEvent.click(button);
        fireEvent.click(button);
        expect(button).toHaveProperty('disabled', true);
        expect(priceInput()).toHaveProperty('disabled', true);
        expect(screen.getByRole('radio', { name: 'Baris 1: Bahan contoh' })).toHaveProperty('disabled', true);
        expect(mocks.preview).toHaveBeenCalledTimes(1);
        await act(async () => { pending.resolve({ success: true, data: previewData }); });
        expect(postButton()).toHaveProperty('disabled', true);
    });

    it('shows preview errors verbatim and does not retain an earlier preview', async () => {
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await showPreview();
        mocks.preview.mockResolvedValueOnce({ success: false, code: 'INVALID', error: 'Periode jurnal belum terbuka.' });
        fireEvent.click(previewButton());
        expect((await screen.findByRole('alert')).textContent).toBe('Periode jurnal belum terbuka.');
        expect(screen.queryByRole('button', { name: 'Posting koreksi' })).toBeNull();
        mocks.preview.mockRejectedValueOnce(new Error('network'));
        fireEvent.click(previewButton());
        expect((await screen.findByRole('alert')).textContent).toContain('Gagal memuat pratinjau');
        expect(mocks.post).not.toHaveBeenCalled();
    });
});

describe('PurchasePriceCorrection posting', () => {
    it('requires a trimmed reason and renewed confirmation after editing the reason', async () => {
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await showPreview();
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.change(reasonInput(), { target: { value: ' abcd ' } });
        fireEvent.click(screen.getByRole('checkbox'));
        expect(postButton()).toHaveProperty('disabled', true);
        fireEvent.click(postButton());
        expect(mocks.post).not.toHaveBeenCalled();
        fireEvent.change(reasonInput(), { target: { value: reason } });
        expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
        expect(postButton()).toHaveProperty('disabled', true);
        fireEvent.click(screen.getByRole('checkbox'));
        expect(postButton()).toHaveProperty('disabled', false);
    });

    it('posts the preview fingerprint/key, prevents double submits and resets after success', async () => {
        const pending = deferred<{ success: true; data: { id: string } }>();
        mocks.post.mockReturnValue(pending.promise);
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await showPreview();
        confirm();
        const button = postButton();
        fireEvent.click(button);
        fireEvent.click(button);
        expect(button).toHaveProperty('disabled', true);
        expect(reasonInput()).toHaveProperty('disabled', true);
        expect(priceInput()).toHaveProperty('disabled', true);
        expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
        expect(screen.getByRole('button', { name: 'Muat ulang konteks' })).toHaveProperty('disabled', true);
        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect(mocks.post).toHaveBeenCalledWith({
            invoiceId: 'invoice-example', purchaseOrderItemId: 'item-example', newUnitPrice: '120.0000',
            sourceFingerprint: previewData.sourceFingerprint, idempotencyKey: uuid, reason, confirmed: true,
        });
        mocks.load.mockResolvedValueOnce({ success: true, data: { ...contextData, history: [historyEntry] } });
        await act(async () => { pending.resolve({ success: true, data: { id: 'correction-example' } }); });
        expect(mocks.success).toHaveBeenCalledOnce();
        expect(mocks.refresh).toHaveBeenCalledOnce();
        await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
        expect(priceInput()).toHaveProperty('value', '');
        expect(screen.getByRole('radio', { name: 'Baris 1: Bahan contoh' })).toHaveProperty('checked', false);
        expect(screen.queryByRole('button', { name: 'Posting koreksi' })).toBeNull();
        await showPreview();
        expect(reasonInput()).toHaveProperty('value', '');
        expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
        expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
    });

    it.each(['network', 'internal'])('retries an uncertain %s result with the exact same payload and key', async kind => {
        if (kind === 'network') mocks.post.mockRejectedValueOnce(new Error('network'));
        else mocks.post.mockResolvedValueOnce({ success: false, code: 'INTERNAL_ERROR', error: 'Hasil belum tersedia.' });
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await showPreview();
        confirm();
        fireEvent.click(postButton());
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain(kind === 'network' ? 'Hasil posting belum dapat dipastikan' : 'Hasil belum tersedia.');
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(mocks.success).not.toHaveBeenCalled();
        expect(priceInput()).toHaveProperty('disabled', true);
        expect(reasonInput()).toHaveProperty('disabled', true);
        expect(previewButton()).toHaveProperty('disabled', true);
        fireEvent.change(reasonInput(), { target: { value: 'Instruksi berbeda' } });
        expect(reasonInput()).toHaveProperty('value', reason);
        expect(postButton()).toHaveProperty('disabled', false);
        fireEvent.click(postButton());
        await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce());
        expect(mocks.post).toHaveBeenCalledTimes(2);
        expect(mocks.post.mock.calls[1][0]).toEqual(mocks.post.mock.calls[0][0]);
        expect(mocks.post.mock.calls[1][0]).toMatchObject({ sourceFingerprint: previewData.sourceFingerprint, idempotencyKey: uuid });
        expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    });

    it('shows a business error verbatim and keeps the key for retry', async () => {
        mocks.post.mockResolvedValueOnce({ success: false, code: 'PURCHASE_PRICE_ACCOUNT_INVALID', error: 'Akun persediaan, GR/IR, dan HPP harus aktif dan berbeda.' });
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await showPreview();
        confirm();
        fireEvent.click(postButton());
        expect((await screen.findByRole('alert')).textContent).toBe('Akun persediaan, GR/IR, dan HPP harus aktif dan berbeda.');
        expect(mocks.success).not.toHaveBeenCalled();
        fireEvent.click(postButton());
        await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
        expect(mocks.post.mock.calls[1][0]).toEqual(mocks.post.mock.calls[0][0]);
        expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    });

    it('requires a fresh preview, key and confirmation on PURCHASE_PRICE_SOURCE_CHANGED', async () => {
        const error = 'Harga, tagihan, atau stok berubah. Muat ulang pratinjau dan konfirmasi kembali.';
        mocks.post.mockResolvedValueOnce({ success: false, code: 'PURCHASE_PRICE_SOURCE_CHANGED', error });
        render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await showPreview();
        confirm();
        fireEvent.click(postButton());
        expect((await screen.findByRole('alert')).textContent).toBe(error);
        expect(screen.queryByRole('button', { name: 'Posting koreksi' })).toBeNull();
        mocks.preview.mockResolvedValueOnce({ success: true, data: { ...previewData, sourceFingerprint: 'c'.repeat(64) } });
        fireEvent.click(previewButton());
        await screen.findByRole('region', { name: 'Pratinjau koreksi harga' });
        expect(postButton()).toHaveProperty('disabled', true);
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(postButton());
        await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
        expect(mocks.post.mock.calls[1][0]).toMatchObject({ idempotencyKey: nextUuid, sourceFingerprint: 'c'.repeat(64) });
    });

    it('does not reuse a ready preview or confirmation after navigating to another invoice', async () => {
        const { rerender } = render(<PurchasePriceCorrection invoiceId="invoice-example" />);
        await showPreview();
        confirm();
        mocks.load.mockResolvedValueOnce({ success: true, data: { ...contextData, invoiceId: 'new-invoice' } });
        rerender(<PurchasePriceCorrection invoiceId="new-invoice" />);
        await screen.findByRole('radio', { name: 'Baris 1: Bahan contoh' });
        expect(priceInput()).toHaveProperty('value', '');
        expect(screen.queryByRole('button', { name: 'Posting koreksi' })).toBeNull();
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it('ignores an old invoice delayed context on navigation', async () => {
        const oldLoad = deferred<{ success: true; data: typeof contextData }>();
        mocks.load.mockReturnValueOnce(oldLoad.promise);
        const { rerender } = render(<PurchasePriceCorrection invoiceId="old-invoice" />);
        mocks.load.mockResolvedValueOnce({ success: false, code: 'BLOCKED', error: 'Tagihan baru tidak dapat dikoreksi.' });
        rerender(<PurchasePriceCorrection invoiceId="new-invoice" />);
        await screen.findByRole('alert');
        await act(async () => { oldLoad.resolve({ success: true, data: contextData }); });
        expect(screen.queryByRole('radio')).toBeNull();
        expect(screen.getByRole('alert').textContent).toContain('Tagihan baru');
        expect(mocks.post).not.toHaveBeenCalled();
    });
});
