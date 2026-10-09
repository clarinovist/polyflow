import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    prisma: {
        user: { findUnique: vi.fn() },
        rolePermission: { findMany: vi.fn() },
        account: { count: vi.fn() },
        invoice: { aggregate: vi.fn(), findMany: vi.fn() },
        purchaseInvoice: {
            aggregate: vi.fn(),
            findMany: vi.fn(),
            fields: { paidAmount: Symbol('paidAmount') },
        },
        journalEntry: { count: vi.fn(), findMany: vi.fn() },
        bankReconciliation: { count: vi.fn() },
        fiscalPeriod: { count: vi.fn(), findFirst: vi.fn() },
    },
    income: vi.fn(),
    balance: vi.fn(),
    monthly: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/services/accounting/reports-service', () => ({
    getIncomeStatement: mocks.income,
    getBalanceSheet: mocks.balance,
    getMonthlyIncomeSummary: mocks.monthly,
}));

import {
    readFinanceAttention,
    readFinanceCashHealth,
    readFinanceDrivers,
    readFinanceProfitHealth,
    resolveFinanceDashboardPeriod,
    resolveFreshFinanceDashboardAccess,
} from '../finance-dashboard-service';

const NOW = new Date('2026-07-22T10:00:00.000Z');

function setupAttention() {
    mocks.prisma.invoice.aggregate
        .mockResolvedValueOnce({
            _sum: { remainingAmount: 450 },
            _count: { _all: 7 },
        })
        .mockResolvedValueOnce({
            _sum: { remainingAmount: 900 },
            _count: { _all: 12 },
        });
    mocks.prisma.invoice.findMany.mockResolvedValue([
        {
            id: 'ar-a',
            invoiceNumber: 'INV-A',
            remainingAmount: 100,
            dueDate: new Date('2026-07-01T00:00:00.000Z'),
            salesOrder: { customer: { name: 'Customer A' } },
        },
    ]);
    mocks.prisma.purchaseInvoice.aggregate
        .mockResolvedValueOnce({
            _sum: { totalAmount: 800, paidAmount: 200 },
            _count: { _all: 8 },
        })
        .mockResolvedValueOnce({
            _sum: { totalAmount: 1_500, paidAmount: 300 },
            _count: { _all: 15 },
        });
    mocks.prisma.purchaseInvoice.findMany.mockResolvedValue([
        {
            id: 'ap-a',
            invoiceNumber: 'PI-A',
            totalAmount: 500,
            paidAmount: 100,
            dueDate: new Date('2026-07-02T00:00:00.000Z'),
            purchaseOrder: { supplier: { name: 'Supplier A' } },
        },
    ]);
    mocks.prisma.journalEntry.count.mockResolvedValue(6);
    mocks.prisma.journalEntry.findMany.mockResolvedValue([
        {
            id: 'journal-a',
            entryNumber: 'JE-A',
            entryDate: new Date('2026-07-20T00:00:00.000Z'),
            description: 'Draft A',
        },
    ]);
    mocks.prisma.bankReconciliation.count.mockResolvedValue(2);
}

describe('finance-dashboard-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.prisma.user.findUnique.mockResolvedValue({
            isActive: true,
            isSuperAdmin: false,
            role: 'FINANCE',
            roles: [],
        });
        mocks.prisma.rolePermission.findMany.mockResolvedValue([
            { resource: '/finance' },
        ]);
        mocks.prisma.account.count.mockResolvedValue(1);
        mocks.income.mockResolvedValue({
            totalRevenue: 1_000,
            grossProfit: 600,
            netIncome: 250,
        });
        mocks.balance.mockResolvedValue({ cashBalance: 0 });
        mocks.monthly.mockImplementation(async (_year, month) => ({
            totalRevenue: month * 100,
            totalCOGS: month * 20,
            totalOpEx: month * 10,
            netIncome: month * 70,
        }));
        setupAttention();
    });

    it('normalizes the selected period to inclusive WIB bounds', () => {
        expect(
            resolveFinanceDashboardPeriod({
                startDate: new Date('2026-07-01T00:00:00+07:00'),
                endDate: new Date('2026-07-31T00:00:00+07:00'),
            }),
        ).toMatchObject({
            start: new Date('2026-06-30T17:00:00.000Z'),
            end: new Date('2026-07-31T16:59:59.999Z'),
            asOfLabel: '31 Jul 2026',
        });
    });

    it('requires an active fresh Finance role and exact root grant', async () => {
        await expect(
            resolveFreshFinanceDashboardAccess('finance-user'),
        ).resolves.toEqual({ resources: ['/finance'] });

        mocks.prisma.rolePermission.findMany.mockResolvedValueOnce([
            { resource: '/finance/journals' },
        ]);
        await expect(
            resolveFreshFinanceDashboardAccess('finance-user'),
        ).rejects.toThrow(/root \/finance/);

        mocks.prisma.user.findUnique.mockResolvedValueOnce({
            isActive: true,
            isSuperAdmin: false,
            role: 'SALES',
            roles: [],
        });
        await expect(
            resolveFreshFinanceDashboardAccess('stale-session'),
        ).rejects.toThrow(/Admin atau Finance/);

        mocks.prisma.user.findUnique.mockResolvedValueOnce({
            isActive: true,
            isSuperAdmin: false,
            role: 'ADMIN',
            roles: [],
        });
        await expect(
            resolveFreshFinanceDashboardAccess('active-admin'),
        ).resolves.toEqual({ resources: 'ALL' });
        expect(mocks.prisma.rolePermission.findMany).toHaveBeenCalledTimes(2);
    });

    it('reuses canonical report values and preserves valid zero cash', async () => {
        const period = resolveFinanceDashboardPeriod(
            {
                startDate: new Date('2026-07-01T00:00:00+07:00'),
                endDate: new Date('2026-07-31T00:00:00+07:00'),
            },
            NOW,
        );

        await expect(readFinanceProfitHealth(period)).resolves.toEqual({
            revenue: 1_000,
            grossProfit: 600,
            netProfit: 250,
        });
        await expect(readFinanceCashHealth(period.end)).resolves.toEqual({
            configured: true,
            value: 0,
        });
        expect(mocks.income).toHaveBeenCalledWith(period.start, period.end);
        expect(mocks.balance).toHaveBeenCalledWith(period.end);
    });

    it('returns NOT_CONFIGURED input when no cash mapping exists without reading the balance sheet', async () => {
        mocks.prisma.account.count.mockResolvedValue(0);

        await expect(readFinanceCashHealth(NOW)).resolves.toEqual({
            configured: false,
            value: null,
        });
        expect(mocks.balance).not.toHaveBeenCalled();
    });

    it('uses complete aggregates plus deterministic bounded top-five samples', async () => {
        const result = await readFinanceAttention(NOW);

        expect(result.arOverdue).toMatchObject({
            total: 7,
            amount: 450,
            returned: 1,
        });
        expect(result.arUnpaid).toEqual({ total: 12, amount: 900 });
        expect(result.apOverdue).toMatchObject({
            total: 8,
            amount: 600,
            returned: 1,
        });
        expect(result.apUnpaid).toEqual({ total: 15, amount: 1_200 });
        expect(mocks.prisma.invoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 5,
                orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
            }),
        );
        expect(mocks.prisma.purchaseInvoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 5,
                orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
            }),
        );
        expect(mocks.prisma.journalEntry.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 5,
                orderBy: [{ entryDate: 'desc' }, { id: 'asc' }],
            }),
        );
    });

    it('isolates a failed queue reader while preserving successful groups', async () => {
        mocks.prisma.purchaseInvoice.aggregate.mockReset();
        mocks.prisma.purchaseInvoice.aggregate.mockRejectedValue(
            new Error('AP unavailable'),
        );

        const result = await readFinanceAttention(NOW);

        expect(result.state).toBe('UNAVAILABLE');
        expect(result.apOverdue).toBeNull();
        expect(result.apUnpaid).toBeNull();
        expect(result.arOverdue?.total).toBe(7);
        expect(result.draftJournals?.total).toBe(6);
        expect(result.openBankRecs).toBe(2);
    });

    it('reads bounded canonical monthly points in chronological order', async () => {
        const result = await readFinanceDrivers(
            new Date('2026-04-30T16:59:59.999Z'),
        );

        expect(result.revenue).toEqual([
            { month: '2026-01', value: 100 },
            { month: '2026-02', value: 200 },
            { month: '2026-03', value: 300 },
            { month: '2026-04', value: 400 },
        ]);
        expect(result.netIncome.at(-1)).toEqual({
            month: '2026-04',
            value: 280,
        });
        expect(mocks.monthly).toHaveBeenCalledTimes(4);
    });
});
