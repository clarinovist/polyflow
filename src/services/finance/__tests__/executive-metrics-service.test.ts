import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceStatus, PurchaseInvoiceStatus } from '@prisma/client';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';

const mocks = vi.hoisted(() => ({
    income: vi.fn(),
    invoiceCount: vi.fn(),
    invoiceAggregate: vi.fn(),
    purchaseAggregate: vi.fn(),
    balanceSheet: vi.fn(),
    paidAmountField: {},
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        invoice: { count: mocks.invoiceCount, aggregate: mocks.invoiceAggregate },
        purchaseInvoice: {
            aggregate: mocks.purchaseAggregate,
            fields: { paidAmount: mocks.paidAmountField },
        },
    },
}));
vi.mock('@/services/accounting/reports-service', () => ({
    getBalanceSheet: mocks.balanceSheet,
    getMonthlyIncomeSummary: mocks.income,
}));

import { getExecutiveFinanceMetrics } from '../executive-metrics-service';

function report(
    revenue: number,
    cogs: number,
    opex: number,
    netIncome = revenue - cogs - opex,
) {
    return { totalRevenue: revenue, totalCOGS: cogs, totalOpEx: opex, netIncome };
}

describe('getExecutiveFinanceMetrics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.income
            .mockResolvedValueOnce(report(100, 20, 10, 60))
            .mockResolvedValueOnce(report(200, 40, 20, 120))
            .mockResolvedValueOnce(report(300, 60, 30, 180))
            .mockResolvedValueOnce(report(400, 80, 40, 240))
            .mockResolvedValueOnce(report(900, 250, 100, 525));
        mocks.invoiceCount
            .mockResolvedValueOnce(4)
            .mockResolvedValueOnce(2);
        mocks.invoiceAggregate.mockResolvedValue({
            _sum: { remainingAmount: 650 },
            _count: { _all: 3 },
        });
        mocks.purchaseAggregate.mockResolvedValue({
            _sum: { totalAmount: 600, paidAmount: 100 },
            _count: { _all: 2 },
        });
        mocks.balanceSheet.mockResolvedValue({ cashBalance: 1_250 });
    });

    it('composes canonical income statement, AR, and AP helpers', async () => {
        const now = new Date('2026-05-31T12:00:00.000Z');
        const result = await getExecutiveFinanceMetrics(now);

        expect(result).toMatchObject({
            mtdRevenue: 900,
            revenueTrend: 125,
            mtdNetIncome: 525,
            netIncomeTrend: 118.75,
            mtdSpending: 350,
            spendingTrend: expect.closeTo(191.666, 2),
            cashBalance: 1_250,
            cashAsOfDate: '2026-05-31',
            pendingInvoices: 4,
            overdueReceivables: 650,
            overdueReceivablesCount: 3,
            overduePayables: 500,
            overduePayablesCount: 2,
            invoicesDueThisWeek: 2,
        });
        expect(result.revenueTrendChart).toEqual([
            { month: '2026-01', revenue: 100 },
            { month: '2026-02', revenue: 200 },
            { month: '2026-03', revenue: 300 },
            { month: '2026-04', revenue: 400 },
            { month: '2026-05', revenue: 900 },
        ]);
        expect(mocks.income).toHaveBeenCalledTimes(5);
        expect(mocks.invoiceAggregate).toHaveBeenCalledOnce();
        expect(mocks.purchaseAggregate).toHaveBeenCalledOnce();
        expect(result.netIncomeTrendChart).toEqual([
            { month: '2026-01', netIncome: 60 },
            { month: '2026-02', netIncome: 120 },
            { month: '2026-03', netIncome: 180 },
            { month: '2026-04', netIncome: 240 },
            { month: '2026-05', netIncome: 525 },
        ]);
        expect(mocks.balanceSheet).toHaveBeenCalledWith(now);
        expect(mocks.invoiceAggregate).toHaveBeenCalledWith({
            where: {
                AND: [
                    {
                        status: {
                            in: [
                                InvoiceStatus.UNPAID,
                                InvoiceStatus.PARTIAL,
                                InvoiceStatus.OVERDUE,
                            ],
                        },
                        remainingAmount: { gt: 0 },
                    },
                ],
                dueDate: { lt: expect.any(Date) },
                salesOrder: buildOperationalSalesReceivableOrderWhere(),
            },
            _sum: { remainingAmount: true },
            _count: { _all: true },
        });
        expect(mocks.purchaseAggregate).toHaveBeenCalledWith({
            where: {
                status: {
                    in: [
                        PurchaseInvoiceStatus.UNPAID,
                        PurchaseInvoiceStatus.PARTIAL,
                        PurchaseInvoiceStatus.OVERDUE,
                    ],
                },
                dueDate: { lt: expect.any(Date) },
                totalAmount: { gt: mocks.paidAmountField },
            },
            _sum: { totalAmount: true, paidAmount: true },
            _count: { _all: true },
        });
    });

    it('skips the balance-sheet query when finance position is not authorized', async () => {
        const now = new Date('2026-05-31T12:00:00.000Z');
        const result = await getExecutiveFinanceMetrics(now, {
            includeBalanceSheet: false,
        });

        expect(mocks.balanceSheet).not.toHaveBeenCalled();
        expect(result.cashBalance).toBeNull();
        expect(result.cashAsOfDate).toBeNull();
        expect(result.mtdRevenue).toBe(900);
    });
});
