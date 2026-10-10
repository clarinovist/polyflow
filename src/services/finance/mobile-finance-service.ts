import type { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError } from '@/lib/errors/errors';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';
import { positiveSalesReceivableWhere } from '@/services/finance/sales-receivable-query';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';
import { buildOverduePurchaseInvoiceWhere } from '@/services/finance/purchase-payable-query';
import { readHrdDashboardPayrollReadiness } from '@/services/hrd/hrd-dashboard-service';
import {
    availableSection,
    notConfiguredSection,
    unavailableSection,
    type MobileSection,
    type MobileSectionStatus,
} from '@/services/dashboard/mobile-section-state';

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

export type FinanceMobileSectionKey =
    | 'ar'
    | 'ap'
    | 'journals'
    | 'recon'
    | 'fiscal'
    | 'payroll'
    | 'arNominal'
    | 'apNominal';

export type FinanceMobileSections = Partial<
    Record<FinanceMobileSectionKey, MobileSectionStatus>
>;

export interface FinanceMobileQuery {
    type: FinanceMobileType;
    due: FinanceMobileDueFilter;
    bucket: FinanceMobileBucket;
    page: number;
    canViewAmounts: boolean;
    now?: Date;
}

export interface FinanceMobileInvoice {
    id: string;
    type: 'AR' | 'AP';
    invoiceNumber: string;
    partnerName: string;
    status: string;
    invoiceDate: string;
    dueDate: string | null;
    bucket: FinanceMobileBucket;
    remainingAmount?: number;
    followUp?: {
        type: string;
        activityDate: string;
        promisedDate: string | null;
        ownerName: string;
    } | null;
}

export interface FinanceMobilePayrollReadiness {
    year: number;
    month: number;
    status: 'OPEN';
    counts: { draft: number; finalized: number; paid: number };
    total: number;
}

export interface FinanceMobileOverviewDto {
    generatedAt: string;
    query: {
        type: FinanceMobileType;
        due: FinanceMobileDueFilter;
        bucket: FinanceMobileBucket;
        page: number;
    };
    sections: FinanceMobileSections;
    counts: {
        total: number | null;
        returned: number;
        ar: number | null;
        ap: number | null;
        hasNext: boolean;
        pageSizePerType: number;
    };
    highlights: {
        arCount: number | null;
        apCount: number | null;
        draftJournalCount: number | null;
        openReconCount: number | null;
        arAmount?: number;
        apAmount?: number;
    };
    invoices: FinanceMobileInvoice[];
    readiness: {
        fiscalPeriod: MobileSection<{ period: string; status: string }>;
        payroll: MobileSection<FinanceMobilePayrollReadiness>;
    };
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
        AND: [
            positiveSalesReceivableWhere(),
            datePredicate(rangeFor(input)),
            // Operational-order exclusion is a relation predicate in SQL, so
            // the same canonical scope applies to every due/bucket mode.
            { salesOrder: buildOperationalSalesReceivableOrderWhere() },
        ],
    };
}
function apWhere(
    input: FinanceMobileQuery,
    tx: Prisma.TransactionClient,
): Prisma.PurchaseInvoiceWhereInput {
    return input.due === 'OVERDUE'
        ? buildOverduePurchaseInvoiceWhere(tx, input.now)
        : {
              AND: [
                  {
                      status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                      totalAmount: {
                          gt: tx.purchaseInvoice.fields.paidAmount,
                      },
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

const INVOICE_ORDER_BY = [
    { dueDate: 'asc' },
    { invoiceDate: 'asc' },
    { id: 'asc' },
] as const;

async function readArGroup(
    tx: Prisma.TransactionClient,
    where: Prisma.InvoiceWhereInput,
    options: { skip: number; canViewAmounts: boolean },
) {
    const [aggregate, rows] = await Promise.all([
        tx.invoice.aggregate({
            where,
            _count: true,
            ...(options.canViewAmounts
                ? { _sum: { remainingAmount: true } }
                : {}),
        }),
        tx.invoice.findMany({
            where,
            skip: options.skip,
            take: FINANCE_MOBILE_PAGE_SIZE,
            orderBy: [...INVOICE_ORDER_BY],
            select: {
                id: true,
                invoiceNumber: true,
                invoiceDate: true,
                dueDate: true,
                status: true,
                ...(options.canViewAmounts ? { remainingAmount: true } : {}),
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
        }),
    ]);
    return { aggregate, rows };
}

async function readApGroup(
    tx: Prisma.TransactionClient,
    where: Prisma.PurchaseInvoiceWhereInput,
    options: { skip: number; canViewAmounts: boolean },
) {
    const [aggregate, rows] = await Promise.all([
        tx.purchaseInvoice.aggregate({
            where,
            _count: true,
            ...(options.canViewAmounts
                ? { _sum: { totalAmount: true, paidAmount: true } }
                : {}),
        }),
        tx.purchaseInvoice.findMany({
            where,
            skip: options.skip,
            take: FINANCE_MOBILE_PAGE_SIZE,
            orderBy: [...INVOICE_ORDER_BY],
            select: {
                id: true,
                invoiceNumber: true,
                invoiceDate: true,
                dueDate: true,
                status: true,
                ...(options.canViewAmounts
                    ? { totalAmount: true, paidAmount: true }
                    : {}),
                purchaseOrder: {
                    select: { supplier: { select: { name: true } } },
                },
            },
        }),
    ]);
    return { aggregate, rows };
}

async function readDraftJournalCount(tx: Prisma.TransactionClient) {
    return {
        count: await tx.journalEntry.count({ where: { status: 'DRAFT' } }),
    };
}

async function readOpenReconciliationCount(tx: Prisma.TransactionClient) {
    return {
        count: await tx.bankReconciliation.count({
            where: { status: { in: ['DRAFT', 'IN_PROGRESS'] } },
        }),
    };
}

async function readCurrentFiscalPeriod(
    tx: Prisma.TransactionClient,
    now: Date,
) {
    const businessDate = toBusinessDateString(now);
    return tx.fiscalPeriod.findUnique({
        where: {
            year_month: {
                year: Number(businessDate.slice(0, 4)),
                month: Number(businessDate.slice(5, 7)),
            },
        },
        select: { year: true, month: true, status: true },
    });
}

function settledValue<T>(outcome: PromiseSettledResult<T | null>): T | null {
    return outcome.status === 'fulfilled' ? outcome.value : null;
}

function outcomeStatus(
    outcome: PromiseSettledResult<unknown>,
): MobileSectionStatus {
    return outcome.status === 'fulfilled' ? 'AVAILABLE' : 'UNAVAILABLE';
}

export async function readFinanceMobileOverview(
    db: PrismaClient,
    input: FinanceMobileQuery,
): Promise<FinanceMobileOverviewDto> {
    // One captured clock feeds range predicates, bucket labels, and freshness.
    const now = input.now ?? new Date();
    const query: FinanceMobileQuery = { ...input, now };
    const skip = (query.page - 1) * FINANCE_MOBILE_PAGE_SIZE;
    const readAr = query.type !== 'AP';
    const readAp = query.type !== 'AR';

    const repeatableRead = <T>(
        reader: (tx: Prisma.TransactionClient) => Promise<T>,
    ) =>
        db.$transaction(reader, {
            isolationLevel: 'RepeatableRead',
        });

    // PostgreSQL aborts a transaction after a statement error. Keep section
    // reads in independent repeatable-read boundaries so one unavailable
    // section cannot cascade transaction-aborted failures to its peers.
    const [
        arOutcome,
        apOutcome,
        journalOutcome,
        reconOutcome,
        fiscalOutcome,
        payrollOutcome,
    ] = await Promise.allSettled([
        readAr
            ? repeatableRead((tx) =>
                  readArGroup(tx, arWhere(query), {
                      skip,
                      canViewAmounts: query.canViewAmounts,
                  }),
              )
            : Promise.resolve(null),
        readAp
            ? repeatableRead((tx) =>
                  readApGroup(tx, apWhere(query, tx), {
                      skip,
                      canViewAmounts: query.canViewAmounts,
                  }),
              )
            : Promise.resolve(null),
        repeatableRead((tx) => readDraftJournalCount(tx)),
        repeatableRead((tx) => readOpenReconciliationCount(tx)),
        repeatableRead((tx) => readCurrentFiscalPeriod(tx, now)),
        repeatableRead((tx) => readHrdDashboardPayrollReadiness(tx)),
    ]);

    {
        const arData = settledValue(arOutcome);
        const apData = settledValue(apOutcome);
        const journalData = settledValue(journalOutcome);
        const reconData = settledValue(reconOutcome);

        const invoices: FinanceMobileInvoice[] = [
            ...(arData?.rows ?? []).map((row) => ({
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
            ...(apData?.rows ?? []).map((row) => ({
                id: row.id,
                type: 'AP' as const,
                invoiceNumber: row.invoiceNumber,
                partnerName: row.purchaseOrder?.supplier?.name ?? 'Supplier',
                status: row.status,
                invoiceDate: row.invoiceDate.toISOString(),
                dueDate: row.dueDate?.toISOString() ?? null,
                bucket: bucketFor(row.dueDate ?? row.invoiceDate, now),
                ...('totalAmount' in row && 'paidAmount' in row
                    ? {
                          remainingAmount:
                              Number(row.totalAmount) - Number(row.paidAmount),
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

        const arCount = arData ? arData.aggregate._count : null;
        const apCount = apData ? apData.aggregate._count : null;
        const arAmount =
            query.canViewAmounts && arData
                ? Number(arData.aggregate._sum?.remainingAmount ?? 0)
                : undefined;
        const apAmount =
            query.canViewAmounts && apData
                ? Number(apData.aggregate._sum?.totalAmount ?? 0) -
                  Number(apData.aggregate._sum?.paidAmount ?? 0)
                : undefined;

        const fiscalValue =
            fiscalOutcome.status === 'fulfilled' ? fiscalOutcome.value : null;
        const payrollValue =
            payrollOutcome.status === 'fulfilled' ? payrollOutcome.value : null;
        const period = toBusinessDateString(now).slice(0, 7);
        const fiscalPeriod: MobileSection<{
            period: string;
            status: string;
        }> =
            fiscalOutcome.status === 'rejected'
                ? unavailableSection()
                : fiscalValue
                  ? availableSection({
                        period,
                        status: fiscalValue.status,
                    })
                  : notConfiguredSection();
        const payroll: MobileSection<FinanceMobilePayrollReadiness> =
            payrollOutcome.status === 'rejected'
                ? unavailableSection()
                : payrollValue
                  ? availableSection({
                        year: payrollValue.year,
                        month: payrollValue.month,
                        status: 'OPEN',
                        counts: {
                            draft: payrollValue.draft,
                            finalized: payrollValue.finalized,
                            paid: payrollValue.paid,
                        },
                        total: payrollValue.total,
                    })
                  : notConfiguredSection();

        const sections: FinanceMobileSections = {};
        if (readAr) sections.ar = outcomeStatus(arOutcome);
        if (readAp) sections.ap = outcomeStatus(apOutcome);
        sections.journals = outcomeStatus(journalOutcome);
        sections.recon = outcomeStatus(reconOutcome);
        sections.fiscal =
            fiscalOutcome.status === 'rejected'
                ? 'UNAVAILABLE'
                : fiscalValue
                  ? 'AVAILABLE'
                  : 'NOT_CONFIGURED';
        sections.payroll =
            payrollOutcome.status === 'rejected'
                ? 'UNAVAILABLE'
                : payrollValue
                  ? 'AVAILABLE'
                  : 'NOT_CONFIGURED';
        if (readAr)
            sections.arNominal = query.canViewAmounts
                ? outcomeStatus(arOutcome)
                : 'HIDDEN';
        if (readAp)
            sections.apNominal = query.canViewAmounts
                ? outcomeStatus(apOutcome)
                : 'HIDDEN';

        return {
            generatedAt: now.toISOString(),
            query: {
                type: query.type,
                due: query.due,
                bucket: query.bucket,
                page: query.page,
            },
            sections,
            counts: {
                total:
                    (readAr && arCount == null) || (readAp && apCount == null)
                        ? null
                        : (arCount ?? 0) + (apCount ?? 0),
                returned: invoices.length,
                ar: arCount,
                ap: apCount,
                hasNext:
                    (arCount != null &&
                        query.page * FINANCE_MOBILE_PAGE_SIZE < arCount) ||
                    (apCount != null &&
                        query.page * FINANCE_MOBILE_PAGE_SIZE < apCount),
                pageSizePerType: FINANCE_MOBILE_PAGE_SIZE,
            },
            highlights: {
                arCount,
                apCount,
                draftJournalCount: journalData?.count ?? null,
                openReconCount: reconData?.count ?? null,
                ...(arAmount === undefined ? {} : { arAmount }),
                ...(apAmount === undefined ? {} : { apAmount }),
            },
            invoices,
            readiness: { fiscalPeriod, payroll },
        };
    }
}

export async function readFinanceMobileInvoiceDetail(
    db: PrismaClient,
    type: 'AR' | 'AP',
    id: string,
    canViewAmounts: boolean,
) {
    if (type === 'AR') {
        const row = await db.invoice.findFirst({
            where: {
                id,
                ...positiveSalesReceivableWhere(),
                salesOrder: buildOperationalSalesReceivableOrderWhere(),
            },
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
