import type { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError } from '@/lib/errors/errors';
import { positiveSalesReceivableWhere } from '@/services/finance/sales-receivable-query';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

export const FINANCE_MOBILE_PAGE_SIZE = 10;
export const FINANCE_MOBILE_TYPES = ['ALL', 'AR', 'AP'] as const;
export const FINANCE_MOBILE_DUE_FILTERS = [
    'ALL',
    'OVERDUE',
    'DUE_SOON',
] as const;
export const FINANCE_MOBILE_BUCKETS = [
    'ALL',
    'NOT_DUE',
    '1_30',
    '31_60',
    '61_90',
    '90_PLUS',
] as const;
export type FinanceMobileType = (typeof FINANCE_MOBILE_TYPES)[number];
export type FinanceMobileDueFilter =
    (typeof FINANCE_MOBILE_DUE_FILTERS)[number];
export type FinanceMobileBucket = (typeof FINANCE_MOBILE_BUCKETS)[number];

export interface FinanceMobileQuery {
    type: FinanceMobileType;
    due: FinanceMobileDueFilter;
    bucket: FinanceMobileBucket;
    page: number;
    canViewAmounts: boolean;
    now?: Date;
}

const DAY = 86_400_000;
function rangeFor(input: FinanceMobileQuery) {
    const now = input.now ?? new Date();
    const startOfToday = getWibDayBounds(toBusinessDateString(now)).startOfDay;
    if (input.due === 'OVERDUE') return { lt: startOfToday };
    if (input.due === 'DUE_SOON')
        return {
            gte: startOfToday,
            lt: new Date(startOfToday.getTime() + 7 * DAY),
        };
    if (input.bucket === 'NOT_DUE') return { gte: startOfToday };
    const bounds: Record<
        Exclude<FinanceMobileBucket, 'ALL' | 'NOT_DUE'>,
        { gte?: Date; lt: Date }
    > = {
        '1_30': {
            gte: new Date(startOfToday.getTime() - 30 * DAY),
            lt: startOfToday,
        },
        '31_60': {
            gte: new Date(startOfToday.getTime() - 60 * DAY),
            lt: new Date(startOfToday.getTime() - 30 * DAY),
        },
        '61_90': {
            gte: new Date(startOfToday.getTime() - 90 * DAY),
            lt: new Date(startOfToday.getTime() - 60 * DAY),
        },
        '90_PLUS': { lt: new Date(startOfToday.getTime() - 90 * DAY) },
    };
    return input.bucket === 'ALL' ? undefined : bounds[input.bucket];
}

function datePredicate(range: { gte?: Date; lt?: Date } | undefined) {
    if (!range) return {};
    return { OR: [{ dueDate: range }, { dueDate: null, invoiceDate: range }] };
}

function arWhere(input: FinanceMobileQuery): Prisma.InvoiceWhereInput {
    return {
        AND: [positiveSalesReceivableWhere(), datePredicate(rangeFor(input))],
    };
}
function apWhere(
    input: FinanceMobileQuery,
    tx: Prisma.TransactionClient,
): Prisma.PurchaseInvoiceWhereInput {
    return {
        AND: [
            {
                status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                totalAmount: { gt: tx.purchaseInvoice.fields.paidAmount },
            },
            datePredicate(rangeFor(input)),
        ],
    };
}

function bucketFor(date: Date, now: Date): FinanceMobileBucket {
    const days = Math.floor(
        (getWibDayBounds(toBusinessDateString(now)).startOfDay.getTime() -
            getWibDayBounds(toBusinessDateString(date)).startOfDay.getTime()) /
            DAY,
    );
    if (days < 0) return 'NOT_DUE';
    if (days <= 30) return '1_30';
    if (days <= 60) return '31_60';
    if (days <= 90) return '61_90';
    return '90_PLUS';
}

export async function readFinanceMobileOverview(
    db: PrismaClient,
    input: FinanceMobileQuery,
) {
    const now = input.now ?? new Date();
    const skip = (input.page - 1) * FINANCE_MOBILE_PAGE_SIZE;
    return db.$transaction(
        async (tx) => {
            const ar = arWhere(input);
            const ap = apWhere(input, tx);
            const readAr = input.type !== 'AP';
            const readAp = input.type !== 'AR';
            const [
                arTotal,
                apTotal,
                arRows,
                apRows,
                draftJournalCount,
                openReconCount,
                fiscalPeriod,
                payrollPeriod,
            ] = await Promise.all([
                readAr
                    ? tx.invoice.aggregate({
                          where: ar,
                          _count: true,
                          ...(input.canViewAmounts
                              ? { _sum: { remainingAmount: true } }
                              : {}),
                      })
                    : null,
                readAp
                    ? tx.purchaseInvoice.aggregate({
                          where: ap,
                          _count: true,
                          ...(input.canViewAmounts
                              ? {
                                    _sum: {
                                        totalAmount: true,
                                        paidAmount: true,
                                    },
                                }
                              : {}),
                      })
                    : null,
                readAr
                    ? tx.invoice.findMany({
                          where: ar,
                          skip,
                          take: FINANCE_MOBILE_PAGE_SIZE,
                          orderBy: [
                              { dueDate: 'asc' },
                              { invoiceDate: 'asc' },
                              { id: 'asc' },
                          ],
                          select: {
                              id: true,
                              invoiceNumber: true,
                              invoiceDate: true,
                              dueDate: true,
                              status: true,
                              ...(input.canViewAmounts
                                  ? { remainingAmount: true }
                                  : {}),
                              salesOrder: {
                                  select: {
                                      customer: { select: { name: true } },
                                  },
                              },
                              collectionActivities: {
                                  orderBy: [
                                      { activityDate: 'desc' },
                                      { id: 'desc' },
                                  ],
                                  take: 1,
                                  select: {
                                      type: true,
                                      activityDate: true,
                                      promisedDate: true,
                                      user: { select: { name: true } },
                                  },
                              },
                          },
                      })
                    : [],
                readAp
                    ? tx.purchaseInvoice.findMany({
                          where: ap,
                          skip,
                          take: FINANCE_MOBILE_PAGE_SIZE,
                          orderBy: [
                              { dueDate: 'asc' },
                              { invoiceDate: 'asc' },
                              { id: 'asc' },
                          ],
                          select: {
                              id: true,
                              invoiceNumber: true,
                              invoiceDate: true,
                              dueDate: true,
                              status: true,
                              ...(input.canViewAmounts
                                  ? { totalAmount: true, paidAmount: true }
                                  : {}),
                              purchaseOrder: {
                                  select: {
                                      supplier: { select: { name: true } },
                                  },
                              },
                          },
                      })
                    : [],
                tx.journalEntry.count({ where: { status: 'DRAFT' } }),
                tx.bankReconciliation.count({
                    where: { status: { in: ['DRAFT', 'IN_PROGRESS'] } },
                }),
                tx.fiscalPeriod.findUnique({
                    where: {
                        year_month: {
                            year: Number(toBusinessDateString(now).slice(0, 4)),
                            month: Number(
                                toBusinessDateString(now).slice(5, 7),
                            ),
                        },
                    },
                    select: { year: true, month: true, status: true },
                }),
                tx.payrollPeriod.findUnique({
                    where: {
                        year_month: {
                            year: Number(toBusinessDateString(now).slice(0, 4)),
                            month: Number(
                                toBusinessDateString(now).slice(5, 7),
                            ),
                        },
                    },
                    select: {
                        year: true,
                        month: true,
                        status: true,
                        payslips: { select: { status: true } },
                    },
                }),
            ]);
            const invoices = [
                ...arRows.map((row) => ({
                    id: row.id,
                    type: 'AR' as const,
                    invoiceNumber: row.invoiceNumber,
                    partnerName: row.salesOrder?.customer?.name ?? 'Pelanggan',
                    status: row.status,
                    invoiceDate: row.invoiceDate.toISOString(),
                    dueDate: row.dueDate?.toISOString() ?? null,
                    bucket: bucketFor(row.dueDate ?? row.invoiceDate, now),
                    followUp: row.collectionActivities[0]
                        ? {
                              type: row.collectionActivities[0].type,
                              activityDate:
                                  row.collectionActivities[0].activityDate.toISOString(),
                              promisedDate:
                                  row.collectionActivities[0].promisedDate?.toISOString() ??
                                  null,
                              ownerName:
                                  row.collectionActivities[0].user.name ??
                                  'Petugas',
                          }
                        : null,
                    ...('remainingAmount' in row
                        ? { remainingAmount: Number(row.remainingAmount) }
                        : {}),
                })),
                ...apRows.map((row) => ({
                    id: row.id,
                    type: 'AP' as const,
                    invoiceNumber: row.invoiceNumber,
                    partnerName:
                        row.purchaseOrder?.supplier?.name ?? 'Supplier',
                    status: row.status,
                    invoiceDate: row.invoiceDate.toISOString(),
                    dueDate: row.dueDate?.toISOString() ?? null,
                    bucket: bucketFor(row.dueDate ?? row.invoiceDate, now),
                    ...('totalAmount' in row && 'paidAmount' in row
                        ? {
                              remainingAmount:
                                  Number(row.totalAmount) -
                                  Number(row.paidAmount),
                          }
                        : {}),
                })),
            ].sort(
                (a, b) =>
                    (a.dueDate ?? a.invoiceDate).localeCompare(
                        b.dueDate ?? b.invoiceDate,
                    ) ||
                    a.type.localeCompare(b.type) ||
                    a.id.localeCompare(b.id),
            );
            const arCount = arTotal?._count ?? 0;
            const apCount = apTotal?._count ?? 0;
            const payrollCounts = { draft: 0, finalized: 0, paid: 0 };
            for (const slip of payrollPeriod?.payslips ?? [])
                payrollCounts[
                    slip.status.toLowerCase() as keyof typeof payrollCounts
                ]++;
            return {
                generatedAt: now.toISOString(),
                query: {
                    type: input.type,
                    due: input.due,
                    bucket: input.bucket,
                    page: input.page,
                },
                counts: {
                    total: arCount + apCount,
                    returned: invoices.length,
                    ar: arCount,
                    ap: apCount,
                    hasNext:
                        input.page * FINANCE_MOBILE_PAGE_SIZE < arCount ||
                        input.page * FINANCE_MOBILE_PAGE_SIZE < apCount,
                    pageSizePerType: FINANCE_MOBILE_PAGE_SIZE,
                },
                highlights: {
                    arCount,
                    apCount,
                    draftJournalCount,
                    openReconCount,
                    ...(input.canViewAmounts
                        ? {
                              arAmount: Number(
                                  arTotal?._sum?.remainingAmount ?? 0,
                              ),
                              apAmount:
                                  Number(apTotal?._sum?.totalAmount ?? 0) -
                                  Number(apTotal?._sum?.paidAmount ?? 0),
                          }
                        : {}),
                },
                invoices,
                readiness: {
                    fiscalPeriod: fiscalPeriod
                        ? {
                              period: toBusinessDateString(now).slice(0, 7),
                              status: fiscalPeriod.status,
                          }
                        : null,
                    payroll: payrollPeriod
                        ? {
                              year: payrollPeriod.year,
                              month: payrollPeriod.month,
                              status: payrollPeriod.status,
                              counts: payrollCounts,
                              total: payrollPeriod.payslips.length,
                          }
                        : null,
                },
            };
        },
        { isolationLevel: 'RepeatableRead' },
    );
}

export async function readFinanceMobileInvoiceDetail(
    db: PrismaClient,
    type: 'AR' | 'AP',
    id: string,
    canViewAmounts: boolean,
) {
    if (type === 'AR') {
        const row = await db.invoice.findFirst({
            where: { id, ...positiveSalesReceivableWhere() },
            select: {
                id: true,
                invoiceNumber: true,
                invoiceDate: true,
                dueDate: true,
                status: true,
                ...(canViewAmounts ? { remainingAmount: true } : {}),
                salesOrder: {
                    select: { customer: { select: { name: true } } },
                },
                collectionActivities: {
                    orderBy: [{ activityDate: 'desc' }, { id: 'desc' }],
                    take: 1,
                    select: {
                        type: true,
                        activityDate: true,
                        promisedDate: true,
                        user: { select: { name: true } },
                    },
                },
            },
        });
        if (!row) throw new NotFoundError('Invoice');
        return {
            id: row.id,
            type,
            invoiceNumber: row.invoiceNumber,
            partnerName: row.salesOrder?.customer?.name ?? 'Pelanggan',
            invoiceDate: row.invoiceDate.toISOString(),
            dueDate: row.dueDate?.toISOString() ?? null,
            status: row.status,
            followUp: row.collectionActivities[0]
                ? {
                      type: row.collectionActivities[0].type,
                      activityDate:
                          row.collectionActivities[0].activityDate.toISOString(),
                      promisedDate:
                          row.collectionActivities[0].promisedDate?.toISOString() ??
                          null,
                      ownerName:
                          row.collectionActivities[0].user.name ?? 'Petugas',
                  }
                : null,
            ...('remainingAmount' in row
                ? { remainingAmount: Number(row.remainingAmount) }
                : {}),
        };
    }
    const row = await db.$transaction((tx) =>
        tx.purchaseInvoice.findFirst({
            where: {
                id,
                status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                totalAmount: { gt: tx.purchaseInvoice.fields.paidAmount },
            },
            select: {
                id: true,
                invoiceNumber: true,
                invoiceDate: true,
                dueDate: true,
                status: true,
                ...(canViewAmounts
                    ? { totalAmount: true, paidAmount: true }
                    : {}),
                purchaseOrder: {
                    select: { supplier: { select: { name: true } } },
                },
            },
        }),
    );
    if (!row) throw new NotFoundError('Invoice');
    return {
        id: row.id,
        type,
        invoiceNumber: row.invoiceNumber,
        partnerName: row.purchaseOrder?.supplier?.name ?? 'Supplier',
        invoiceDate: row.invoiceDate.toISOString(),
        dueDate: row.dueDate?.toISOString() ?? null,
        status: row.status,
        ...('totalAmount' in row && 'paidAmount' in row
            ? {
                  remainingAmount:
                      Number(row.totalAmount) - Number(row.paidAmount),
              }
            : {}),
    };
}
