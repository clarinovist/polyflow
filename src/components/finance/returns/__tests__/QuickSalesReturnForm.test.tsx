// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ orders: vi.fn(), items: vi.fn(), preview: vi.fn(), post: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/finance/sales-returns', () => ({ getFinanceQuickReturnOrders: mocks.orders, getFinanceQuickReturnItems: mocks.items, previewFinanceQuickReturn: mocks.preview, postFinanceQuickReturn: mocks.post }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { QuickSalesReturnForm } from '../QuickSalesReturnForm';
const proposal = { fingerprint: 'a'.repeat(64), invoiceNumber: 'INV-TEST', orderNumber: 'SO-TEST', totalAmount: '222.00', taxAmount: '22.00', remaining: '1110.00', remainingAfter: '888.00', source: 'SO_REVIEW', locationName: 'Gudang Barang Jadi', items: [] };
async function choose() {
    render(<QuickSalesReturnForm initialOrders={[{ id: 'order', orderNumber: 'SO-TEST' }]} />);
    fireEvent.change(screen.getByLabelText('Referensi SO'), { target: { value: 'order' } });
    const input = await screen.findByLabelText('Jumlah retur (KG)');
    fireEvent.change(input, { target: { value: '2' } });
    return input;
}
async function review() {
    const input = await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Periksa potongan' }));
    await screen.findByText('Potongan INV-TEST');
    return input;
}
describe('one-column return quantity and explicit atomic submission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.items.mockResolvedValue({ success: true, data: [{ productVariantId: 'variant', name: 'Produk Uji', skuCode: 'SKU-TEST', unit: 'KG' }] });
        mocks.orders.mockResolvedValue({ success: true, data: [] });
        mocks.preview.mockResolvedValue({ success: true, data: proposal });
        mocks.post.mockResolvedValue({ success: true, data: { id: 'returned', returnNumber: 'SR-TEST' } });
    });
    it('edits only quantity per product and explicitly confirms stock and credit', async () => {
        await review();
        expect(mocks.preview).toHaveBeenCalledWith({ salesOrderId: 'order', items: [{ productVariantId: 'variant', quantity: '2' }] });
        expect(screen.getByText(/Invoice lama tanpa snapshot/)).toBeTruthy();
        expect(screen.getByText(/888,00/)).toBeTruthy();
        const button = screen.getByRole('button', { name: 'Simpan retur & potong tagihan' }) as HTMLButtonElement;
        expect(button.disabled).toBe(true); expect(mocks.post).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(button);
        await screen.findByText(/Retur tersimpan, stok bertambah, tagihan berkurang/);
        expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({ selection: { salesOrderId: 'order', items: [{ productVariantId: 'variant', quantity: '2' }] }, fingerprint: proposal.fingerprint, confirmed: true, requestId: expect.any(String) }));
        expect(mocks.refresh).toHaveBeenCalledOnce();
        expect(screen.getByRole('link', { name: 'Lihat retur & potongan' }).getAttribute('href')).toBe('/finance/returns/returned');
    });
    it('clears an approved quote when quantity changes', async () => {
        const input = await review(); fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.change(input, { target: { value: '3' } });
        expect(screen.queryByText('Potongan INV-TEST')).toBeNull(); expect(mocks.post).not.toHaveBeenCalled();
    });
    it('keeps request identity on retry after an unknown/failed outcome, never claims success', async () => {
        mocks.post.mockResolvedValue({ success: false, error: 'Saldo berubah' });
        await review(); fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Simpan retur & potong tagihan' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Saldo berubah'));
        expect(mocks.refresh).not.toHaveBeenCalled(); expect(screen.queryByText(/Retur tersimpan/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Simpan retur & potong tagihan' }));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
        expect(mocks.post.mock.calls[0][0].requestId).toBe(mocks.post.mock.calls[1][0].requestId);
    });
    it('does not allow a duplicate in-flight post', async () => {
        let resolve!: (result: unknown) => void;
        mocks.post.mockImplementation(() => new Promise(done => { resolve = done; }));
        await review(); fireEvent.click(screen.getByRole('checkbox'));
        const button = screen.getByRole('button', { name: 'Simpan retur & potong tagihan' });
        fireEvent.click(button); fireEvent.click(button);
        expect(mocks.post).toHaveBeenCalledOnce();
        resolve({ success: true, data: { id: 'return', returnNumber: 'SR' } });
        await screen.findByText(/Retur tersimpan/);
    });
    it('reports missing/invalid quantities without sending a preview', async () => {
        const input = await choose(); fireEvent.change(input, { target: { value: '-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Periksa potongan' }));
        await screen.findByRole('alert'); expect(mocks.preview).not.toHaveBeenCalled();
    });
    it('shows blocked preview instead of a posting form', async () => {
        mocks.preview.mockResolvedValue({ success: false, error: 'Invoice tercatat lunas' });
        await choose(); fireEvent.click(screen.getByRole('button', { name: 'Periksa potongan' }));
        await screen.findByText('Invoice tercatat lunas');
        expect(screen.queryByRole('checkbox')).toBeNull(); expect(mocks.post).not.toHaveBeenCalled();
    });
    it('reports failed lookups and handles empty search honestly', async () => {
        mocks.items.mockResolvedValue({ success: false, error: 'Akses ditolak' });
        render(<QuickSalesReturnForm initialOrders={[{ id: 'order', orderNumber: 'SO-TEST' }]} />);
        fireEvent.change(screen.getByLabelText('Referensi SO'), { target: { value: 'order' } });
        await screen.findByText('Akses ditolak');
        fireEvent.change(screen.getByLabelText('Cari nomor SO'), { target: { value: 'SO-UNKNOWN' } });
        fireEvent.click(screen.getByRole('button', { name: 'Cari' }));
        await screen.findByText(/Tidak ada SO sesuai pencarian/);
        expect(mocks.orders).toHaveBeenCalledWith('SO-UNKNOWN');
    });
});
