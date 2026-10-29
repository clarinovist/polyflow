// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ inspect: vi.fn(), apply: vi.fn() }));
vi.mock('@/actions/finance/production-cost-recovery', () => ({ inspectProductionCost: m.inspect, applyProductionCost: m.apply }));
import { ProductionCostRecovery } from '../ProductionCostRecovery';
const data = { orderId: 'wo', orderNumber: 'WO-SYNTHETIC', checkedAt: '2026-01-15T03:00:00Z', status: 'eligible', savedQuantity: '10', unit: 'KG', outputEntries: 1,
    nullCostScraps: 1, wip: { valid: false, remaining: null, reason: 'missing' }, findings: ['Synthetic source check'], previousAuditId: null,
    proposal: { fingerprint: 'a'.repeat(64), absorbedValue: '140', scraps: [{ movementId: 'scrap', quantity: '2' }], recoveryStorageReady: true } };
async function inspect() { fireEvent.click(screen.getByRole('button', { name: 'Periksa biaya' })); await screen.findByRole('region', { name: 'Hasil pemeriksaan biaya' }); }
async function confirm() {
    fireEvent.change(screen.getByLabelText(/Alasan koreksi/), { target: { value: 'Verified synthetic correction' } });
    fireEvent.click(screen.getByRole('checkbox'));
}

describe('production cost recovery UI', () => {
    beforeEach(() => { vi.resetAllMocks(); m.inspect.mockResolvedValue({ success: true, data }); m.apply.mockResolvedValue({ success: true, data: { auditId: 'audit', alreadyApplied: false } }); });
    afterEach(cleanup);
    it('requires inspection, reason and confirmation before apply; distinguishes cumulative saved output', async () => {
        render(<ProductionCostRecovery orderId="wo" />);
        expect(screen.queryByText(/Setujui & terapkan/)).toBeNull(); await inspect();
        expect(screen.getByText(/Ini total kumulatif/)).toBeTruthy();
        const apply = screen.getByRole('button', { name: 'Setujui & terapkan koreksi' }) as HTMLButtonElement;
        expect(apply.disabled).toBe(true); await confirm(); expect(apply.disabled).toBe(false);
        fireEvent.click(apply); await screen.findByRole('status');
        expect(m.apply).toHaveBeenCalledWith({ orderId: 'wo', fingerprint: data.proposal.fingerprint, reason: 'Verified synthetic correction', confirmed: true });
        expect(screen.queryByRole('checkbox')).toBeNull();
    });
    it('never offers apply for multi-output or missing recovery storage', async () => {
        m.inspect.mockResolvedValueOnce({ success: true, data: { ...data, status: 'unsupported', outputEntries: 6, proposal: null } });
        render(<ProductionCostRecovery orderId="wo" />); await inspect();
        expect(screen.getByText(/Koreksi riwayat ini belum didukung/)).toBeTruthy(); expect(screen.queryByRole('checkbox')).toBeNull();
        m.inspect.mockResolvedValueOnce({ success: true, data: { ...data, proposal: { ...data.proposal, recoveryStorageReady: false } } });
        await inspect(); await confirm(); expect((screen.getByRole('button', { name: 'Setujui & terapkan koreksi' }) as HTMLButtonElement).disabled).toBe(true);
    });
    it('keeps identical request on lost response and displays idempotent receipt', async () => {
        m.apply.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ success: true, data: { auditId: 'audit', alreadyApplied: true } });
        render(<ProductionCostRecovery orderId="wo" />); await inspect(); await confirm();
        fireEvent.click(screen.getByRole('button', { name: 'Setujui & terapkan koreksi' }));
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', { name: 'Ulangi permintaan yang sama' }));
        await screen.findByRole('status'); expect(m.apply.mock.calls[1]).toEqual(m.apply.mock.calls[0]);
        expect(screen.getByText(/tidak diterapkan dua kali/)).toBeTruthy();
    });
    it('invalidates stale preview and clears lookup-specific state on another order', async () => {
        m.apply.mockResolvedValue({ success: false, error: 'Data berubah' });
        render(<ProductionCostRecovery />);
        fireEvent.change(screen.getByLabelText('Nomor SPK persis'), { target: { value: 'WO-SYNTHETIC' } });
        await inspect(); await confirm(); fireEvent.click(screen.getByRole('button', { name: 'Setujui & terapkan koreksi' }));
        await screen.findByRole('alert'); await waitFor(() => expect(screen.queryByRole('checkbox')).toBeNull());
        expect(m.inspect).toHaveBeenCalledWith({ orderNumber: 'WO-SYNTHETIC' });
    });
    it('shows Finance review label and forward-cost hint for needs_review status', async () => {
        m.inspect.mockResolvedValueOnce({ success: true, data: { ...data, status: 'needs_review', proposal: null } });
        render(<ProductionCostRecovery orderId="wo" />);
        await inspect();
        expect(screen.getByText(/Perlu tinjauan Finance/)).toBeTruthy();
        expect(screen.queryByText(/Perlu pemeriksaan tim sistem/)).toBeNull();
        expect(screen.getByRole('region', { name: 'Lanjutkan tanpa koreksi riwayat' })).toBeTruthy();
    });
});
