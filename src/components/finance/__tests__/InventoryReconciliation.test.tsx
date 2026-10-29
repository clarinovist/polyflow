// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryReconciliationDiagnosis } from '@/types/inventory-reconciliation';
const m = vi.hoisted(() => ({ list: vi.fn(), inspect: vi.fn(), read: vi.fn(), preview: vi.fn(), apply: vi.fn(), receipt: vi.fn() }));
vi.mock('@/actions/finance/inventory-reconciliation', () => ({ listInventoryReconciliation: m.list, inspectInventoryReconciliationAction: m.inspect, previewAtkRecoveryAction: m.preview, applyAtkRecoveryAction: m.apply, getAtkRecoveryReceiptAction: m.receipt }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: m.read }));
import { InventoryReconciliation } from '../InventoryReconciliation';
import { InventoryReconciliationDetail } from '../InventoryReconciliationDetail';
import Page from '@/app/finance/inventory-reconciliation/page';
const item = { id: 'sku', skuCode: 'TEST-ATK', name: 'Synthetic supplies', unit: 'PCS', archived: false };
const diagnosis: InventoryReconciliationDiagnosis = {
    variant: item, checkedAt: '2026-01-15T00:00:00Z', stockValue: '1000', basisTotal: '980', difference: '20', healthFlagged: true,
    locations: [{ id: 'loc', name: 'Synthetic office', quantity: '10', averageCost: null, value: '0', companyInternal: true }],
    basis: [{ accountId: 'inv', code: 'INV', name: 'Inventory', value: '980' }],
    findings: [{ code: 'GAP', title: 'Basis jurnal kurang', nextStep: 'Periksa bukti asal.' }],
    movements: [{ id: 'm', type: 'ADJUSTMENT', quantity: '10', cost: null, createdAt: '2026-01-15T00:00:00Z', from: 'Office', to: null, receiptNumber: null }],
    journals: [], coverage: { movementCount: 200, movementsTruncated: true, journalsTruncated: true },
};
beforeEach(() => { sessionStorage.clear(); vi.resetAllMocks(); m.list.mockResolvedValue({ success: true, data: { items: [item], page: 1, hasMore: true } }); m.inspect.mockResolvedValue({ success: true, data: diagnosis }); });
afterEach(cleanup);
async function search() { fireEvent.click(screen.getByRole('button', { name: 'Cari ATK' })); await screen.findByRole('button', { name: 'Periksa TEST-ATK' }); }

describe('ATK reconciliation read-only UI', () => {
    it('retains unknown requests above replaceable diagnosis and restores them after refresh, tenant-scoped', async () => {
        const preview = { sourceMovementId: 'm', kind: 'REFUND', fingerprint: 'a'.repeat(64), postingDate: '2026-01-15', amount: '20', originalLoss: '1020', expectedLoss: '1000', unitCost: '100.1234', inventoryAccount: 'INV', lossAccount: 'LOSS', backupReady: true };
        m.preview.mockResolvedValue({ success: true, data: { status: 'eligible', message: 'Preview valid', proposal: preview } });
        m.apply.mockRejectedValue(new Error('response lost'));
        const view = render(<InventoryReconciliation recoveryScope="test-tenant:actor" />); await search();
        fireEvent.click(screen.getByRole('button', { name: 'Periksa TEST-ATK' })); await screen.findByLabelText('Mutasi loss sumber');
        fireEvent.change(screen.getByLabelText('Mutasi loss sumber'), { target: { value: 'm' } });
        fireEvent.click(screen.getByRole('button', { name: 'Periksa usulan koreksi' })); await screen.findByText('Preview valid');
        expect(screen.getByText('Rp100,1234')).toBeTruthy();
        fireEvent.change(screen.getByLabelText(/Alasan dan bukti/), { target: { value: 'Synthetic evidence checked' } }); fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Setujui dan terapkan koreksi' })); await screen.findByRole('region', { name: 'Permintaan koreksi belum terkonfirmasi' });
        const req = m.apply.mock.calls[0][0];
        expect((screen.getByLabelText('Cari SKU atau nama barang') as HTMLInputElement).matches(':disabled')).toBe(true);
        expect((screen.getByRole('button', { name: 'Periksa ulang SKU' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Periksa ulang SKU' })); expect(m.inspect).toHaveBeenCalledTimes(1);
        view.unmount();
        const refreshed = render(<InventoryReconciliation recoveryScope="test-tenant:actor" />);
        await screen.findByText(`Nomor permintaan: ${req.requestId}`);
        m.receipt.mockResolvedValue({ success: true, data: { id: 'stored-correction' } });
        fireEvent.click(screen.getByRole('button', { name: 'Pulihkan bukti permintaan' })); await screen.findByText(/Koreksi tercatat: stored-correction/);
        expect(sessionStorage.getItem('atk-recovery:v1:test-tenant:actor')).toBeNull();
        refreshed.unmount(); sessionStorage.setItem('atk-recovery:v1:other-tenant:actor', JSON.stringify(req));
        render(<InventoryReconciliation recoveryScope="test-tenant:actor" />);
        expect(screen.queryByRole('region', { name: 'Permintaan koreksi belum terkonfirmasi' })).toBeNull();
    });
    it('requires Finance access before page rendering', async () => {
        m.read.mockRejectedValueOnce(new Error('denied'));
        await expect(Page()).rejects.toThrow('denied');
        m.read.mockResolvedValue({ user: { id: "actor", tenantId: "test-tenant" } }); expect(await Page()).toBeTruthy(); expect(m.list).not.toHaveBeenCalled();
    });
    it('searches and inspects explicitly, labels partial evidence and never offers a writer', async () => {
        render(<InventoryReconciliation recoveryScope="test-tenant:actor" />); expect(m.list).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('Cari SKU atau nama barang'), { target: { value: 'TEST' } }); await search();
        expect(m.list).toHaveBeenCalledWith({ query: 'TEST', page: 1 });
        fireEvent.click(screen.getByRole('button', { name: 'Periksa TEST-ATK' }));
        await screen.findByRole('region', { name: 'Diagnosis nilai ATK' });
        expect(m.inspect).toHaveBeenCalledWith({ variantId: 'sku' });
        expect(screen.getByText(/Kesiapan pemakaian belum diperiksa/)).toBeTruthy();
        expect(screen.getByText(/Riwayat mutasi dibatasi/)).toBeTruthy();
        expect(screen.getByText(/Daftar jurnal dibatasi/)).toBeTruthy();
        expect(screen.getAllByText('Belum diketahui')).toHaveLength(2);
        expect(screen.queryByRole('button', { name: /Terapkan|Setujui/ })).toBeNull();
        await waitFor(() => expect((screen.getByLabelText('Cari SKU atau nama barang') as HTMLInputElement).matches(':disabled')).toBe(false));
        fireEvent.change(screen.getByLabelText('Cari SKU atau nama barang'), { target: { value: 'OTHER' } });
        expect(screen.queryByRole('region', { name: 'Diagnosis nilai ATK' })).toBeNull();
    });
    it('distinguishes failure from empty results and clears previous SKU diagnosis on retry', async () => {
        render(<InventoryReconciliation recoveryScope="test-tenant:actor" />); await search();
        fireEvent.click(screen.getByRole('button', { name: 'Periksa TEST-ATK' })); await screen.findByRole('region', { name: 'Diagnosis nilai ATK' });
        m.inspect.mockRejectedValueOnce(new Error('network'));
        await waitFor(() => expect((screen.getByRole('button', { name: 'Periksa ulang SKU' }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: 'Periksa ulang SKU' })); await screen.findByRole('alert');
        expect(screen.queryByRole('region', { name: 'Diagnosis nilai ATK' })).toBeNull();
        expect(screen.getByRole('alert').textContent).toContain('tidak ada perubahan');
        m.list.mockResolvedValueOnce({ success: true, data: { items: [], page: 1, hasMore: false } });
        fireEvent.click(screen.getByRole('button', { name: 'Cari ATK' }));
        await screen.findByText(/Tidak ada SKU pada halaman/); expect(screen.queryByRole('alert')).toBeNull();
    });
    it('uses the submitted search for pagination and shows returned failures', async () => {
        render(<InventoryReconciliation recoveryScope="test-tenant:actor" />); await search();
        fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' })); await screen.findByRole('button', { name: 'Periksa TEST-ATK' });
        expect(m.list).toHaveBeenLastCalledWith({ query: '', page: 2 });
        m.inspect.mockResolvedValueOnce({ success: false, error: 'Access denied' });
        fireEvent.click(screen.getByRole('button', { name: 'Periksa TEST-ATK' })); await screen.findByRole('alert');
        expect(screen.getByRole('alert').textContent).toBe('Access denied');
        m.list.mockRejectedValueOnce(new Error('network'));
        fireEvent.click(screen.getByRole('button', { name: 'Cari ATK' })); await screen.findByText(/Pemeriksaan belum berhasil/);
    });
    it('shows signed account balances and limited journal lines without declaring matched totals ready', () => {
        render(<InventoryReconciliationDetail data={{ ...diagnosis, healthFlagged: false, findings: [], variant: { ...item, archived: true },
            basis: [{ accountId: 'inv', code: 'INV', name: 'Inventory', value: '-20' }],
            journals: [{ id: 'j', number: 'JE-SYNTHETIC', movementId: 'm', date: diagnosis.checkedAt, status: 'DRAFT', referenceType: null, autoGenerated: false, linesTruncated: true,
                lines: [{ accountCode: 'INV', accountName: 'Inventory', debit: '0', credit: '20', currency: 'IDR' }] }] }} />);
        expect(screen.getByText('Rp-20')).toBeTruthy(); expect(screen.getByText(/Bukan pengesahan biaya historis/)).toBeTruthy();
        expect(screen.getByText(/Jangan menghitung keseimbangan/)).toBeTruthy();
        expect(screen.getByText(/JE-SYNTHETIC/)).toBeTruthy();
    });
});
