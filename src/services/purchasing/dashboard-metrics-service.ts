import { Prisma, PurchaseOrderStatus, type PrismaClient } from '@prisma/client';
import {
    getWibDayBounds,
    getWibMonthBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';

export const PURCHASING_SPEND_EXCLUDED_STATUSES = [
    PurchaseOrderStatus.DRAFT,
    PurchaseOrderStatus.CANCELLED,
] as const;

type PurchasingMetricsDb = Pick<PrismaClient, 'purchaseOrder' | 'supplier'>;

export interface PurchasingDashboardNominalMetrics {
    monthlySpend: number;
    previousFullMonthSpend: number;
    previousFullMonthChangePercent: number | null;
    topSupplierName: string | null;
    topSupplierSpend: number | null;
}

export interface PurchasingSpendPeriods {
    current: { start: Date; end: Date };
    previous: { start: Date; end: Date };
}

function previousMonth(year: number, month: number) {
    return month === 1
        ? { year: year - 1, month: 12 }
        : { year, month: month - 1 };
}

export function getPurchasingSpendPeriods(
    now: Date = new Date(),
): PurchasingSpendPeriods {
    const businessDate = toBusinessDateString(now);
    const [year, month] = businessDate.split('-').map(Number);
    const previous = previousMonth(year, month);
    return {
        current: {
            start: getWibMonthBounds(year, month).start,
            end: getWibDayBounds(businessDate).endOfDay,
        },
        previous: getWibMonthBounds(previous.year, previous.month),
    };
}

function spendWhere(period: { start: Date; end: Date }) {
    return {
        orderDate: { gte: period.start, lte: period.end },
        status: { notIn: [...PURCHASING_SPEND_EXCLUDED_STATUSES] },
    } satisfies Prisma.PurchaseOrderWhereInput;
}

function amount(value: Prisma.Decimal | number | string | null | undefined) {
    return value == null ? 0 : Number(value);
}

export async function readPurchasingDashboardNominalMetrics(
    db: PurchasingMetricsDb,
    now: Date = new Date(),
): Promise<PurchasingDashboardNominalMetrics> {
    const periods = getPurchasingSpendPeriods(now);
    const currentWhere = spendWhere(periods.current);

    const [currentSpendResult, previousSpendResult, topSupplierRows] =
        await Promise.all([
            db.purchaseOrder.aggregate({
                where: currentWhere,
                _sum: { totalAmount: true },
            }),
            db.purchaseOrder.aggregate({
                where: spendWhere(periods.previous),
                _sum: { totalAmount: true },
            }),
            db.purchaseOrder.groupBy({
                by: ['supplierId'],
                where: currentWhere,
                having: { totalAmount: { _sum: { not: null } } },
                _sum: { totalAmount: true },
                orderBy: [
                    { _sum: { totalAmount: 'desc' } },
                    { supplierId: 'asc' },
                ],
                take: 1,
            }),
        ]);

    const monthlySpend = amount(currentSpendResult._sum.totalAmount);
    const previousFullMonthSpend = amount(previousSpendResult._sum.totalAmount);
    const topSupplierRow = topSupplierRows[0];
    const topSupplier = topSupplierRow
        ? await db.supplier.findUnique({
              where: { id: topSupplierRow.supplierId },
              select: { name: true },
          })
        : null;

    return {
        monthlySpend,
        previousFullMonthSpend,
        previousFullMonthChangePercent:
            previousFullMonthSpend > 0
                ? ((monthlySpend - previousFullMonthSpend) /
                      previousFullMonthSpend) *
                  100
                : null,
        topSupplierName: topSupplier?.name ?? null,
        topSupplierSpend: topSupplierRow
            ? amount(topSupplierRow._sum.totalAmount)
            : null,
    };
}
