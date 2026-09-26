// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PurchaseOrderDetailClient } from '../PurchaseOrderDetailClient';
import { makePurchaseOrder, type PurchaseOrderFixture } from '../../__tests__/commercial-detail-fixtures';

const mocks = vi.hoisted(() => ({
    status: vi.fn(), invoice: vi.fn(), delete: vi.fn(), close: vi.fn(),
    refresh: vi.fn(), push: vi.fn(), success: vi.fn(), error: vi.fn(), role: 'PROCUREMENT',
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: mocks.role } } }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/actions/purchasing/purchasing', () => ({
    updatePurchaseOrderStatus: mocks.status, createPurchaseInvoice: mocks.invoice, deletePurchaseOrder: mocks.delete,
}));
vi.mock('@/actions/purchasing/close-purchase-order', () => ({ closePurchaseOrder: mocks.close }));
vi.mock('@/components/shared/EntityStatusTimeline', () => ({ EntityStatusTimeline: () => null }));

const NOW = new Date('2026-09-26T12:00:00Z');
const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeEach(() => {
    vi.resetAllMocks();
    mocks.role = 'PROCUREMENT';
    mocks.status.mockResolvedValue({ id: 'fixture-po' });
    mocks.invoice.mockResolvedValue({ id: 'fixture-invoice' });
    mocks.delete.mockResolvedValue({ success: true });
    mocks.close.mockResolvedValue({ success: true });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network in PO layout test'); }));
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterEach(() => {
    cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
    if (originalScroll) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScroll);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

function renderOrder(overrides: Partial<PurchaseOrderFixture> = {}, warehouseMode = false) {
    return render(<PurchaseOrderDetailClient order={makePurchaseOrder(overrides)} warehouseMode={warehouseMode} />);
}
async function openDelete() {
    fireEvent.keyDown(screen.getByRole('button', { name: 'Lainnya' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Hapus PO' }));
    return screen.findByRole('alertdialog', { name: 'Hapus Purchase Order?' });
}
async function openInvoice() {
    fireEvent.click(screen.getByRole('button', { name: 'Buat Invoice' }));
    return screen.findByRole('dialog', { name: 'Buat Purchase Invoice' });
}

const states = [
    { status: 'DRAFT', confirm: true, receive: false, invoice: false, edit: true, close: false, remove: true },
    { status: 'SENT', confirm: false, receive: true, invoice: true, edit: true, close: false, remove: false },
    { status: 'PARTIAL_RECEIVED', confirm: false, receive: true, invoice: true, edit: true, close: true, remove: false },
    { status: 'RECEIVED', confirm: false, receive: false, invoice: true, edit: false, close: false, remove: false },
    { status: 'CLOSED', confirm: false, receive: false, invoice: true, edit: false, close: false, remove: false },
    { status: 'CANCELLED', confirm: false, receive: false, invoice: false, edit: false, close: false, remove: true },
] as const;

describe('Purchase order detail layout and existing action contracts', () => {
    it('separates number, badges and metadata without duplicating the PO prefix', () => {
        renderOrder({ orderNumber: 'PO-2026-0123', entrySource: 'WALK_IN_RECEIPT', commercialReviewStatus: 'PENDING', createdBy: { name: 'Synthetic Buyer' } });
        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading.textContent).toBe('PO-2026-0123');
        expect(within(heading).queryByText('Dari Nota')).toBeNull();
        expect(screen.getByText('Menunggu Review')).toBeTruthy();
        expect(screen.getByText('Dibuat pada 18 September 2026 oleh Synthetic Buyer')).toBeTruthy();
        expect(screen.getByRole('group', { name: 'Aksi pesanan pembelian' }).contains(heading)).toBe(false);
    });

    it.each(states)('preserves $status action availability and semantic navigation', (state) => {
        renderOrder({ status: state.status });
        expect(Boolean(screen.queryByRole('button', { name: 'Tandai Terkirim' }))).toBe(state.confirm);
        const receipt = screen.queryByRole('link', { name: 'Penerimaan Barang' });
        expect(Boolean(receipt)).toBe(state.receive);
        if (receipt) {
            expect(receipt.getAttribute('href')).toBe('/warehouse/incoming/create-receipt?poId=fixture-po');
            expect(receipt.querySelector('button')).toBeNull();
        }
        const edit = screen.queryByRole('link', { name: 'Edit PO' });
        expect(Boolean(edit)).toBe(state.edit);
        if (edit) {
            expect(edit.getAttribute('href')).toBe('/purchasing/orders/fixture-po/edit');
            expect(edit.querySelector('button')).toBeNull();
        }
        const invoice = screen.queryByRole('button', { name: 'Buat Invoice' });
        expect(Boolean(invoice)).toBe(state.invoice);
        if (invoice) expect(invoice.getAttribute('data-variant')).toBe(state.receive ? 'outline' : 'default');
        expect(Boolean(screen.queryByRole('button', { name: 'Tutup PO PO-TEST' }))).toBe(state.close);
        expect(Boolean(screen.queryByRole('button', { name: 'Lainnya' }))).toBe(state.remove);
        expect(screen.queryByRole('button', { name: 'Hapus PO' })).toBeNull();
    });

    it.each(states)('preserves warehouse visibility for $status', (state) => {
        renderOrder({ status: state.status }, true);
        expect(Boolean(screen.queryByRole('link', { name: 'Penerimaan Barang' }))).toBe(state.receive);
        for (const name of ['Tandai Terkirim', 'Buat Invoice', 'Tutup PO PO-TEST', 'Lainnya']) {
            expect(screen.queryByRole('button', { name })).toBeNull();
        }
        expect(screen.queryByRole('link', { name: 'Edit PO' })).toBeNull();
        expect(screen.queryByRole('columnheader', { name: 'Harga Satuan' })).toBeNull();
        expect(screen.queryByText('Total Keseluruhan')).toBeNull();
    });

    it.each(['PLANNING', 'WAREHOUSE', 'FINANCE'])('preserves closure role restriction for %s', (role) => {
        mocks.role = role;
        renderOrder({ status: 'PARTIAL_RECEIVED' });
        expect(screen.queryByRole('button', { name: 'Tutup PO PO-TEST' })).toBeNull();
    });

    it('keeps the existing reason-required closure dialog after the normal actions', async () => {
        renderOrder({ status: 'PARTIAL_RECEIVED' });
        const close = screen.getByRole('button', { name: 'Tutup PO PO-TEST' });
        expect(screen.getByRole('link', { name: 'Penerimaan Barang' }).compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        fireEvent.click(close);
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByRole('button', { name: 'Ya, Tutup PO' })).toHaveProperty('disabled', true);
        expect(within(dialog).getByText(/Jumlah pesanan, penerimaan aktual, stok/)).toBeTruthy();
        fireEvent.change(within(dialog).getByLabelText('Alasan penutupan'), { target: { value: '  Sisa tidak dikirim  ' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Ya, Tutup PO' }));
        await waitFor(() => expect(mocks.close).toHaveBeenCalledExactlyOnceWith('fixture-po', 'Sisa tidak dikirim'));
        expect(mocks.status).not.toHaveBeenCalled();
    });

    it('requires delete confirmation and restores focus after safe dismissal', async () => {
        renderOrder();
        const dialog = await openDelete();
        expect(mocks.delete).not.toHaveBeenCalled();
        const back = within(dialog).getByRole('button', { name: 'Kembali' });
        await waitFor(() => expect(document.activeElement).toBe(back));
        fireEvent.keyDown(dialog, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Lainnya' })));
        expect(mocks.delete).not.toHaveBeenCalled();
    });

    it.each(['DRAFT', 'CANCELLED'] as const)('deletes confirmed %s once, locks pending actions and returns to basePath', async (status) => {
        let finish!: (result: { success: boolean }) => void;
        mocks.delete.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        render(<PurchaseOrderDetailClient order={makePurchaseOrder({ status })} basePath="/fixture/orders" />);
        expect(screen.getByRole('link', { name: 'Kembali' }).getAttribute('href')).toBe('/fixture/orders');
        const dialog = await openDelete();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Hapus PO' }));
        expect(mocks.delete).toHaveBeenCalledExactlyOnceWith('fixture-po');
        expect(screen.getByRole('button', { name: 'Lainnya' })).toHaveProperty('disabled', true);
        expect(mocks.push).not.toHaveBeenCalled();
        await act(async () => finish({ success: true }));
        expect(mocks.push).toHaveBeenCalledWith('/fixture/orders');
        expect(mocks.success).toHaveBeenCalledWith('PO-TEST berhasil dihapus');
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it.each(['result', 'empty-error', 'throw'])('preserves delete %s failure without navigation and allows retry', async (mode) => {
        if (mode === 'throw') mocks.delete.mockRejectedValueOnce(new Error('Synthetic network failure'));
        else mocks.delete.mockResolvedValueOnce({ success: false, error: mode === 'result' ? 'Synthetic rejection' : undefined });
        renderOrder();
        let dialog = await openDelete();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Hapus PO' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(mode === 'result' ? 'Synthetic rejection' : 'Gagal menghapus Purchase Order. Silakan coba lagi.'));
        expect(mocks.push).not.toHaveBeenCalled();
        dialog = await openDelete();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Hapus PO' }));
        await waitFor(() => expect(mocks.delete).toHaveBeenCalledTimes(2));
    });

    it('retains the draft SENT command and loading behavior', async () => {
        let finish!: (result: { id: string }) => void;
        mocks.status.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        renderOrder();
        fireEvent.click(screen.getByRole('button', { name: 'Tandai Terkirim' }));
        expect(mocks.status).toHaveBeenCalledExactlyOnceWith('fixture-po', 'SENT');
        expect(screen.getByRole('button', { name: 'Tandai Terkirim' })).toHaveProperty('disabled', true);
        expect(screen.getByRole('button', { name: 'Lainnya' })).toHaveProperty('disabled', true);
        await act(async () => finish({ id: 'fixture-po' }));
        expect(mocks.refresh).toHaveBeenCalledOnce();
    });

    it('retains default invoice dates and payload with the existing calculator', async () => {
        renderOrder({ status: 'RECEIVED' });
        const dialog = await openInvoice();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Buat Invoice' }));
        await waitFor(() => expect(mocks.invoice).toHaveBeenCalledOnce());
        expect(mocks.invoice).toHaveBeenCalledWith({
            purchaseOrderId: 'fixture-po', invoiceNumber: 'INV-PO-TEST', invoiceDate: new Date('2026-09-26'),
            termOfPaymentDays: 30, notes: '', dueDate: new Date('2026-10-26'),
        });
        expect(mocks.refresh).toHaveBeenCalledOnce();
    });

    it('retains manual invoice due date and prevents invoicing again when an invoice exists', async () => {
        const view = renderOrder({ status: 'CLOSED' });
        const dialog = await openInvoice();
        fireEvent.click(within(dialog).getByRole('checkbox'));
        const manual = dialog.querySelectorAll('input[type="date"]')[1];
        fireEvent.change(manual, { target: { value: '2026-11-15' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Buat Invoice' }));
        await waitFor(() => expect(mocks.invoice).toHaveBeenCalledOnce());
        expect(mocks.invoice.mock.calls[0][0].manualDueDate).toEqual(new Date('2026-11-15'));
        expect(mocks.invoice.mock.calls[0][0].dueDate).toBeUndefined();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const invoice: PurchaseOrderFixture['invoices'][number] = {
            id: 'fixture-invoice', invoiceNumber: 'INV-TEST', status: 'UNPAID',
            totalAmount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(0),
            dueDate: null, invoiceDate: NOW, createdAt: NOW, updatedAt: NOW,
            purchaseOrderId: 'fixture-po', termOfPaymentDays: 30, notes: null,
        };
        view.rerender(<PurchaseOrderDetailClient order={makePurchaseOrder({ status: 'CLOSED', invoices: [invoice] })} />);
        expect(screen.queryByRole('button', { name: 'Buat Invoice' })).toBeNull();
        expect(screen.getByText('INV-TEST')).toBeTruthy();
    });

    it('keeps honest receipt/invoice empty states and localizes the expected date', () => {
        renderOrder({ expectedDate: '2026-10-01' });
        expect(screen.getByText('1 Oktober 2026')).toBeTruthy();
        expect(screen.getByText('Tidak ada penerimaan barang yang dicatat.')).toBeTruthy();
        expect(screen.getByText('Tidak ada invoice yang dibuat.')).toBeTruthy();
        expect(screen.queryByText('Item yang diterima untuk PO ini')).toBeNull();
    });
});
