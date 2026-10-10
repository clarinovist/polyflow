import { Prisma, SalesOrderStatus, type PrismaClient } from '@prisma/client';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError } from '@/lib/errors/errors';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';
import {
    observeDashboardSection,
    recordDashboardSectionState,
} from '@/services/dashboard/dashboard-section-observability';
import {
    availableSection,
    hiddenSection,
    unavailableSection,
    type MobileSection,
} from '@/services/dashboard/mobile-section-state';
import { positiveSalesReceivableWhere } from '@/services/finance/sales-receivable-query';
import {
    getFieldSalesScope,
    scopedSalesOrderWhere,
    type FieldSalesActorScope,
} from '@/services/sales/field-scope';
import {
    BUSINESS_TIMEZONE,
    getWibDayBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';

const PIPELINE_SAMPLE_LIMIT = 3;
const RECEIVABLE_SAMPLE_LIMIT = 3;
const FOLLOW_UP_SAMPLE_LIMIT = 10;

const PIPELINE_STATUSES: SalesOrderStatus[] = [
    SalesOrderStatus.QUOTATION,
    SalesOrderStatus.QUOTATION_SENT,
    SalesOrderStatus.DRAFT,
    SalesOrderStatus.CONFIRMED,
    SalesOrderStatus.IN_PRODUCTION,
    SalesOrderStatus.READY_TO_SHIP,
];
const QUOTATION_STATUSES: SalesOrderStatus[] = [
    SalesOrderStatus.QUOTATION,
    SalesOrderStatus.QUOTATION_SENT,
];

type Sample<T> = { total: number; returned: number; items: T[] };

export type FieldSalesCustomerDto = {
    id: string;
    name: string;
    code: string | null;
    city: string | null;
};

export type FieldSalesRouteDto = {
    id: string;
    date: string;
    status: string;
    items: Array<{
        id: string;
        customerId: string;
        sortOrder: number;
        status: string;
        customer: FieldSalesCustomerDto;
    }>;
};

export type FieldSalesFollowUpDto = {
    id: string;
    orderNumber: string;
    customerName: string;
    nextFollowUpDate: string;
    displayDate: string;
    isOverdue: boolean;
};

export type FieldSalesPipelineItemDto = {
    id: string;
    orderNumber: string;
    customerName: string;
    status: string;
    orderDate: string;
    totalAmount?: number | null;
};

export type FieldSalesPipelineDto = Sample<FieldSalesPipelineItemDto> & {
    activeCount: number;
    openQuotationCount: number;
    nominal: MobileSection<{
        pipelineAmount: number;
        openQuotationAmount: number;
    }>;
};

export type FieldSalesReceivableItemDto = {
    id: string;
    invoiceNumber: string;
    orderNumber: string;
    customerName: string;
    status: string;
    dueDate: string | null;
    remainingAmount: number;
};

export type FieldSalesReceivablesDto = {
    total: number;
    overdueCount: number;
    href: '/field/sales/receivables' | null;
    nominal: MobileSection<
        Sample<FieldSalesReceivableItemDto> & { totalOutstanding: number }
    >;
};

export type FieldSalesComplianceDto = {
    assigned: number;
    completed: number;
    extraCalls: number;
    compliance: number;
};

export type FieldSalesMobileOverviewDto = {
    generatedAt: string;
    businessDate: string;
    greeting: string;
    displayDate: string;
    sections: {
        route: MobileSection<FieldSalesRouteDto | null>;
        followUps: MobileSection<Sample<FieldSalesFollowUpDto>>;
        compliance: MobileSection<FieldSalesComplianceDto>;
        pipeline: MobileSection<FieldSalesPipelineDto>;
        activeCustomers: MobileSection<FieldSalesCustomerDto[]>;
        receivables: MobileSection<FieldSalesReceivablesDto>;
    };
};

type TemporalContext = {
    now: Date;
    businessDate: string;
    routeStorageDate: Date;
    startOfDay: Date;
    endOfDay: Date;
};

type TransactionDb = Prisma.TransactionClient;

export interface FieldSalesMobileReader {
    readRoute(
        scope: FieldSalesActorScope,
        temporal: TemporalContext,
    ): Promise<FieldSalesRouteDto | null>;
    readFollowUps(
        scope: FieldSalesActorScope,
        temporal: TemporalContext,
    ): Promise<Sample<FieldSalesFollowUpDto>>;
    readCompliance(
        scope: FieldSalesActorScope,
        temporal: TemporalContext,
    ): Promise<FieldSalesComplianceDto>;
    readPipeline(
        scope: FieldSalesActorScope,
        canViewPrices: boolean,
    ): Promise<FieldSalesPipelineDto>;
    readActiveCustomers(
        scope: FieldSalesActorScope,
        temporal: TemporalContext,
    ): Promise<FieldSalesCustomerDto[]>;
    readReceivables(
        scope: FieldSalesActorScope,
        temporal: TemporalContext,
        canViewPrices: boolean,
    ): Promise<FieldSalesReceivablesDto>;
}

function decimalNumber(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && 'toNumber' in value) {
        return (value as { toNumber: () => number }).toNumber();
    }
    return Number(value);
}

function formatFollowUpDate(date: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: BUSINESS_TIMEZONE,
        day: '2-digit',
        month: 'short',
    }).format(date);
}

export function routeStorageDateForBusinessDate(businessDate: string): Date {
    return new Date(`${businessDate}T00:00:00.000Z`);
}

function activeCustomerWhere(
    scope: FieldSalesActorScope,
    routeStorageDate: Date,
): Prisma.CustomerWhereInput {
    if (scope.isGlobalViewer) return { isActive: true };

    return {
        isActive: true,
        OR: [
            {
                salesAssignments: {
                    some: { userId: scope.actorUserId, unassignedAt: null },
                },
            },
            {
                routePlanItems: {
                    some: {
                        routePlan: {
                            userId: scope.actorUserId,
                            date: routeStorageDate,
                            status: { in: ['DRAFT', 'PUBLISHED'] },
                        },
                    },
                },
            },
            { salesOrders: { some: { createdById: scope.actorUserId } } },
            { salesVisits: { some: { userId: scope.actorUserId } } },
        ],
    };
}

export function fieldSalesReceivableWhere(
    scope: FieldSalesActorScope,
): Prisma.InvoiceWhereInput {
    return {
        AND: [
            positiveSalesReceivableWhere(),
            {
                salesOrder: {
                    AND: [
                        scopedSalesOrderWhere(scope),
                        buildOperationalSalesReceivableOrderWhere(),
                    ],
                },
            },
        ],
    };
}

function withRepeatableRead<T>(
    db: PrismaClient,
    read: (tx: TransactionDb) => Promise<T>,
): Promise<T> {
    return db.$transaction(read, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
}

export function createFieldSalesMobileReader(
    db: PrismaClient,
): FieldSalesMobileReader {
    return {
        readRoute(scope, temporal) {
            return withRepeatableRead(db, async (tx) => {
                const plan = await tx.salesRoutePlan.findUnique({
                    where: {
                        date_userId: {
                            date: temporal.routeStorageDate,
                            userId: scope.actorUserId,
                        },
                    },
                    select: {
                        id: true,
                        date: true,
                        status: true,
                        items: {
                            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                            select: {
                                id: true,
                                customerId: true,
                                sortOrder: true,
                                status: true,
                                customer: {
                                    select: {
                                        id: true,
                                        name: true,
                                        code: true,
                                        city: true,
                                    },
                                },
                            },
                        },
                    },
                });
                if (!plan) return null;
                return {
                    ...plan,
                    date: temporal.businessDate,
                };
            });
        },
        readFollowUps(scope, temporal) {
            return withRepeatableRead(db, async (tx) => {
                const where: Prisma.SalesOrderWhereInput = {
                    AND: [
                        scopedSalesOrderWhere(scope),
                        {
                            customerId: { not: null },
                            status: { in: QUOTATION_STATUSES },
                            nextFollowUpDate: {
                                not: null,
                                lte: temporal.endOfDay,
                            },
                        },
                    ],
                };
                const [total, orders] = await Promise.all([
                    tx.salesOrder.count({ where }),
                    tx.salesOrder.findMany({
                        where,
                        select: {
                            id: true,
                            orderNumber: true,
                            nextFollowUpDate: true,
                            customer: { select: { name: true } },
                        },
                        orderBy: [{ nextFollowUpDate: 'asc' }, { id: 'asc' }],
                        take: FOLLOW_UP_SAMPLE_LIMIT,
                    }),
                ]);
                const items = orders.map((order) => {
                    const followUpDate = order.nextFollowUpDate!;
                    return {
                        id: order.id,
                        orderNumber: order.orderNumber,
                        customerName: order.customer?.name ?? '-',
                        nextFollowUpDate: followUpDate.toISOString(),
                        displayDate: formatFollowUpDate(followUpDate),
                        isOverdue:
                            followUpDate.getTime() <
                            temporal.startOfDay.getTime(),
                    };
                });
                return { total, returned: items.length, items };
            });
        },
        readCompliance(scope, temporal) {
            return withRepeatableRead(db, async (tx) => {
                const routeWhere: Prisma.SalesRoutePlanItemWhereInput = {
                    routePlan: {
                        date: temporal.routeStorageDate,
                        ...(scope.isGlobalViewer
                            ? {}
                            : { userId: scope.actorUserId }),
                    },
                };
                const [assigned, completed, extraCalls] = await Promise.all([
                    tx.salesRoutePlanItem.count({ where: routeWhere }),
                    tx.salesRoutePlanItem.count({
                        where: {
                            AND: [
                                routeWhere,
                                { status: { in: ['COMPLETED', 'VISITING'] } },
                            ],
                        },
                    }),
                    tx.salesVisit.count({
                        where: {
                            ...(scope.isGlobalViewer
                                ? {}
                                : { userId: scope.actorUserId }),
                            isExtraCall: true,
                            checkInTime: {
                                gte: temporal.startOfDay,
                                lte: temporal.endOfDay,
                            },
                        },
                    }),
                ]);
                return {
                    assigned,
                    completed,
                    extraCalls,
                    compliance:
                        assigned > 0
                            ? Math.round((completed / assigned) * 100)
                            : 0,
                };
            });
        },
        readPipeline(scope, canViewPrices) {
            return withRepeatableRead(db, async (tx) => {
                const where: Prisma.SalesOrderWhereInput = {
                    AND: [
                        scopedSalesOrderWhere(scope),
                        {
                            customerId: { not: null },
                            status: { in: PIPELINE_STATUSES },
                        },
                    ],
                };
                const statsPromise = canViewPrices
                    ? tx.salesOrder.groupBy({
                          where,
                          by: ['status'],
                          _count: { status: true },
                          _sum: { totalAmount: true },
                      })
                    : tx.salesOrder.groupBy({
                          where,
                          by: ['status'],
                          _count: { status: true },
                      });
                const rowsPromise = tx.salesOrder.findMany({
                    where,
                    select: {
                        id: true,
                        orderNumber: true,
                        status: true,
                        orderDate: true,
                        customer: { select: { name: true } },
                        ...(canViewPrices ? { totalAmount: true } : {}),
                    },
                    orderBy: [{ orderDate: 'desc' }, { id: 'desc' }],
                    take: PIPELINE_SAMPLE_LIMIT,
                });
                const [stats, rows] = await Promise.all([
                    statsPromise,
                    rowsPromise,
                ]);
                const activeCount = stats.reduce(
                    (sum, row) => sum + row._count.status,
                    0,
                );
                const openQuotationCount = stats
                    .filter((row) => QUOTATION_STATUSES.includes(row.status))
                    .reduce((sum, row) => sum + row._count.status, 0);
                const items = rows.map((row) => ({
                    id: row.id,
                    orderNumber: row.orderNumber,
                    customerName: row.customer?.name ?? '-',
                    status: row.status,
                    orderDate: row.orderDate.toISOString(),
                    ...(canViewPrices
                        ? {
                              totalAmount:
                                  (row as { totalAmount?: unknown })
                                      .totalAmount == null
                                      ? null
                                      : decimalNumber(
                                            (row as { totalAmount?: unknown })
                                                .totalAmount,
                                        ),
                          }
                        : {}),
                }));
                const nominal = canViewPrices
                    ? availableSection({
                          pipelineAmount: stats.reduce(
                              (sum, row) =>
                                  sum +
                                  decimalNumber(
                                      (
                                          row as {
                                              _sum?: {
                                                  totalAmount?: unknown;
                                              };
                                          }
                                      )._sum?.totalAmount,
                                  ),
                              0,
                          ),
                          openQuotationAmount: stats
                              .filter((row) =>
                                  QUOTATION_STATUSES.includes(row.status),
                              )
                              .reduce(
                                  (sum, row) =>
                                      sum +
                                      decimalNumber(
                                          (
                                              row as {
                                                  _sum?: {
                                                      totalAmount?: unknown;
                                                  };
                                              }
                                          )._sum?.totalAmount,
                                      ),
                                  0,
                              ),
                      })
                    : hiddenSection<{
                          pipelineAmount: number;
                          openQuotationAmount: number;
                      }>();
                return {
                    total: activeCount,
                    returned: items.length,
                    items,
                    activeCount,
                    openQuotationCount,
                    nominal,
                };
            });
        },
        readActiveCustomers(scope, temporal) {
            return withRepeatableRead(db, (tx) =>
                tx.customer.findMany({
                    where: activeCustomerWhere(
                        scope,
                        temporal.routeStorageDate,
                    ),
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        city: true,
                    },
                    orderBy: [{ name: 'asc' }, { id: 'asc' }],
                }),
            );
        },
        readReceivables(scope, temporal, canViewPrices) {
            return withRepeatableRead(db, async (tx) => {
                const where = fieldSalesReceivableWhere(scope);
                const [total, overdueCount] = await Promise.all([
                    tx.invoice.count({ where }),
                    tx.invoice.count({
                        where: { AND: [where, { status: 'OVERDUE' }] },
                    }),
                ]);
                if (!canViewPrices) {
                    return {
                        total,
                        overdueCount,
                        href: null,
                        nominal: hiddenSection<
                            Sample<FieldSalesReceivableItemDto> & {
                                totalOutstanding: number;
                            }
                        >(),
                    };
                }

                const [amounts, rows] = await Promise.all([
                    tx.invoice.aggregate({
                        where,
                        _sum: { remainingAmount: true },
                    }),
                    tx.invoice.findMany({
                        where,
                        select: {
                            id: true,
                            invoiceNumber: true,
                            status: true,
                            dueDate: true,
                            remainingAmount: true,
                            salesOrder: {
                                select: {
                                    orderNumber: true,
                                    customer: { select: { name: true } },
                                },
                            },
                        },
                        orderBy: [
                            {
                                dueDate: {
                                    sort: 'asc',
                                    nulls: 'last',
                                },
                            },
                            { id: 'asc' },
                        ],
                        take: RECEIVABLE_SAMPLE_LIMIT,
                    }),
                ]);
                const items = rows.map((row) => ({
                    id: row.id,
                    invoiceNumber: row.invoiceNumber,
                    orderNumber: row.salesOrder.orderNumber,
                    customerName: row.salesOrder.customer?.name ?? '-',
                    status: row.status,
                    dueDate: row.dueDate?.toISOString() ?? null,
                    remainingAmount: decimalNumber(row.remainingAmount),
                }));
                return {
                    total,
                    overdueCount,
                    href: '/field/sales/receivables' as const,
                    nominal: availableSection({
                        total,
                        returned: items.length,
                        items,
                        totalOutstanding: decimalNumber(
                            amounts._sum.remainingAmount,
                        ),
                    }),
                };
            });
        },
    };
}

function wibHour(now: Date): number {
    const hour = new Intl.DateTimeFormat('en-US', {
        timeZone: BUSINESS_TIMEZONE,
        hour: '2-digit',
        hourCycle: 'h23',
    })
        .formatToParts(now)
        .find((part) => part.type === 'hour')?.value;
    return Number(hour ?? 0);
}

function greeting(now: Date): string {
    const hour = wibHour(now);
    return hour < 12
        ? 'Selamat pagi'
        : hour < 17
          ? 'Selamat siang'
          : 'Selamat sore';
}

function displayDate(now: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: BUSINESS_TIMEZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(now);
}

function sectionFromOutcome<T>(
    outcome: PromiseSettledResult<T>,
): MobileSection<T> {
    return outcome.status === 'fulfilled'
        ? availableSection(outcome.value)
        : unavailableSection<T>();
}

export async function readFieldSalesMobileOverview(input: {
    actor: Parameters<typeof getFieldSalesScope>[0];
    canViewPrices: boolean;
    now?: Date;
    reader?: FieldSalesMobileReader;
}): Promise<FieldSalesMobileOverviewDto> {
    const now = input.now ?? new Date();
    const businessDate = toBusinessDateString(now);
    const { startOfDay, endOfDay } = getWibDayBounds(businessDate);
    const temporal: TemporalContext = {
        now,
        businessDate,
        routeStorageDate: routeStorageDateForBusinessDate(businessDate),
        startOfDay,
        endOfDay,
    };
    const scope = getFieldSalesScope(input.actor);
    if (!input.canViewPrices) {
        recordDashboardSectionState({
            route: 'field-sales-mobile',
            section: 'pipeline-nominal',
            state: 'HIDDEN',
            generatedAt: now,
        });
        recordDashboardSectionState({
            route: 'field-sales-mobile',
            section: 'receivables-nominal',
            state: 'HIDDEN',
            generatedAt: now,
        });
    }
    const reader =
        input.reader ??
        (() => {
            const tenantDb = getTenantDbFromContext();
            if (!tenantDb) {
                throw new BusinessRuleError(
                    'Konteks tenant untuk ringkasan sales lapangan tidak tersedia.',
                );
            }
            return createFieldSalesMobileReader(tenantDb);
        })();

    const [route, followUps, compliance, pipeline, customers, receivables] =
        await Promise.allSettled([
            observeDashboardSection({
                route: 'field-sales-mobile',
                section: 'route-today',
                generatedAt: now,
                read: () => reader.readRoute(scope, temporal),
            }),
            observeDashboardSection({
                route: 'field-sales-mobile',
                section: 'follow-ups',
                generatedAt: now,
                read: () => reader.readFollowUps(scope, temporal),
            }),
            observeDashboardSection({
                route: 'field-sales-mobile',
                section: 'compliance',
                generatedAt: now,
                read: () => reader.readCompliance(scope, temporal),
            }),
            observeDashboardSection({
                route: 'field-sales-mobile',
                section: 'pipeline',
                generatedAt: now,
                read: () => reader.readPipeline(scope, input.canViewPrices),
            }),
            observeDashboardSection({
                route: 'field-sales-mobile',
                section: 'active-customers',
                generatedAt: now,
                read: () => reader.readActiveCustomers(scope, temporal),
            }),
            observeDashboardSection({
                route: 'field-sales-mobile',
                section: 'receivables',
                generatedAt: now,
                read: () =>
                    reader.readReceivables(
                        scope,
                        temporal,
                        input.canViewPrices,
                    ),
            }),
        ]);

    return {
        generatedAt: now.toISOString(),
        businessDate,
        greeting: greeting(now),
        displayDate: displayDate(now),
        sections: {
            route: sectionFromOutcome(route),
            followUps: sectionFromOutcome(followUps),
            compliance: sectionFromOutcome(compliance),
            pipeline: sectionFromOutcome(pipeline),
            activeCustomers: sectionFromOutcome(customers),
            receivables: sectionFromOutcome(receivables),
        },
    };
}
