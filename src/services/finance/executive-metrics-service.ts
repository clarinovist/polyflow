import { prisma } from '@/lib/core/prisma';
import {
    getBalanceSheet,
    getMonthlyIncomeSummary,
} from '@/services/accounting/reports-service';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';
import { positiveSalesReceivableWhere } from '@/services/finance/sales-receivable-query';
import { buildOverduePurchaseInvoiceWhere } from '@/services/finance/purchase-payable-query';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

export type ExecutiveFinanceMetrics = {
    mtdRevenue: number;
    revenueTrend?: number;
    mtdNetIncome: number;
    netIncomeTrend?: number;
    mtdSpending: number;
    spendingTrend?: number;
    cashBalance: number | null;
    cashAsOfDate: string | null;
    pendingInvoices: number;
    overdueReceivables: number;
    overdueReceivablesCount: number;
    overduePayables: number;
    overduePayablesCount: number;
    invoicesDueThisWeek: number;
    revenueTrendChart: Array<{ month: string; revenue: number }>;
    netIncomeTrendChart: Array<{ month: string; netIncome: number }>;
};

function percentageChange(current: number, previous: number) {
    return previous > 0 ? ((current - previous) / previous) * 100 : undefined;
}

function previousMonth(year: number, month: number) {
    return month === 1
        ? { year: year - 1, month: 12 }
        : { year, month: month - 1 };
}

export async function getExecutiveFinanceMetrics(
    now: Date = new Date(),
    options: { includeBalanceSheet?: boolean } = {},
): Promise<ExecutiveFinanceMetrics> {
    const [year, month] = toBusinessDateString(now).split('-').map(Number);
    const previous = previousMonth(year, month);
    const todayStart = getWibDayBounds(toBusinessDateString(now)).startOfDay;
    const positiveReceivable = positiveSalesReceivableWhere();
    const operationalReceivable = buildOperationalSalesReceivableOrderWhere();
    const overduePurchase = buildOverduePurchaseInvoiceWhere(prisma, now);
    const monthRanges = Array.from({ length: month }, (_, index) => ({
        year,
        month: index + 1,
        label: `${year}-${String(index + 1).padStart(2, '0')}`,
    }));
    const monthlyIncomePromise = Promise.all(
        monthRanges.map(async (range) => ({
            month: range.label,
            report: await getMonthlyIncomeSummary(range.year, range.month),
        })),
    );
    const previousIncomePromise =
        previous.year === year
            ? monthlyIncomePromise.then(
                  (reports) => reports[previous.month - 1].report,
              )
            : getMonthlyIncomeSummary(previous.year, previous.month);

    const [
        monthlyIncome,
        previousIncome,
        pendingInvoices,
        overdueReceivables,
        overduePayables,
        invoicesDueThisWeek,
        balanceSheet,
    ] = await Promise.all([
        monthlyIncomePromise,
        previousIncomePromise,
        prisma.invoice.count({
            where: {
                AND: [positiveReceivable],
                salesOrder: operationalReceivable,
            },
        }),
        prisma.invoice.aggregate({
            where: {
                AND: [positiveReceivable],
                dueDate: { lt: todayStart },
                salesOrder: operationalReceivable,
            },
            _sum: { remainingAmount: true },
            _count: { _all: true },
        }),
        prisma.purchaseInvoice.aggregate({
            where: overduePurchase,
            _sum: { totalAmount: true, paidAmount: true },
            _count: { _all: true },
        }),
        prisma.invoice.count({
            where: {
                AND: [positiveReceivable],
                dueDate: {
                    gte: now,
                    lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
                },
                salesOrder: operationalReceivable,
            },
        }),
        options.includeBalanceSheet === false
            ? Promise.resolve(null)
            : getBalanceSheet(now),
    ]);

    const currentIncome = monthlyIncome[monthlyIncome.length - 1].report;
    const mtdRevenue = currentIncome.totalRevenue;
    const previousRevenue = previousIncome.totalRevenue;
    const mtdNetIncome = currentIncome.netIncome;
    const previousNetIncome = previousIncome.netIncome;
    const mtdSpending = currentIncome.totalCOGS + currentIncome.totalOpEx;
    const previousSpending =
        previousIncome.totalCOGS + previousIncome.totalOpEx;

    return {
        mtdRevenue,
        revenueTrend: percentageChange(mtdRevenue, previousRevenue),
        mtdNetIncome,
        netIncomeTrend: percentageChange(mtdNetIncome, previousNetIncome),
        mtdSpending,
        spendingTrend: percentageChange(mtdSpending, previousSpending),
        cashBalance: balanceSheet?.cashBalance ?? null,
        cashAsOfDate: balanceSheet ? toBusinessDateString(now) : null,
        pendingInvoices,
        overdueReceivables: Number(
            overdueReceivables._sum.remainingAmount ?? 0,
        ),
        overdueReceivablesCount: overdueReceivables._count._all,
        overduePayables:
            Number(overduePayables._sum.totalAmount ?? 0) -
            Number(overduePayables._sum.paidAmount ?? 0),
        overduePayablesCount: overduePayables._count._all,
        invoicesDueThisWeek,
        revenueTrendChart: monthlyIncome.map(({ month: label, report }) => ({
            month: label,
            revenue: report.totalRevenue,
        })),
        netIncomeTrendChart: monthlyIncome.map(({ month: label, report }) => ({
            month: label,
            netIncome: report.netIncome,
        })),
    };
}
