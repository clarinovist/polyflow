import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../finance-dry-run-tenant', () => ({ requireFinanceDryRunSnapshot: vi.fn() }));
vi.mock('../finance-reconciliation-service', () => ({ reconcileFinance: vi.fn() }));
vi.mock('../finance-dry-run-recipients', () => ({ previewFinanceRecipients: vi.fn() }));
vi.mock('@/lib/telegram/digest/detectors', () => ({ detectMissingFinanceJournals: vi.fn() }));
import { runFinanceDryRun } from '../finance-dry-run-service';
import { requireFinanceDryRunSnapshot } from '../finance-dry-run-tenant';
import { reconcileFinance } from '../finance-reconciliation-service';
import { previewFinanceRecipients } from '../finance-dry-run-recipients';
import { detectMissingFinanceJournals } from '@/lib/telegram/digest/detectors';
import type { Prisma } from '@prisma/client';
import { evidenceToText } from '@/lib/bot/evidence';

const tx = {} as Prisma.TransactionClient;
const range = { startDate: '2026-08-01', endDate: '2026-08-31' };
const tenant = { tenantId: 't', subdomain: 'fixture', databaseName: 'fixture_test' };
const now = new Date('2026-08-15T01:00:00Z');
const detector = { detector: 'missing_finance_journal', status: 'ok' as const, requiredResources: ['/finance/journals'], items: [{ entityId: 'inv', entityKey: 'missing_finance_journal:SALES_INVOICE_UNPOSTED:inv', entityType: 'Invoice', severity: 'critical' as const, headline: 'Invoice jurnal belum POSTED' }] };
const report = { totalManufacturingCosts: 0, inventoryChange: 0, revenue: [], cogs: [], opex: [], other: [], totalRevenue: 0, totalCOGS: 0, grossProfit: 0, totalOpEx: 0, operatingIncome: 0, totalOther: 0, netIncome: 0 };
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireFinanceDryRunSnapshot).mockReturnValue({ tenant, tx, checkedAt: now });
    vi.mocked(detectMissingFinanceJournals).mockResolvedValue(detector);
    vi.mocked(previewFinanceRecipients).mockResolvedValue({ candidates: [], truncated: false });
    vi.mocked(reconcileFinance).mockResolvedValue({ range: { ...range, start: now, end: now }, report,
        cogs: { rows: [], count: 0, total: 0, truncated: false }, invoices: { rows: [], count: 0, total: 0, truncated: false }, cogsDifference: 0 });
});
describe('finance dry-run orchestration', () => {
    it('executes detectors and reconciliation on the same verified snapshot without enabling live lifecycle', async () => {
        const result = await runFinanceDryRun(range);
        expect(result.mode).toBe('dry-run'); expect(result.tenant).toEqual(tenant);
        expect(result.journals.items).toHaveLength(1);
        expect(result.journals.scope).toBe('all-time');
        expect(result.completeness).toBe('partial');
        expect(result.rollout).toMatchObject({ allowed: false, picVerified: false });
        expect(detectMissingFinanceJournals).toHaveBeenCalledWith(tx);
        expect(reconcileFinance).toHaveBeenCalledWith(tx, range);
        expect(previewFinanceRecipients).toHaveBeenCalledWith(tx, tenant.tenantId, ['/finance/journals', '/finance/reports/income-statement'], now);
        const text = evidenceToText(result.reconciliation);
        expect(text).toContain('BUKAN tambahan laba'); expect(text).toContain('Reference NULL');
        expect(result.limitations.join(' ')).toMatch(/kandidat.*mapping/i);
    });
    it.each([{}, { ...range, endDate: '2026-02-30' }, { ...range, tenantId: 'override' }, { ...range, startDate: '2027-01-01' }])('validates range strictly before reads', async input => {
        await expect(runFinanceDryRun(input)).rejects.toThrow(); expect(reconcileFinance).not.toHaveBeenCalled();
    });
    it('requires a live verified ALS scope', async () => {
        vi.mocked(requireFinanceDryRunSnapshot).mockImplementationOnce(() => { throw new Error('Missing snapshot'); });
        await expect(runFinanceDryRun(range)).rejects.toThrow(); expect(detectMissingFinanceJournals).not.toHaveBeenCalled();
    });
    it('returns explicit empty observations, never a health certification', async () => {
        vi.mocked(detectMissingFinanceJournals).mockResolvedValueOnce({ ...detector, items: [] });
        const result = await runFinanceDryRun(range); expect(result.journals.items).toEqual([]); expect(result.completeness).toBe('partial');
    });
    it('preserves truncation as incomplete inspection', async () => {
        vi.mocked(detectMissingFinanceJournals).mockResolvedValueOnce({ ...detector, status: 'truncated' });
        const result = await runFinanceDryRun(range); expect(result.journals.status).toBe('truncated'); expect(result.completeness).toBe('partial');
    });
    it('does not convert failed detection to an empty healthy result or expose errors', async () => {
        vi.mocked(detectMissingFinanceJournals).mockResolvedValueOnce({ ...detector, status: 'failed', error: 'secret SQL' });
        await expect(runFinanceDryRun(range)).rejects.toThrow(/^Pemeriksaan finance dry-run gagal\.$/);
        expect(previewFinanceRecipients).not.toHaveBeenCalled();
    });
    it.each(['reconcile', 'recipients'])('sanitizes %s errors', async where => {
        if (where === 'reconcile') vi.mocked(reconcileFinance).mockRejectedValueOnce(new Error('private data'));
        else vi.mocked(previewFinanceRecipients).mockRejectedValueOnce(new Error('private data'));
        await expect(runFinanceDryRun(range)).rejects.toThrow(/^Pemeriksaan finance dry-run gagal\.$/);
    });
});
