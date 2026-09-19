// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ preview: vi.fn(), post: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/finance/sales-returns', () => ({ getFinanceReturnCreditProposal: mocks.preview, postFinanceProposedReturnCredit: mocks.post }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { ReturnCreditConfirmation } from '../ReturnCreditConfirmation';
const proposal = { ready: true, invoiceId: 'invoice', invoiceNumber: 'INV-TEST', orderNumber: 'SO-TEST', totalAmount: '222', taxAmount: '22', remaining: '1110', remainingAfter: '888', source: 'SO_REVIEW', fingerprint: 'a'.repeat(64), evidence: 'Prepared document references' };
describe('concise return confirmation', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.preview.mockResolvedValue({ success: true, data: proposal }); mocks.post.mockResolvedValue({ success: true, data: { status: 'POSTED' } }); });
    it('requires no invoice/amount/tax/reason typing, shows source and balance, posts only on explicit click', async () => {
        render(<ReturnCreditConfirmation returnId="return" />);
        const button = await screen.findByRole('button', { name: 'Konfirmasi & posting kredit retur' });
        expect(screen.getByText(/SO-TEST → INV-TEST/)).toBeTruthy(); expect(screen.getByText(/Rp.*888/)).toBeTruthy();
        expect(screen.getByText(/rincian SO saat ini/)).toBeTruthy(); expect(screen.queryByRole('spinbutton')).toBeNull();
        expect(mocks.post).not.toHaveBeenCalled(); fireEvent.click(button);
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
        expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({ returnId: 'return', fingerprint: proposal.fingerprint, confirmed: true }));
    });
    it('shows stale/rejected posting honestly and permits reload', async () => {
        mocks.post.mockResolvedValue({ success: false, error: 'Saldo berubah' }); render(<ReturnCreditConfirmation returnId="return" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Konfirmasi & posting kredit retur' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Saldo berubah'));
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it('does not show a posting button for ambiguous source or failed load', async () => {
        mocks.preview.mockResolvedValue({ success: true, data: { ready: false, reason: 'Beberapa invoice' } });
        render(<ReturnCreditConfirmation returnId="return" />);
        await screen.findByText(/Beberapa invoice/); expect(screen.queryByRole('button', { name: 'Konfirmasi & posting kredit retur' })).toBeNull();
    });
});
