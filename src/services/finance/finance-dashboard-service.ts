import type { Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { AuthorizationError } from '@/lib/errors/errors';
import {
    getBalanceSheet,
    getIncomeStatement,
    getMonthlyIncomeSummary,
} from '@/services/accounting/reports-service';
import { positiveSalesReceivableWhere } from '@/services/finance/sales-receivable-query';
import {
    buildOverduePurchaseInvoiceWhere,
    PURCHASE_INVOICE_OUTSTANDING_STATUSES,
} from '@/services/finance/purchase-payable-query';
import {
    formatWibDate,
    getWibDayBounds,
    getWibMonthBounds,
    toBusinessDateString,
    wibRangeBounds,
} from '@/lib/utils/timezone';

export const FINANCE_DASHBOARD_SAMPLE_LIMIT = 5;

export type FinanceDashboardPeriod = {
    start: Date;
    end: Date;
    label: string;
    asOfLabel: string;
};

export type FinanceDashboardAccess = {
    resources: string[] | 'ALL';
};

export type FinanceDashboardSample<T> = {
    total: number;
    amount?: number;
    returned: number;
    items: T[];
};

export type FinanceAttentionData = {
    state: 'AVAILABLE' | 'UNAVAILABLE';
    arOverdue: FinanceDashboardSample<{
        id: string;
        invoiceNumber: string;
        customerName: string;
        remaining: number;
        dueDate: string | null;
    }> | null;
    arUnpaid: { total: number; amount: number } | null;
    apOverdue: FinanceDashboardSample<{
        id: string;
        invoiceNumber: string;
        supplierName: string;
        remaining: number;
        dueDate: string | null;
    }> | null;
    apUnpaid: { total: number; amount: number } | null;
    draftJournals: FinanceDashboardSample<{
        id: string;
        entryNumber: string;
        entryDate: string;
        description: string;
    }> | null;
    openBankRecs: number | null;
};

export type FinancePeriodSignals = {
    openCount: number;
    currentPeriod: {
        id: string;
        name: string;
        endDate: string;
        status: string;
    } | null;
    daysToMonthEnd: number | null;
    reconThisMonth: number;
};

function validDate(value: Date | undefined): value is Date {
    return value instanceof Date && Number.isFinite(value.getTime());
}

function formatPeriodLabel(start: Date, end: Date): string {
    const formatter = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function resolveFinanceDashboardPeriod(
    dateRange?: { startDate?: Date; endDate?: Date },
    now: Date = new Date(),
): FinanceDashboardPeriod {
    if (
        validDate(dateRange?.startDate) &&
        validDate(dateRange?.endDate) &&
        dateRange.startDate.getTime() <= dateRange.endDate.getTime()
    ) {
        const bounds = wibRangeBounds(dateRange.startDate, dateRange.endDate);
        const start = bounds.gte!;
        const end = bounds.lte!;
        return {
            start,
            end,
            label: formatPeriodLabel(start, end),
            asOfLabel: formatWibDate(end),
        };
    }

    const [year, month] = toBusinessDateString(now).split('-').map(Number);
    const monthStart = getWibMonthBounds(year, month).start;
    const end = wibRangeBounds(undefined, now).lte!;
    return {
        start: monthStart,
        end,
        label: formatPeriodLabel(monthStart, end),
        asOfLabel: formatWibDate(end),
    };
}

export async function resolveFreshFinanceDashboardAccess(
    userId: string,
): Promise<FinanceDashboardAccess> {
    const current = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            isActive: true,
            isSuperAdmin: true,
            role: true,
            roles: { select: { role: true } },
        },
    });
    if (!current?.isActive || current.isSuperAdmin) {
        throw new AuthorizationError(
            'Akun Finance tidak aktif atau bukan pengguna tenant.',
        );
    }

    const roles = [
        ...new Set([current.role, ...current.roles.map((entry) => entry.role)]),
    ] as Role[];
    if (!roles.some((role) => role === 'ADMIN' || role === 'FINANCE')) {
        throw new AuthorizationError(
            'Dashboard Finance hanya untuk Admin atau Finance aktif.',
        );
    }

    // Tenant ADMIN is the canonical ALL-resource role in the access-control UI.
    if (roles.includes('ADMIN')) return { resources: 'ALL' };

    const grants = await prisma.rolePermission.findMany({
        where: { role: { in: roles }, canAccess: true },
        select: { resource: true },
    });
    const resources = [...new Set(grants.map((grant) => grant.resource))];
    if (resources.includes('ALL')) return { resources: 'ALL' };
    if (!resources.includes('/finance')) {
        throw new AuthorizationError(
            'Akses root /finance diperlukan untuk membuka dashboard Finance.',
        );
    }
    return { resources };
}

export async function readFinanceProfitHealth(period: FinanceDashboardPeriod) {
    const report = await getIncomeStatement(period.start, period.end);
    return {
        revenue: report.totalRevenue,
        grossProfit: report.grossProfit,
        netProfit: report.netIncome,
    };
}

export async function readFinanceCashHealth(asOfDate: Date) {
    const configuredCashAccounts = await prisma.account.count({
        where: { type: 'ASSET', isCashAccount: true },
    });
    if (configuredCashAccounts === 0) {
        return { configured: false as const, value: null };
    }

    const balanceSheet = await getBalanceSheet(asOfDate);
    return { configured: true as const, value: balanceSheet.cashBalance };
}

function purchaseOutstandingWhere(): Prisma.PurchaseInvoiceWhereInput {
    return {
        status: { in: [...PURCHASE_INVOICE_OUTSTANDING_STATUSES] },
        totalAmount: {
            gt: prisma.purchaseInvoice.fields
                .paidAmount as Prisma.DecimalFieldRefInput<'PurchaseInvoice'>,
        },
    };
}

function numberValue(value: unknown): number {
    return Number(value ?? 0);
}

function purchaseAmount(aggregate: {
    _sum: { totalAmount: unknown; paidAmount: unknown };
}) {
    return (
        numberValue(aggregate._sum.totalAmount) -
        numberValue(aggregate._sum.paidAmount)
    );
}

export async function readFinanceAttention(
    now: Date = new Date(),
): Promise<FinanceAttentionData> {
    const positiveReceivable = positiveSalesReceivableWhere();
    const arOverdueWhere: Prisma.InvoiceWhereInput = {
        AND: [positiveReceivable],
        dueDate: {
            lt: getWibDayBounds(toBusinessDateString(now)).startOfDay,
        },
    };
    const apOverdueWhere = buildOverduePurchaseInvoiceWhere(prisma, now);
    const arUnpaidWhere: Prisma.InvoiceWhereInput = positiveReceivable;
    const apUnpaidWhere = purchaseOutstandingWhere();

    const [arResult, apResult, journalResult, reconciliationResult] =
        await Promise.allSettled([
            Promise.all([
                prisma.invoice.aggregate({
                    where: arOverdueWhere,
                    _sum: { remainingAmount: true },
                    _count: { _all: true },
                }),
                prisma.invoice.aggregate({
                    where: arUnpaidWhere,
                    _sum: { remainingAmount: true },
                    _count: { _all: true },
                }),
                prisma.invoice.findMany({
                    where: arOverdueWhere,
                    take: FINANCE_DASHBOARD_SAMPLE_LIMIT,
                    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
                    select: {
                        id: true,
                        invoiceNumber: true,
                        remainingAmount: true,
                        dueDate: true,
                        salesOrder: {
                            select: {
                                customer: { select: { name: true } },
                            },
                        },
                    },
                }),
            ]),
            Promise.all([
                prisma.purchaseInvoice.aggregate({
                    where: apOverdueWhere,
                    _sum: { totalAmount: true, paidAmount: true },
                    _count: { _all: true },
                }),
                prisma.purchaseInvoice.aggregate({
                    where: apUnpaidWhere,
                    _sum: { totalAmount: true, paidAmount: true },
                    _count: { _all: true },
                }),
                prisma.purchaseInvoice.findMany({
                    where: apOverdueWhere,
                    take: FINANCE_DASHBOARD_SAMPLE_LIMIT,
                    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
                    select: {
                        id: true,
                        invoiceNumber: true,
                        totalAmount: true,
                        paidAmount: true,
                        dueDate: true,
                        purchaseOrder: {
                            select: {
                                supplier: { select: { name: true } },
                            },
                        },
                    },
                }),
            ]),
            Promise.all([
                prisma.journalEntry.count({ where: { status: 'DRAFT' } }),
                prisma.journalEntry.findMany({
                    where: { status: 'DRAFT' },
                    take: FINANCE_DASHBOARD_SAMPLE_LIMIT,
                    orderBy: [{ entryDate: 'desc' }, { id: 'asc' }],
                    select: {
                        id: true,
                        entryNumber: true,
                        entryDate: true,
                        description: true,
                    },
                }),
            ]),
            prisma.bankReconciliation.count({
                where: { status: { in: ['DRAFT', 'IN_PROGRESS'] } },
            }),
        ] as const);

    const ar = arResult.status === 'fulfilled' ? arResult.value : null;
    const ap = apResult.status === 'fulfilled' ? apResult.value : null;
    const journals =
        journalResult.status === 'fulfilled' ? journalResult.value : null;
    const openBankRecs =
        reconciliationResult.status === 'fulfilled'
            ? reconciliationResult.value
            : null;

    return {
        state: [arResult, apResult, journalResult, reconciliationResult].every(
            (result) => result.status === 'fulfilled',
        )
            ? 'AVAILABLE'
            : 'UNAVAILABLE',
        arOverdue: ar
            ? {
                  total: ar[0]._count._all,
                  amount: numberValue(ar[0]._sum.remainingAmount),
                  returned: ar[2].length,
                  items: ar[2].map((invoice) => ({
                      id: invoice.id,
                      invoiceNumber: invoice.invoiceNumber,
                      customerName: invoice.salesOrder?.customer?.name ?? '-',
                      remaining: numberValue(invoice.remainingAmount),
                      dueDate: invoice.dueDate?.toISOString() ?? null,
                  })),
              }
            : null,
        arUnpaid: ar
            ? {
                  total: ar[1]._count._all,
                  amount: numberValue(ar[1]._sum.remainingAmount),
              }
            : null,
        apOverdue: ap
            ? {
                  total: ap[0]._count._all,
                  amount: purchaseAmount(ap[0]),
                  returned: ap[2].length,
                  items: ap[2].map((invoice) => ({
                      id: invoice.id,
                      invoiceNumber: invoice.invoiceNumber,
                      supplierName:
                          invoice.purchaseOrder?.supplier?.name ?? '-',
                      remaining:
                          numberValue(invoice.totalAmount) -
                          numberValue(invoice.paidAmount),
                      dueDate: invoice.dueDate?.toISOString() ?? null,
                  })),
              }
            : null,
        apUnpaid: ap
            ? {
                  total: ap[1]._count._all,
                  amount: purchaseAmount(ap[1]),
              }
            : null,
        draftJournals: journals
            ? {
                  total: journals[0],
                  returned: journals[1].length,
                  items: journals[1].map((journal) => ({
                      id: journal.id,
                      entryNumber: journal.entryNumber,
                      entryDate: journal.entryDate.toISOString(),
                      description: journal.description,
                  })),
              }
            : null,
        openBankRecs,
    };
}

export async function readFinancePeriodSignals(
    now: Date = new Date(),
): Promise<FinancePeriodSignals> {
    const [year, month] = toBusinessDateString(now).split('-').map(Number);
    const monthBounds = getWibMonthBounds(year, month);
    const [openCount, currentPeriod, reconThisMonth] = await Promise.all([
        prisma.fiscalPeriod.count({ where: { status: 'OPEN' } }),
        prisma.fiscalPeriod.findFirst({
            where: { startDate: { lte: now }, endDate: { gte: now } },
            orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
        }),
        prisma.bankReconciliation.count({
            where: {
                status: 'COMPLETED',
                completedAt: { gte: monthBounds.start, lte: now },
            },
        }),
    ]);

    return {
        openCount,
        currentPeriod: currentPeriod
            ? {
                  id: currentPeriod.id,
                  name: currentPeriod.name,
                  endDate: currentPeriod.endDate.toISOString(),
                  status: currentPeriod.status,
              }
            : null,
        daysToMonthEnd: currentPeriod
            ? Math.max(
                  0,
                  Math.ceil(
                      (currentPeriod.endDate.getTime() - now.getTime()) /
                          86_400_000,
                  ),
              )
            : null,
        reconThisMonth,
    };
}

export async function readFinanceDrivers(asOfDate: Date) {
    const [year, month] = toBusinessDateString(asOfDate)
        .slice(0, 7)
        .split('-')
        .map(Number);
    // Calendar YTD matches the canonical Executive monthly helper and is bounded
    // to at most 12 report reads, independent of row counts.
    const monthly = await Promise.all(
        Array.from({ length: month }, async (_, index) => {
            const reportMonth = index + 1;
            const report = await getMonthlyIncomeSummary(year, reportMonth);
            return {
                month: `${year}-${String(reportMonth).padStart(2, '0')}`,
                revenue: report.totalRevenue,
                netIncome: report.netIncome,
            };
        }),
    );

    return {
        revenue: monthly.map(({ month: label, revenue }) => ({
            month: label,
            value: revenue,
        })),
        netIncome: monthly.map(({ month: label, netIncome }) => ({
            month: label,
            value: netIncome,
        })),
    };
}
