// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { DeliveryRevisionDialog } from '../DeliveryRevisionDialog';
const mocks = vi.hoisted(() => ({ editor: vi.fn(), search: vi.fn(), revise: vi.fn(), refresh: vi.fn(), success: vi.fn() }));
vi.mock('@/actions/sales/delivery-revision', () => ({ getDeliveryRevisionEditor: mocks.editor, findDeliveryRevisionProducts: mocks.search, reviseDeliveryLoad: mocks.revise }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success } }));
const version = '2026-09-19T00:00:00.000Z';
beforeEach(() => {
    vi.resetAllMocks();
    mocks.editor.mockResolvedValue({ success: true, data: { deliveryOrderId: 'do', orderNumber: 'SO-test', orderVersion: version, deliveryVersion: version,
        items: [{ salesOrderItemId: 'soi', productVariantId: 'a', name: 'Barang A', unit: 'KG', ordered: 100, delivered: 0, unitPrice: 10, quantity: 100 }] } });
    mocks.revise.mockResolvedValue({ success: true, data: {} });
});
afterEach(cleanup);
async function open() {
    render(<DeliveryRevisionDialog deliveryOrderId="do" />);
    fireEvent.click(screen.getByRole('button', { name: 'Revisi muatan / barang' }));
    await screen.findByLabelText('Qty muat Barang A (KG)');
}
describe('revision dialog', () => {
    it('defaults to keeping residual and requires reason and confirmation before mutation', async () => {
        await open();
        expect((screen.getByLabelText('Sisa pesanan') as HTMLSelectElement).value).toBe('KEEP');
        fireEvent.change(screen.getByLabelText('Qty muat Barang A (KG)'), { target: { value: '80' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tinjau revisi' }));
        expect(screen.getByRole('alert').textContent).toContain('Alasan');
        expect(mocks.revise).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('Alasan revisi (wajib)'), { target: { value: 'Muatan hanya delapan puluh' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tinjau revisi' }));
        expect(mocks.revise).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Simpan revisi & verifikasi ulang' }));
        await waitFor(() => expect(mocks.revise).toHaveBeenCalledWith(expect.objectContaining({ remainder: 'KEEP', items: [{ salesOrderItemId: 'soi', quantity: 80 }] })));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    });
    it('supports replacing goods with explicit new price and cancelling residual', async () => {
        await open();
        mocks.search.mockResolvedValue({ success: true, data: [{ id: 'b', name: 'Barang B', skuCode: 'B', primaryUnit: 'KG' }] });
        fireEvent.change(screen.getByLabelText('Cari barang tambahan / pengganti'), { target: { value: 'Barang B' } });
        fireEvent.click(screen.getByRole('button', { name: 'Cari barang' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Tambah Barang B · B (KG)' }));
        fireEvent.change(screen.getByLabelText('Qty muat Barang A (KG)'), { target: { value: '0' } });
        fireEvent.change(screen.getByLabelText('Qty Barang B (KG)'), { target: { value: '100' } });
        fireEvent.change(screen.getByLabelText('Harga Barang B (Rp/KG)'), { target: { value: '12' } });
        fireEvent.change(screen.getByLabelText('Sisa pesanan'), { target: { value: 'CLOSE' } });
        fireEvent.change(screen.getByLabelText('Alasan revisi (wajib)'), { target: { value: 'Diganti sesuai kesepakatan' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tinjau revisi' }));
        fireEvent.click(screen.getByRole('button', { name: 'Simpan revisi & verifikasi ulang' }));
        await waitFor(() => expect(mocks.revise).toHaveBeenCalledWith(expect.objectContaining({ remainder: 'CLOSE', additions: [{ productVariantId: 'b', quantity: 100, unitPrice: 12, taxPercent: 0, ppnMode: 'EXCLUDE' }] })));
    });
    it('does not coerce blank qty to zero; keeps errors visible when server rejects stale edit', async () => {
        await open();
        fireEvent.change(screen.getByLabelText('Alasan revisi (wajib)'), { target: { value: 'Perubahan pesanan' } });
        fireEvent.change(screen.getByLabelText('Qty muat Barang A (KG)'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tinjau revisi' }));
        expect(mocks.revise).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Qty muat Barang A (KG)'), { target: { value: '80' } });
        mocks.revise.mockResolvedValue({ success: false, error: 'Data telah berubah' });
        fireEvent.click(screen.getByRole('button', { name: 'Tinjau revisi' }));
        fireEvent.click(screen.getByRole('button', { name: 'Simpan revisi & verifikasi ulang' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Data telah berubah'));
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it('shows authorization/load errors without rendering an editable form', async () => {
        mocks.editor.mockResolvedValue({ success: false, error: 'Akses sales diperlukan' });
        render(<DeliveryRevisionDialog deliveryOrderId="do" />);
        fireEvent.click(screen.getByRole('button', { name: 'Revisi muatan / barang' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Akses sales'));
        expect(screen.queryByRole('button', { name: 'Tinjau revisi' })).toBeNull();
    });
});
