import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { getFinanceMobileOverview } from '../mobile-dashboard';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(), transaction: vi.fn(), tenantDb: vi.fn(),
    arAggregate: vi.fn(), apAggregate: vi.fn(), arList: vi.fn(), apList: vi.fn(),
    journals: vi.fn(), reconciliations: vi.fn(),
}));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: mocks.guard }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: mocks.tenantDb }));
const d = (n: number) => new Prisma.Decimal(n);
const tx = {
    invoice: { aggregate: mocks.arAggregate, findMany: mocks.arList },
    purchaseInvoice: { aggregate: mocks.apAggregate, findMany: mocks.apList, fields: { paidAmount: 'paidAmount-field' } },
    journalEntry: { count: mocks.journals }, bankReconciliation: { count: mocks.reconciliations },
};
describe('getFinanceMobileOverview', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({ user: { role: 'FINANCE' } });
        mocks.tenantDb.mockReturnValue({ $transaction: mocks.transaction });
        mocks.transaction.mockImplementation((fn) => fn(tx));
        mocks.arAggregate.mockResolvedValue({ _count: 0, _sum: { remainingAmount: null } });
        mocks.apAggregate.mockResolvedValue({ _count: 0, _sum: { totalAmount: null, paidAmount: null } });
        mocks.arList.mockResolvedValue([]); mocks.apList.mockResolvedValue([]);
        mocks.journals.mockResolvedValue(0); mocks.reconciliations.mockResolvedValue(0);
    });
    it('returns a genuine empty overview in one repeatable read snapshot', async () => {
        const result = await getFinanceMobileOverview();
        expect(result).toMatchObject({ success: true, data: { highlights: { overdueArCount: 0, overdueApAmount: 0 }, recentInvoices: [] } });
        expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    });
    it('uses full aggregates and net amounts, independent of the limited list', async () => {
        mocks.arAggregate.mockResolvedValue({ _count: 35, _sum: { remainingAmount: d(3500) } });
        mocks.apAggregate.mockResolvedValue({ _count: 22, _sum: { totalAmount: d(22000), paidAmount: d(4000) } });
        mocks.apList.mockResolvedValue([{ id: 'ap', invoiceNumber: 'AP', dueDate: new Date('2026-01-01'), totalAmount: d(1000), paidAmount: d(400), status: 'PARTIAL', purchaseOrder: null }]);
        const result = await getFinanceMobileOverview();
        expect(result).toMatchObject({ success: true, data: { highlights: { overdueArCount: 35, overdueArAmount: 3500, overdueApCount: 22, overdueApAmount: 18000 }, recentInvoices: [{ amount: 600, type: 'AP' }] } });
        expect(mocks.apAggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, totalAmount: { gt: 'paidAmount-field' } }) }));
        expect(mocks.arAggregate.mock.calls[0][0].where.remainingAmount).toEqual({ gt: 0 });
        expect(mocks.arAggregate.mock.calls[0][0]).not.toHaveProperty('take');
    });
    it('keeps both AR and AP and orders by due date rather than concatenation', async () => {
        mocks.arList.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `ar-${i}`, invoiceNumber: null, dueDate: new Date('2026-02-01'), remainingAmount: d(80), status: 'PARTIAL', salesOrder: null })));
        mocks.apList.mockResolvedValue([{ id: 'ap', invoiceNumber: 'AP', dueDate: new Date('2026-01-01'), totalAmount: d(1000), paidAmount: d(400), status: 'PARTIAL', purchaseOrder: { supplier: { name: 'Synthetic supplier' } } }]);
        const result = await getFinanceMobileOverview();
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.recentInvoices).toHaveLength(11);
        expect(result.data.recentInvoices[0]).toMatchObject({ type: 'AP', amount: 600 });
        expect(result.data.recentInvoices[1]).toMatchObject({ type: 'AR', amount: 80 });
    });
    it('does not turn a failed query into a zero-success dashboard', async () => {
        mocks.arAggregate.mockRejectedValue(new Error('Synthetic read failure'));
        expect(await getFinanceMobileOverview()).toMatchObject({ success: false });
    });
    it('fails closed without an explicit tenant DB', async () => {
        mocks.tenantDb.mockReturnValue(undefined);
        expect(await getFinanceMobileOverview()).toMatchObject({ success: false });
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
    it('checks access before starting any query', async () => {
        mocks.guard.mockRejectedValue(new Error('Denied'));
        expect(await getFinanceMobileOverview()).toMatchObject({ success: false });
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
});
