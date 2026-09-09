// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { remove, voidBundle, detail, refresh, toast } = vi.hoisted(() => ({ remove: vi.fn(), voidBundle: vi.fn(), detail: vi.fn(), refresh: vi.fn(), toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/finance/finance', () => ({ deletePayment: remove }));
vi.mock('@/actions/finance/barter-actions', () => ({ voidBarterSettlement: voidBundle, getBarterSettlementDetail: detail }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast }));
import { SharedPaymentTable } from '../SharedPaymentTable';
const rows = [
    { id: 'a', paymentNumber: 'PAY-A', referenceNumber: 'BRT-A', settlementId: 'sa', barterLeg: 'AR_OFFSET' as const, date: '2026-09-09', entityName: 'Alpha', amount: 600, method: 'Barter', status: 'POSTED' },
    { id: 'b', paymentNumber: 'PAY-B', referenceNumber: 'BRT-B', settlementId: 'sb', barterLeg: 'AP_CASH' as const, date: '2026-09-09', entityName: 'Beta', amount: 400, method: 'Cash', status: 'POSTED' },
    { id: 'c', paymentNumber: 'PAY-C', referenceNumber: 'PAY-C', date: '2026-09-09', entityName: 'Ordinary', amount: 100, method: 'Cash', status: 'COMPLETED' },
];
const renderTable = (payments = rows) => render(<SharedPaymentTable title="Payments" description="History" payments={payments} type="received" />);
const evidence = (number: string) => ({ success: true, data: { settlementNumber: number, barterDate: '2026-09-09', status: 'VOIDED', customer: { name: 'Customer' }, supplier: { name: 'Supplier' }, invoice: { invoiceNumber: 'INV-1' }, purchaseInvoice: { invoiceNumber: 'BILL-1' }, barterAmount: 600, cashAmount: 400, receivableAfter: 0, payableAfter: 0, notes: 'Agreement', createdBy: { name: 'Finance' }, voidReason: 'Correction' } });
describe('SharedPaymentTable', () => {
    beforeEach(() => { vi.resetAllMocks(); remove.mockResolvedValue({ success: true }); voidBundle.mockResolvedValue({ success: true }); });
    it('labels noncash/top-up, searches, and never offers ordinary delete for a voided package', () => {
        renderTable([...rows, { ...rows[0], id: 'v', paymentNumber: 'PAY-V', status: 'VOIDED' }]);
        expect(screen.getAllByText('Pelunasan nonkas — Barter')).toHaveLength(2); expect(screen.getByText('Uang keluar — Tunai')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Batalkan PAY-V' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByPlaceholderText('Cari referensi atau pelanggan...'), { target: { value: 'Beta' } });
        expect(screen.queryByText('Alpha')).toBeNull(); expect(screen.getByText('Beta')).toBeTruthy();
    });
    it('cancelled reason cannot leak to another row; submits the selected package only', async () => {
        renderTable(); fireEvent.click(screen.getByRole('button', { name: 'Batalkan PAY-A' }));
        fireEvent.change(screen.getByLabelText('Alasan pembatalan'), { target: { value: 'Reason for Alpha' } });
        fireEvent.click(screen.getByRole('button', { name: /^Batal$/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Batalkan PAY-B' }));
        expect((screen.getByLabelText('Alasan pembatalan') as HTMLInputElement).value).toBe('');
        expect((screen.getByRole('button', { name: /^Batalkan Barter$/ }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Alasan pembatalan'), { target: { value: 'Reason for Beta' } });
        fireEvent.click(screen.getByRole('button', { name: /^Batalkan Barter$/ }));
        await waitFor(() => expect(voidBundle).toHaveBeenCalledWith({ settlementId: 'sb', reason: 'Reason for Beta' }));
        expect(remove).not.toHaveBeenCalled(); expect(refresh).toHaveBeenCalled();
    });
    it('ordinary deletion still routes correctly and reports action failure', async () => {
        remove.mockResolvedValue({ success: false, error: 'Closed period' });
        renderTable(); fireEvent.click(screen.getByRole('button', { name: 'Hapus PAY-C' }));
        fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^Hapus$/ }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Closed period'));
        expect(remove).toHaveBeenCalledWith('c'); expect(voidBundle).not.toHaveBeenCalled();
    });
    it('shows loading only on requested row; stale detail cannot overwrite latest row', async () => {
        let resolveA!: (value: unknown) => void; let resolveB!: (value: unknown) => void;
        detail.mockImplementationOnce(() => new Promise(r => { resolveA = r; })).mockImplementationOnce(() => new Promise(r => { resolveB = r; }));
        renderTable(); fireEvent.click(screen.getByRole('button', { name: 'Detail PAY-A' }));
        expect((screen.getByRole('button', { name: 'Detail PAY-A' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Detail PAY-B' }) as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Detail PAY-B' }));
        await act(async () => { resolveB(evidence('LATEST-B')); });
        await act(async () => { resolveA(evidence('STALE-A')); });
        expect(screen.getByRole('heading', { name: 'LATEST-B' })).toBeTruthy(); expect(screen.queryByText('STALE-A')).toBeNull();
        expect(screen.getByText('Alasan batal: Correction')).toBeTruthy();
    });
    it('handles detail network rejection and unlocks its row', async () => {
        detail.mockRejectedValue(new Error('offline')); renderTable();
        fireEvent.click(screen.getByRole('button', { name: 'Detail PAY-A' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Gagal memuat detail barter.'));
        expect((screen.getByRole('button', { name: 'Detail PAY-A' }) as HTMLButtonElement).disabled).toBe(false);
    });
});
