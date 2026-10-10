vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    requireMobilePortalAccess: vi.fn().mockResolvedValue({}),
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';
import {
    getFinanceMobileInvoiceDetail,
    getFinanceMobileOverview,
} from '../mobile-dashboard';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(),
    features: vi.fn(),
    transaction: vi.fn(),
    tenantDb: vi.fn(),
    arAggregate: vi.fn(),
    apAggregate: vi.fn(),
    arList: vi.fn(),
    apList: vi.fn(),
    arDetail: vi.fn(),
    apDetail: vi.fn(),
    journals: vi.fn(),
    reconciliations: vi.fn(),
    fiscal: vi.fn(),
    payrollPeriod: vi.fn(),
    payslip: vi.fn(),
}));
vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess: mocks.guard,
}));
vi.mock('@/actions/admin/permissions', () => ({
    getMyExplicitFeaturePermissions: mocks.features,
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: mocks.tenantDb,
}));

const d = (n: number) => new Prisma.Decimal(n);
const delegates = {
    invoice: { aggregate: mocks.arAggregate, findMany: mocks.arList, findFirst: mocks.arDetail },
    purchaseInvoice: {
        aggregate: mocks.apAggregate,
        findMany: mocks.apList,
        findFirst: mocks.apDetail,
        fields: { paidAmount: 'paidAmount-field' },
    },
    journalEntry: { count: mocks.journals },
    bankReconciliation: { count: mocks.reconciliations },
    fiscalPeriod: { findUnique: mocks.fiscal },
    payrollPeriod: { findFirst: mocks.payrollPeriod },
    payslip: { groupBy: mocks.payslip },
};
const tenantDb = { $transaction: mocks.transaction, ...delegates };

describe('getFinanceMobileOverview', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({ user: { role: 'FINANCE' } });
        mocks.features.mockResolvedValue({
            success: true,
            data: ['feature:view-prices'],
        });
        mocks.tenantDb.mockReturnValue(tenantDb);
        mocks.transaction.mockImplementation((fn: (client: unknown) => unknown) =>
            fn(tenantDb),
        );
        mocks.arAggregate.mockResolvedValue({
            _count: 0,
            _sum: { remainingAmount: null },
        });
        mocks.apAggregate.mockResolvedValue({
            _count: 0,
            _sum: { totalAmount: null, paidAmount: null },
        });
        mocks.arList.mockResolvedValue([]);
        mocks.apList.mockResolvedValue([]);
        mocks.arDetail.mockResolvedValue(null);
        mocks.apDetail.mockResolvedValue(null);
        mocks.journals.mockResolvedValue(0);
        mocks.reconciliations.mockResolvedValue(0);
        mocks.fiscal.mockResolvedValue(null);
        mocks.payrollPeriod.mockResolvedValue(null);
        mocks.payslip.mockResolvedValue([]);
    });

    it('returns total and page from isolated repeatable-read section snapshots', async () => {
        const result = await getFinanceMobileOverview();
        expect(result).toMatchObject({
            success: true,
            data: {
                counts: { total: 0, returned: 0, ar: 0, ap: 0, hasNext: false },
                invoices: [],
                sections: {
                    ar: 'AVAILABLE',
                    ap: 'AVAILABLE',
                    journals: 'AVAILABLE',
                    recon: 'AVAILABLE',
                    fiscal: 'NOT_CONFIGURED',
                    payroll: 'NOT_CONFIGURED',
                    arNominal: 'AVAILABLE',
                    apNominal: 'AVAILABLE',
                },
                readiness: {
                    fiscalPeriod: { status: 'NOT_CONFIGURED', data: null },
                    payroll: { status: 'NOT_CONFIGURED', data: null },
                },
            },
        });
        expect(mocks.transaction).toHaveBeenCalledTimes(6);
        for (const call of mocks.transaction.mock.calls) {
            expect(call[1]).toEqual({ isolationLevel: 'RepeatableRead' });
        }
    });

    it('uses canonical full aggregates and net amounts independent of bounded rows', async () => {
        mocks.arAggregate.mockResolvedValue({
            _count: 35,
            _sum: { remainingAmount: d(3500) },
        });
        mocks.apAggregate.mockResolvedValue({
            _count: 22,
            _sum: { totalAmount: d(22000), paidAmount: d(4000) },
        });
        mocks.apList.mockResolvedValue([
            {
                id: 'ap',
                invoiceNumber: 'AP',
                invoiceDate: new Date('2025-12-01'),
                dueDate: new Date('2026-01-01'),
                totalAmount: d(1000),
                paidAmount: d(400),
                status: 'PARTIAL',
                purchaseOrder: null,
            },
        ]);
        const result = await getFinanceMobileOverview({ due: 'OVERDUE' });
        expect(result).toMatchObject({
            success: true,
            data: {
                counts: { total: 57, returned: 1 },
                highlights: { arAmount: 3500, apAmount: 18000 },
                invoices: [{ remainingAmount: 600, type: 'AP' }],
            },
        });
        expect(mocks.apAggregate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                    dueDate: { lt: expect.any(Date) },
                    totalAmount: { gt: 'paidAmount-field' },
                },
            }),
        );
        expect(mocks.arAggregate.mock.calls[0][0]).not.toHaveProperty('take');
    });

    it('keeps AR and AP pages distinct and deterministically merged', async () => {
        mocks.arList.mockResolvedValue([
            {
                id: 'ar',
                invoiceNumber: 'AR',
                invoiceDate: new Date('2026-01-01'),
                dueDate: new Date('2026-02-01'),
                remainingAmount: d(80),
                status: 'PARTIAL',
                salesOrder: null,
                collectionActivities: [],
            },
        ]);
        mocks.apList.mockResolvedValue([
            {
                id: 'ap',
                invoiceNumber: 'AP',
                invoiceDate: new Date('2025-12-01'),
                dueDate: new Date('2026-01-01'),
                totalAmount: d(1000),
                paidAmount: d(400),
                status: 'PARTIAL',
                purchaseOrder: { supplier: { name: 'Synthetic supplier' } },
            },
        ]);
        const result = await getFinanceMobileOverview();
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.invoices).toHaveLength(2);
        expect(result.data.invoices[0]).toMatchObject({
            type: 'AP',
            remainingAmount: 600,
        });
        expect(result.data.invoices[1]).toMatchObject({
            type: 'AR',
            remainingAmount: 80,
        });
    });

    it('omits every amount query and DTO field without canonical permission', async () => {
        mocks.features.mockResolvedValue({ success: true, data: [] });
        mocks.arAggregate.mockResolvedValue({ _count: 1 });
        mocks.apAggregate.mockResolvedValue({ _count: 1 });
        mocks.arList.mockResolvedValue([
            {
                id: 'ar',
                invoiceNumber: 'AR',
                invoiceDate: new Date(),
                dueDate: null,
                status: 'UNPAID',
                salesOrder: null,
                collectionActivities: [],
            },
        ]);
        mocks.apList.mockResolvedValue([
            {
                id: 'ap',
                invoiceNumber: 'AP',
                invoiceDate: new Date(),
                dueDate: null,
                status: 'UNPAID',
                purchaseOrder: null,
            },
        ]);
        const result = await getFinanceMobileOverview();
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.highlights).not.toHaveProperty('arAmount');
        expect(result.data.highlights).not.toHaveProperty('apAmount');
        expect(result.data.invoices[0]).not.toHaveProperty('remainingAmount');
        expect(result.data.invoices[1]).not.toHaveProperty('remainingAmount');
        expect(result.data.sections.arNominal).toBe('HIDDEN');
        expect(result.data.sections.apNominal).toBe('HIDDEN');
        expect(result.data.sections.ar).toBe('AVAILABLE');
        expect(mocks.arAggregate.mock.calls[0][0]).not.toHaveProperty('_sum');
        expect(mocks.apAggregate.mock.calls[0][0]).not.toHaveProperty('_sum');
        expect(mocks.arList.mock.calls[0][0].select).not.toHaveProperty(
            'remainingAmount',
        );
        expect(mocks.apList.mock.calls[0][0].select).not.toHaveProperty(
            'totalAmount',
        );
        expect(mocks.apList.mock.calls[0][0].select).not.toHaveProperty(
            'paidAmount',
        );
    });

    it('applies the operational AR order exclusion in every due and bucket mode', async () => {
        const modes = [
            {},
            { due: 'OVERDUE' as const },
            { due: 'DUE_SOON' as const },
            { bucket: 'NOT_DUE' as const },
            { bucket: '1_30' as const },
            { bucket: '90_PLUS' as const },
        ];
        for (const mode of modes) {
            mocks.arAggregate.mockClear();
            const result = await getFinanceMobileOverview(mode);
            expect(result.success).toBe(true);
            const and = mocks.arAggregate.mock.calls[0][0].where.AND as unknown[];
            expect(and).toContainEqual({
                salesOrder: buildOperationalSalesReceivableOrderWhere(),
            });
        }
    });

    it('keeps the AP Decimal field reference in non-overdue modes and the owner helper when overdue', async () => {
        for (const mode of [
            {},
            { due: 'DUE_SOON' as const },
            { bucket: 'NOT_DUE' as const },
            { bucket: '1_30' as const },
        ]) {
            mocks.apAggregate.mockClear();
            await getFinanceMobileOverview(mode);
            const where = mocks.apAggregate.mock.calls[0][0].where as {
                AND: Array<{ totalAmount: unknown }>;
            };
            expect(where.AND[0].totalAmount).toEqual({
                gt: 'paidAmount-field',
            });
        }

        mocks.apAggregate.mockClear();
        await getFinanceMobileOverview({ due: 'OVERDUE' });
        expect(mocks.apAggregate.mock.calls[0][0].where).toEqual({
            status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
            dueDate: { lt: expect.any(Date) },
            totalAmount: { gt: 'paidAmount-field' },
        });
    });

    it('reads the latest OPEN payroll period as a grouped aggregate', async () => {
        mocks.payrollPeriod.mockResolvedValue({
            id: 'latest',
            year: 2026,
            month: 9,
        });
        mocks.payslip.mockResolvedValue([
            { status: 'DRAFT', _count: { _all: 2 } },
            { status: 'FINALIZED', _count: { _all: 3 } },
            { status: 'PAID', _count: { _all: 4 } },
        ]);
        const result = await getFinanceMobileOverview();
        expect(result).toMatchObject({
            success: true,
            data: {
                sections: { payroll: 'AVAILABLE' },
                readiness: {
                    payroll: {
                        status: 'AVAILABLE',
                        data: {
                            year: 2026,
                            month: 9,
                            status: 'OPEN',
                            total: 9,
                            counts: { draft: 2, finalized: 3, paid: 4 },
                        },
                    },
                },
            },
        });
        expect(mocks.payrollPeriod).toHaveBeenCalledWith({
            where: { status: 'OPEN' },
            select: { id: true, year: true, month: true },
            orderBy: [{ year: 'desc' }, { month: 'desc' }, { id: 'asc' }],
        });
        expect(mocks.payslip).toHaveBeenCalledWith({
            by: ['status'],
            where: { payrollPeriodId: 'latest' },
            _count: { _all: true },
        });
        if (result.success) {
            expect(JSON.stringify(result.data.readiness.payroll)).not.toMatch(
                /name|employee|netPay|bankAccount|loanNumber/,
            );
        }
    });

    it('keeps a valid zero OPEN period available and a failed payroll read unavailable', async () => {
        mocks.payrollPeriod.mockResolvedValue({
            id: 'empty',
            year: 2026,
            month: 10,
        });
        const zero = await getFinanceMobileOverview();
        expect(zero).toMatchObject({
            success: true,
            data: {
                sections: { payroll: 'AVAILABLE' },
                readiness: {
                    payroll: {
                        status: 'AVAILABLE',
                        data: { total: 0, counts: { draft: 0, finalized: 0, paid: 0 } },
                    },
                },
            },
        });

        mocks.payrollPeriod.mockRejectedValue(new Error('payroll unavailable'));
        const failed = await getFinanceMobileOverview();
        expect(failed).toMatchObject({
            success: true,
            data: {
                sections: { payroll: 'UNAVAILABLE' },
                readiness: { payroll: { status: 'UNAVAILABLE', data: null } },
            },
        });
    });

    it('isolates a failed AR reader while unrelated sections survive', async () => {
        mocks.arAggregate.mockRejectedValue(new Error('Synthetic read failure'));
        const result = await getFinanceMobileOverview();
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.sections.ar).toBe('UNAVAILABLE');
        expect(result.data.sections.arNominal).toBe('UNAVAILABLE');
        expect(result.data.sections.ap).toBe('AVAILABLE');
        expect(result.data.sections.journals).toBe('AVAILABLE');
        expect(result.data.highlights.arCount).toBeNull();
        expect(result.data.highlights.apCount).toBe(0);
        expect(result.data.highlights.draftJournalCount).toBe(0);
        expect(result.data.highlights).not.toHaveProperty('arAmount');
        expect(result.data.counts.total).toBeNull();
        expect(result.data.counts.returned).toBe(0);
    });

    it('omits the AP group instead of hiding it when the type filter excludes it', async () => {
        const result = await getFinanceMobileOverview({ type: 'AR' });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.sections).not.toHaveProperty('ap');
        expect(result.data.sections).not.toHaveProperty('apNominal');
        expect(mocks.apAggregate).not.toHaveBeenCalled();
        expect(mocks.apList).not.toHaveBeenCalled();
    });

    it('fails closed before querying without tenant context or access', async () => {
        mocks.tenantDb.mockReturnValue(undefined);
        expect(await getFinanceMobileOverview()).toMatchObject({
            success: false,
        });
        expect(mocks.transaction).not.toHaveBeenCalled();
        mocks.guard.mockRejectedValue(new Error('Denied'));
        expect(await getFinanceMobileOverview()).toMatchObject({
            success: false,
        });
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
});

describe('getFinanceMobileInvoiceDetail', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({ user: { role: 'FINANCE' } });
        mocks.features.mockResolvedValue({
            success: true,
            data: ['feature:view-prices'],
        });
        mocks.tenantDb.mockReturnValue(tenantDb);
        mocks.transaction.mockImplementation((fn: (client: unknown) => unknown) =>
            fn(tenantDb),
        );
    });

    it('validates the AR detail with the operational exclusion and hides amounts without permission', async () => {
        mocks.features.mockResolvedValue({ success: true, data: [] });
        mocks.arDetail.mockResolvedValue({
            id: 'ar',
            invoiceNumber: 'AR',
            invoiceDate: new Date('2026-01-01'),
            dueDate: null,
            status: 'UNPAID',
            salesOrder: null,
            collectionActivities: [],
        });
        const result = await getFinanceMobileInvoiceDetail('AR', 'ar');
        expect(result.success).toBe(true);
        const where = mocks.arDetail.mock.calls[0][0].where;
        expect(where.salesOrder).toEqual(
            buildOperationalSalesReceivableOrderWhere(),
        );
        expect(where.status).toEqual({ in: ['UNPAID', 'PARTIAL', 'OVERDUE'] });
        expect(where.remainingAmount).toEqual({ gt: 0 });
        expect(mocks.arDetail.mock.calls[0][0].select).not.toHaveProperty(
            'remainingAmount',
        );
        if (result.success) {
            expect(result.data).not.toHaveProperty('remainingAmount');
        }
    });

    it('mirrors AR detail amounts with permission', async () => {
        mocks.arDetail.mockResolvedValue({
            id: 'ar',
            invoiceNumber: 'AR',
            invoiceDate: new Date('2026-01-01'),
            dueDate: null,
            status: 'PARTIAL',
            remainingAmount: d(80),
            salesOrder: { customer: { name: 'Pelanggan' } },
            collectionActivities: [],
        });
        const result = await getFinanceMobileInvoiceDetail('AR', 'ar');
        expect(mocks.arDetail.mock.calls[0][0].select).toHaveProperty(
            'remainingAmount',
        );
        expect(result).toMatchObject({
            success: true,
            data: { remainingAmount: 80 },
        });
    });

    it('keeps the AP Decimal field reference and hides amounts without permission', async () => {
        mocks.features.mockResolvedValue({ success: true, data: [] });
        mocks.apDetail.mockResolvedValue({
            id: 'ap',
            invoiceNumber: 'AP',
            invoiceDate: new Date('2026-01-01'),
            dueDate: null,
            status: 'UNPAID',
            purchaseOrder: null,
        });
        const result = await getFinanceMobileInvoiceDetail('AP', 'ap');
        expect(result.success).toBe(true);
        expect(mocks.apDetail.mock.calls[0][0].where).toMatchObject({
            id: 'ap',
            status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
            totalAmount: { gt: 'paidAmount-field' },
        });
        const select = mocks.apDetail.mock.calls[0][0].select;
        expect(select).not.toHaveProperty('totalAmount');
        expect(select).not.toHaveProperty('paidAmount');
        if (result.success) {
            expect(result.data).not.toHaveProperty('remainingAmount');
        }
    });

    it('mirrors AP detail amounts with permission and rejects an invalid type', async () => {
        mocks.apDetail.mockResolvedValue({
            id: 'ap',
            invoiceNumber: 'AP',
            invoiceDate: new Date('2026-01-01'),
            dueDate: null,
            status: 'PARTIAL',
            totalAmount: d(1000),
            paidAmount: d(400),
            purchaseOrder: { supplier: { name: 'Supplier' } },
        });
        const result = await getFinanceMobileInvoiceDetail('AP', 'ap');
        expect(result).toMatchObject({
            success: true,
            data: { remainingAmount: 600 },
        });

        const invalid = await getFinanceMobileInvoiceDetail('BOTH', 'ap');
        expect(invalid).toMatchObject({
            success: false,
            code: 'VALIDATION_ERROR',
        });
        expect(mocks.apDetail).toHaveBeenCalledTimes(1);
    });

    it('fails closed as NOT_FOUND for an out-of-scope detail row', async () => {
        mocks.arDetail.mockResolvedValue(null);
        expect(await getFinanceMobileInvoiceDetail('AR', 'missing')).toMatchObject(
            { success: false, code: 'NOT_FOUND' },
        );
    });
});
