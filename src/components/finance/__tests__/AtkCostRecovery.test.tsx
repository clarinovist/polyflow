// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { InventoryReconciliationDiagnosis } from '@/types/inventory-reconciliation';
const m = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn(), receipt: vi.fn() }));
vi.mock('@/actions/finance/inventory-reconciliation', () => ({ previewAtkRecoveryAction: m.preview, applyAtkRecoveryAction: m.apply, getAtkRecoveryReceiptAction: m.receipt }));
import { AtkCostRecovery } from '../AtkCostRecovery';
const data = { variant: { id: 'sku', unit: 'PCS' }, movements: [{ id: 'loss', type: 'ADJUSTMENT', from: 'office', to: null, quantity: '10', createdAt: '2026-01-15T03:00:00Z' }] } as InventoryReconciliationDiagnosis;
const proposal = { sourceMovementId: 'loss', kind: 'REFUND', fingerprint: 'a'.repeat(64), postingDate: '2026-01-15', amount: '20', originalLoss: '1020', expectedLoss: '1000', unitCost: '100', inventoryAccount: 'INV', lossAccount: 'LOSS', backupReady: true };
const receipt = { id: 'correction', kind: 'REFUND', journalId: 'journal', amount: '20', postingDate: proposal.postingDate, sourceMovementId: 'loss', alreadyApplied: false };
beforeEach(() => { sessionStorage.clear(); vi.resetAllMocks(); m.preview.mockResolvedValue({ success: true, data: { status: 'eligible', message: 'Preview valid', proposal } }); m.apply.mockResolvedValue({ success: true, data: receipt }); m.receipt.mockResolvedValue({ success: true, data: receipt }); });
afterEach(cleanup);
async function preview() {
    fireEvent.change(screen.getByLabelText('Mutasi loss sumber'), { target: { value: 'loss' } });
    fireEvent.click(screen.getByRole('button', { name: 'Periksa usulan koreksi' }));
    await screen.findByText('Preview valid');
}
function confirm() {
    fireEvent.change(screen.getByLabelText(/Alasan dan bukti/), { target: { value: 'Checked synthetic evidence' } });
    fireEvent.click(screen.getByRole('checkbox'));
}
it('requires preview, reason, confirmation and backup, then shows exact receipt', async () => {
    render(<AtkCostRecovery data={data} recoveryScope="test-tenant:actor" />);
    expect(screen.queryByRole('button', { name: 'Setujui dan terapkan koreksi' })).toBeNull();
    await preview(); const button = screen.getByRole('button', { name: 'Setujui dan terapkan koreksi' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); confirm(); expect(button.disabled).toBe(false);
    fireEvent.click(button); await screen.findByText(/Koreksi tersimpan dan diverifikasi/);
    expect(m.apply).toHaveBeenCalledWith(expect.objectContaining({ sourceMovementId: 'loss', fingerprint: proposal.fingerprint, reason: 'Checked synthetic evidence', confirmed: true }));
    expect(m.apply.mock.calls[0][0]).not.toHaveProperty('amount');
});
it('keeps the identical intent after lost response and finds its receipt', async () => {
    m.apply.mockRejectedValueOnce(new Error('network'));
    render(<AtkCostRecovery data={data} recoveryScope="test-tenant:actor" />); await preview(); confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Setujui dan terapkan koreksi' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Mutasi loss sumber') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ulangi permintaan yang sama' }));
    await screen.findByText(/Koreksi tersimpan dan diverifikasi/);
    expect(m.apply.mock.calls[0]).toEqual(m.apply.mock.calls[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Periksa bukti tersimpan' }));
    await screen.findByText(/Bukti correction/);
    expect(m.receipt).toHaveBeenCalledWith({ requestId: m.apply.mock.calls[0][0].requestId });
});
it('invalidates a rejected preview and can inspect again after lock contention', async () => {
    m.apply.mockResolvedValueOnce({ success: false, code: 'ATK_RECOVERY_BLOCKED', error: 'Transaksi lain aktif' });
    render(<AtkCostRecovery data={data} recoveryScope="test-tenant:actor" />); await preview(); confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Setujui dan terapkan koreksi' })); await screen.findByRole('alert');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect((screen.getByRole('button', { name: 'Periksa usulan koreksi' }) as HTMLButtonElement).disabled).toBe(false);
});
it('does not offer apply for blocked cases or unavailable storage', async () => {
    m.preview.mockResolvedValueOnce({ success: true, data: { status: 'blocked', message: 'Sumber ambigu' } });
    render(<AtkCostRecovery data={data} recoveryScope="test-tenant:actor" />); fireEvent.change(screen.getByLabelText('Mutasi loss sumber'), { target: { value: 'loss' } });
    fireEvent.click(screen.getByRole('button', { name: 'Periksa usulan koreksi' })); await screen.findByText('Sumber ambigu');
    expect(screen.queryByRole('checkbox')).toBeNull();
    m.preview.mockResolvedValueOnce({ success: true, data: { status: 'eligible', message: 'Preview valid', proposal: { ...proposal, backupReady: false } } });
    fireEvent.click(screen.getByRole('button', { name: 'Periksa usulan koreksi' })); await screen.findByText('Preview valid'); confirm();
    expect((screen.getByRole('button', { name: 'Setujui dan terapkan koreksi' }) as HTMLButtonElement).disabled).toBe(true);
});
it('selecting compensation clears prior confirmation and sends the distinct kind', async () => {
    render(<AtkCostRecovery data={data} recoveryScope="test-tenant:actor" />); await preview(); confirm();
    fireEvent.change(screen.getByLabelText('Tindakan'), { target: { value: 'COMPENSATION' } });
    expect(screen.queryByRole('checkbox')).toBeNull();
    m.preview.mockResolvedValueOnce({ success: true, data: { status: 'eligible', message: 'Inverse valid', proposal: { ...proposal, kind: 'COMPENSATION' } } });
    fireEvent.click(screen.getByRole('button', { name: 'Periksa usulan koreksi' })); await screen.findByText('Inverse valid');
    expect(m.preview).toHaveBeenLastCalledWith({ sourceMovementId: 'loss', kind: 'COMPENSATION' });
    expect(screen.getByText(/Debit LOSS; kredit INV/)).toBeTruthy();
});
it('receipt lookup can recover across a page refresh without a new apply', async () => {
    render(<AtkCostRecovery data={data} recoveryScope="test-tenant:actor" />);
    fireEvent.change(screen.getByLabelText('Periksa nomor permintaan'), { target: { value: 'existing-request' } });
    fireEvent.click(screen.getByRole('button', { name: 'Periksa bukti tersimpan' })); await screen.findByText(/Bukti correction/);
    expect(m.apply).not.toHaveBeenCalled();
});
