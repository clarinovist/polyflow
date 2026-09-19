// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ close: vi.fn(), refresh: vi.fn(), toast: vi.fn(), role: 'PROCUREMENT' }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: mocks.role } } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.toast } }));
vi.mock('@/actions/purchasing/close-purchase-order', () => ({ closePurchaseOrder: mocks.close }));
import { ClosePurchaseOrderDialog } from '../ClosePurchaseOrderDialog';

function open() {
    render(<ClosePurchaseOrderDialog id="po" orderNumber="PO-TEST" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tutup PO PO-TEST' }));
}
function enterReason() {
    fireEvent.change(screen.getByLabelText('Alasan penutupan'), { target: { value: '  Tidak dikirim lagi  ' } });
}

describe('ClosePurchaseOrderDialog', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.role = 'PROCUREMENT'; mocks.close.mockResolvedValue({ success: true }); });
    it.each(['PLANNING', 'WAREHOUSE', 'FINANCE'])('hides closing from %s', role => {
        mocks.role = role;
        render(<ClosePurchaseOrderDialog id="po" orderNumber="PO-TEST" />);
        expect(screen.queryByRole('button')).toBeNull();
    });
    it('requires reason and cancellation never submits', () => {
        open();
        const confirm = screen.getByRole('button', { name: 'Ya, Tutup PO' }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(true);
        expect(screen.getByText(/Jumlah pesanan, penerimaan aktual/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Alasan penutupan'), { target: { value: '   ' } });
        expect(confirm.disabled).toBe(true);
        enterReason();
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        expect(mocks.close).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('confirms with trimmed reason then refreshes', async () => {
        open(); enterReason();
        fireEvent.click(screen.getByRole('button', { name: 'Ya, Tutup PO' }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
        expect(mocks.close).toHaveBeenCalledExactlyOnceWith('po', 'Tidak dikirim lagi');
        expect(mocks.toast).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it.each(['result', 'throw'])('keeps reason/dialog on %s failure', async mode => {
        if (mode === 'result') mocks.close.mockResolvedValue({ success: false, error: 'PO sudah ditutup' });
        else mocks.close.mockRejectedValue(new Error('network'));
        open(); enterReason();
        fireEvent.click(screen.getByRole('button', { name: 'Ya, Tutup PO' }));
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect((screen.getByLabelText('Alasan penutupan') as HTMLTextAreaElement).value).toContain('Tidak dikirim lagi');
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it('prevents duplicate submission and dismissing while pending', async () => {
        let finish!: (value: { success: boolean }) => void;
        mocks.close.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        open(); enterReason();
        const form = screen.getByLabelText('Alasan penutupan').closest('form')!;
        fireEvent.submit(form); fireEvent.submit(form);
        expect(mocks.close).toHaveBeenCalledTimes(1);
        expect((screen.getByRole('button', { name: 'Batal' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(screen.getByRole('dialog')).toBeTruthy();
        await act(async () => finish({ success: true }));
    });
});
