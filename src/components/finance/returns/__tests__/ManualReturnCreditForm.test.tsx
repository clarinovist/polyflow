// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceReturnDetail } from '@/services/finance/sales-return-query-service';
const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/finance/sales-returns', () => ({ postFinanceManualSalesReturnCredit: mocks.post }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { ManualReturnCreditForm } from '../ManualReturnCreditForm';
const row = { id: 'return', status: 'COMPLETED', credit: null, returnNumber: 'SR-TEST', salesOrder: { orderNumber: 'SO-TEST' }, invoices: [{ id: 'invoice', invoiceNumber: 'INV-TEST', status: 'OVERDUE', totalAmount: '1110.00', paidAmount: '0.00', creditedAmount: '0.00', remaining: '1110.00', basis: [] }] } as unknown as FinanceReturnDetail;
function fill() {
    fireEvent.change(screen.getByLabelText('Invoice yang dikreditkan'), { target: { value: 'invoice' } });
    fireEvent.change(screen.getByLabelText('Total kredit termasuk pajak (Rp)'), { target: { value: '222' } });
    fireEvent.change(screen.getByLabelText('Komponen pajak kredit (Rp)'), { target: { value: '22' } });
    fireEvent.change(screen.getByLabelText('Alasan persetujuan'), { target: { value: 'Verified return amount' } });
    fireEvent.change(screen.getByLabelText('Referensi bukti pemeriksaan'), { target: { value: 'Original invoice and signed receipt' } });
    fireEvent.click(screen.getByRole('checkbox'));
}
describe('manual credit explicit approval UI', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.post.mockResolvedValue({ success: true, data: { status: 'POSTED' } }); });
    it('allows missing-snapshot manual valuation only after explicit fields, preview and confirmation', async () => {
        render(<ManualReturnCreditForm row={row} />);
        expect(screen.getByLabelText('Invoice yang dikreditkan')).toHaveProperty('value', '');
        expect(screen.getByLabelText('Komponen pajak kredit (Rp)')).toHaveProperty('value', '');
        expect(screen.getByRole('button', { name: 'Periksa kredit manual' })).toHaveProperty('disabled', true);
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Periksa kredit manual' }));
        expect(screen.getByRole('dialog').textContent).toContain('888');
        expect(mocks.post).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Setujui & posting kredit manual' }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
        expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({ returnId: 'return', invoiceId: 'invoice', totalAmount: '222', taxAmount: '22', expectedRemaining: '1110.00', confirmed: true }));
    });
    it('keeps error visible, no false success/refresh and retries same instructions', async () => {
        mocks.post.mockResolvedValue({ success: false, error: 'Jurnal lama: rekonsiliasi dahulu' });
        render(<ManualReturnCreditForm row={row} />); fill();
        fireEvent.click(screen.getByRole('button', { name: 'Periksa kredit manual' }));
        fireEvent.click(screen.getByRole('button', { name: 'Setujui & posting kredit manual' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('rekonsiliasi'));
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it.each(['DRAFT', 'CONFIRMED', 'CANCELLED'] as const)('cannot approve %s', status => {
        render(<ManualReturnCreditForm row={{ ...row, status }} />);
        expect(screen.queryByRole('button')).toBeNull();
    });
});
