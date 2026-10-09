import type { Prisma, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BusinessRuleError } from '@/lib/errors/errors';
import { prisma } from '@/lib/core/prisma';
import {
    businessDateToEntryDate,
    getWibDayBounds,
    getWibMonthBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';
import {
    calculateSalesOrderRevenueWithReturns,
    isProcessedReturnStatus,
} from '@/lib/sales/revenue-basis';
import {
    scopedCustomerWhere,
    scopedSalesOrderWhere,
    type FieldSalesActorScope,
} from '@/services/sales/field-scope';
import { getPipelineData } from '@/services/sales/pipeline-service';
import { getTopCustomerCreditRiskSnapshot } from '@/services/sales/credit-service';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';
import { positiveSalesReceivableWhere } from '@/services/finance/sales-receivable-query';
import { getInvoiceRemainingAmount } from '@/lib/finance/payment-terms';
import type { DateRange } from '@/types/analytics';

export type SalesDashboardScopeKind = 'COMPANY' | 'TEAM' | 'MY';

export type FreshSalesDashboardAccess = {
    user: {
        id: string;
        role: Role;
        roles: Role[];
    };
    resources: string[] | 'ALL';
    canViewNominal: boolean;
};

export type SalesDashboardScope = {
    kind: SalesDashboardScopeKind;
    label: string;
    actorUserId: string;
    fieldScope: FieldSalesActorScope;
};

export type SalesDashboardPeriod = {
    start: Date;
    end: Date;
    label: string;
};

export type SalesRevenueOrders = {
    orderActual: number;
    revenueActual: number | null;
    revenueTrend: Array<{ month: string; revenue: number }>;
};

export type SalesPipelineDashboard = {
    activeCount: number;
    activeValue: number | null;
    topLostReason: {
        reason: string | null;
        label: string;
        count: number;
        totalValue: number | null;
    } | null;
};

export type SalesDashboardSample<T> = {
    total: number;
    returned: number;
    items: T[];
};

export type SalesAttentionAccess = {
    orders: boolean;
    deliveries: boolean;
    deliverySchedules: boolean;
    invoices: boolean;
    customers: boolean;
};

export type SalesAttentionData = {
    state: 'AVAILABLE' | 'UNAVAILABLE';
    counts: {
        draftOrders: number | null;
        readyToShipOrders: number | null;
        readyWithoutDo: number | null;
        openDeliveryOrders: number | null;
        tripsToday: number | null;
        overdueInvoices: number | null;
        overdueAmount: number | null;
        activeOrders: number | null;
        activeCustomers: number | null;
    };
    oldDrafts: SalesDashboardSample<{
        id: string;
        orderNumber: string;
        customerName: string;
        daysOld: number;
    }> | null;
    readyWithoutDo: SalesDashboardSample<{
        id: string;
        orderNumber: string;
        customerName: string;
    }> | null;
    openDeliveries: SalesDashboardSample<{
        id: string;
        deliveryNumber: string;
        status: string;
        customerName?: string;
    }> | null;
    overdueInvoices: SalesDashboardSample<{
        id: string;
        invoiceNumber: string;
        customerName: string;
        remaining?: number;
        dueDate: string;
        salesOrderId: string | null;
    }> | null;
    creditRisk: SalesDashboardSample<{
        id: string;
        name: string;
        exposureStatus: 'near' | 'over';
        headroom?: number;
    }> | null;
    followUpsDue: SalesDashboardSample<{
        id: string;
        orderNumber: string;
        customerName: string;
        nextFollowUpDate: string;
        isOverdue: boolean;
    }> | null;
};

const ZERO = new Decimal(0);
const SAMPLE_LIMIT = 5;

function validDate(value: Date | undefined): value is Date {
    return value instanceof Date && Number.isFinite(value.getTime());
}

function periodLabel(start: Date, end: Date): string {
    const formatter = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
    return formatter.format(start) + ' – ' + formatter.format(end);
}

export function resolveSalesDashboardPeriod(
    dateRange?: DateRange,
    now: Date = new Date(),
): SalesDashboardPeriod {
    if (
        validDate(dateRange?.from) &&
        validDate(dateRange?.to) &&
        dateRange.from.getTime() <= dateRange.to.getTime()
    ) {
        const start = getWibDayBounds(
            toBusinessDateString(dateRange.from),
        ).startOfDay;
        const end = getWibDayBounds(
            toBusinessDateString(dateRange.to),
        ).endOfDay;
        return { start, end, label: periodLabel(start, end) };
    }

    const businessDate = toBusinessDateString(now);
    const [year, month] = businessDate.split('-').map(Number);
    const start = getWibMonthBounds(year, month).start;
    const end = getWibDayBounds(businessDate).endOfDay;
    return { start, end, label: periodLabel(start, end) };
}

export async function resolveFreshSalesDashboardAccess(
    userId: string,
): Promise<FreshSalesDashboardAccess> {
    const current = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            role: true,
            isActive: true,
            roles: { select: { role: true } },
        },
    });
    if (!current?.isActive) {
        throw new BusinessRuleError(
            'Unauthorized: akun Sales tidak aktif atau tidak tersedia.',
        );
    }

    const roles = [
        ...new Set([current.role, ...current.roles.map((entry) => entry.role)]),
    ];
    const hasSalesRole = roles.some((role) =>
        ['ADMIN', 'SALES', 'MARKETING'].includes(role),
    );
    if (!hasSalesRole) {
        throw new BusinessRuleError(
            'Unauthorized: Akses dashboard Sales hanya untuk admin, sales, atau marketing.',
        );
    }

    if (roles.includes('ADMIN')) {
        return {
            user: { id: current.id, role: current.role, roles },
            resources: 'ALL',
            canViewNominal: true,
        };
    }

    const grants = await prisma.rolePermission.findMany({
        where: { role: { in: roles }, canAccess: true },
        select: { resource: true },
    });
    const resources = [...new Set(grants.map((grant) => grant.resource))];
    return {
        user: { id: current.id, role: current.role, roles },
        resources,
        canViewNominal: resources.includes('feature:view-prices'),
    };
}

export async function resolveSalesDashboardScope(user: {
    id: string;
    role?: string | null;
    roles?: (string | null)[] | null;
}): Promise<SalesDashboardScope> {
    const roles = new Set(
        [user.role, ...(user.roles ?? [])]
            .filter((role): role is string => Boolean(role))
            .map((role) => role.toUpperCase()),
    );

    if (roles.has('ADMIN')) {
        return {
            kind: 'COMPANY',
            label: 'Seluruh perusahaan',
            actorUserId: user.id,
            fieldScope: { actorUserId: user.id, isGlobalViewer: true },
        };
    }

    if (roles.has('MARKETING')) {
        const team = await prisma.user.findMany({
            where: {
                isActive: true,
                isSuperAdmin: false,
                OR: [{ role: 'SALES' }, { roles: { some: { role: 'SALES' } } }],
            },
            select: { id: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });
        return {
            kind: 'TEAM',
            label: 'Tim sales aktif',
            actorUserId: user.id,
            fieldScope: {
                actorUserId: user.id,
                isGlobalViewer: false,
                salesRepIds: team.map((member) => member.id),
            },
        };
    }

    return {
        kind: 'MY',
        label: 'Portofolio saya',
        actorUserId: user.id,
        fieldScope: { actorUserId: user.id, isGlobalViewer: false },
    };
}

function withOrderScope(
    scope: SalesDashboardScope,
    where: Prisma.SalesOrderWhereInput,
): Prisma.SalesOrderWhereInput {
    const scoped = scopedSalesOrderWhere(scope.fieldScope);
    return Object.keys(scoped).length > 0 ? { AND: [scoped, where] } : where;
}

function withCustomerScope(
    scope: SalesDashboardScope,
    where: Prisma.CustomerWhereInput,
): Prisma.CustomerWhereInput {
    const scoped = scopedCustomerWhere(scope.fieldScope);
    return Object.keys(scoped).length > 0 ? { AND: [scoped, where] } : where;
}

function visitScope(scope: SalesDashboardScope): Prisma.SalesVisitWhereInput {
    if (scope.kind === 'COMPANY') return {};
    if (scope.kind === 'TEAM') {
        return { userId: { in: scope.fieldScope.salesRepIds ?? [] } };
    }
    return { userId: scope.actorUserId };
}

function addMonths(year: number, month: number, delta: number) {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function completedTrendMonths(period: SalesDashboardPeriod) {
    const [endYear, endMonth] = toBusinessDateString(period.end)
        .slice(0, 7)
        .split('-')
        .map(Number);
    return Array.from({ length: 6 }, (_, index) => {
        const value = addMonths(endYear, endMonth, index - 6);
        return {
            ...value,
            key: value.year + '-' + String(value.month).padStart(2, '0'),
        };
    });
}

function sumRevenue(result: {
    attributed: Map<string, Decimal>;
    unattributed: Decimal;
}) {
    return [...result.attributed.values()]
        .reduce((sum, value) => sum.add(value), result.unattributed)
        .toNumber();
}

export async function readSalesRevenueAndOrders(
    scope: SalesDashboardScope,
    period: SalesDashboardPeriod,
    includeNominal: boolean,
): Promise<SalesRevenueOrders> {
    const periodOrderWhere = withOrderScope(scope, {
        orderDate: { gte: period.start, lte: period.end },
        status: { not: 'CANCELLED' },
    });

    if (!includeNominal) {
        return {
            orderActual: await prisma.salesOrder.count({
                where: periodOrderWhere,
            }),
            revenueActual: null,
            revenueTrend: [],
        };
    }

    const trendMonths = completedTrendMonths(period);
    // completedTrendMonths always creates six points; keep this explicit without
    // introducing a user-facing failure branch that cannot occur.
    const firstTrendMonth = trendMonths[0]!;
    const lastTrendMonth = trendMonths[trendMonths.length - 1]!;
    const trendStart = getWibMonthBounds(
        firstTrendMonth.year,
        firstTrendMonth.month,
    ).start;
    const trendEnd = getWibMonthBounds(
        lastTrendMonth.year,
        lastTrendMonth.month,
    ).end;
    const queryStart =
        trendStart.getTime() < period.start.getTime()
            ? trendStart
            : period.start;
    const queryEnd =
        trendEnd.getTime() > period.end.getTime() ? trendEnd : period.end;

    const [orders, returns] = await Promise.all([
        prisma.salesOrder.findMany({
            where: withOrderScope(scope, {
                orderDate: { gte: queryStart, lte: queryEnd },
                status: { not: 'CANCELLED' },
            }),
            select: {
                id: true,
                salesRepId: true,
                totalAmount: true,
                status: true,
                orderDate: true,
            },
            orderBy: [{ orderDate: 'asc' }, { id: 'asc' }],
        }),
        prisma.salesReturn.findMany({
            where: {
                returnDate: { gte: queryStart, lte: queryEnd },
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                salesOrder: scopedSalesOrderWhere(scope.fieldScope),
            },
            select: {
                id: true,
                totalAmount: true,
                status: true,
                returnDate: true,
                salesOrder: { select: { salesRepId: true } },
            },
            orderBy: [{ returnDate: 'asc' }, { id: 'asc' }],
        }),
    ]);

    const revenueForRange = (start: Date, end: Date) => {
        const selectedOrders = orders
            .filter(
                (order) => order.orderDate >= start && order.orderDate <= end,
            )
            .map((order) => ({
                id: order.id,
                salesRepId: order.salesRepId,
                totalAmount: order.totalAmount,
                status: order.status,
            }));
        const selectedReturns = returns
            .filter(
                (returned) =>
                    returned.returnDate >= start &&
                    returned.returnDate <= end &&
                    isProcessedReturnStatus(returned.status),
            )
            .map((returned) => ({
                id: returned.id,
                salesRepId: returned.salesOrder.salesRepId,
                totalAmount: returned.totalAmount ?? ZERO,
                status: returned.status,
            }));
        return sumRevenue(
            calculateSalesOrderRevenueWithReturns(
                selectedOrders,
                selectedReturns,
            ),
        );
    };

    const orderActual = orders.filter(
        (order) =>
            order.orderDate >= period.start && order.orderDate <= period.end,
    ).length;
    const revenueActual = revenueForRange(period.start, period.end);
    const lastTrendIndex = trendMonths.length - 1;
    const revenueTrend = trendMonths.map((month, index) => {
        const bounds = getWibMonthBounds(month.year, month.month);
        const end =
            index === lastTrendIndex && period.end < bounds.end
                ? period.end
                : bounds.end;
        return {
            month: month.key,
            revenue: revenueForRange(bounds.start, end),
        };
    });

    return { orderActual, revenueActual, revenueTrend };
}

export async function readSalesVisitActual(
    scope: SalesDashboardScope,
    period: SalesDashboardPeriod,
): Promise<number> {
    return prisma.salesVisit.count({
        where: {
            ...visitScope(scope),
            checkInTime: { gte: period.start, lte: period.end },
            reviewStatus: { not: 'REJECTED' },
        },
    });
}

export async function readSalesPipelineDashboard(
    scope: SalesDashboardScope,
    period: SalesDashboardPeriod,
    includeNominal: boolean,
): Promise<SalesPipelineDashboard> {
    const data = await getPipelineData(
        scope.fieldScope,
        period.start,
        period.end,
    );
    const activeStages = [
        data.stagesByKey.QUOTATION,
        data.stagesByKey.QUOTATION_SENT,
    ];
    const activeCount = activeStages.reduce(
        (sum, stage) => sum + stage.count,
        0,
    );
    const activeValue = includeNominal
        ? activeStages
              .reduce((sum, stage) => sum.add(stage.totalValue), ZERO)
              .toNumber()
        : null;
    const lost = data.lostReasonBreakdown[0];

    return {
        activeCount,
        activeValue,
        topLostReason: lost
            ? {
                  reason: lost.reason,
                  label: lost.label,
                  count: lost.count,
                  totalValue: includeNominal
                      ? lost.totalValue.toNumber()
                      : null,
              }
            : null,
    };
}

function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
    return result.status === 'fulfilled' ? result.value : null;
}

function sample<T>(total: number, items: T[]): SalesDashboardSample<T> {
    return { total, returned: items.length, items };
}

export async function readSalesAttention(
    scope: SalesDashboardScope,
    now: Date,
    includeNominal: boolean,
    access: SalesAttentionAccess = {
        orders: true,
        deliveries: true,
        deliverySchedules: true,
        invoices: true,
        customers: true,
    },
): Promise<SalesAttentionData> {
    const today = getWibDayBounds(toBusinessDateString(now));
    const orderScope = scopedSalesOrderWhere(scope.fieldScope);
    const operationalOrderWhere = withOrderScope(
        scope,
        buildOperationalSalesReceivableOrderWhere(),
    );
    const readyWithoutDoWhere = withOrderScope(scope, {
        status: 'READY_TO_SHIP',
        deliveryOrders: {
            none: { status: { in: ['PENDING', 'LOADING'] } },
        },
    });
    const openDeliveryWhere: Prisma.DeliveryOrderWhereInput = {
        status: { in: ['PENDING', 'LOADING'] },
        ...(Object.keys(orderScope).length > 0
            ? { salesOrder: orderScope }
            : {}),
    };
    const overdueWhere: Prisma.InvoiceWhereInput = {
        AND: [positiveSalesReceivableWhere()],
        dueDate: { lt: today.startOfDay },
        salesOrder: operationalOrderWhere,
    };
    const followUpWhere = withOrderScope(scope, {
        status: { in: ['QUOTATION', 'QUOTATION_SENT'] },
        nextFollowUpDate: { not: null, lte: today.endOfDay },
    });
    const oldDraftWhere = withOrderScope(scope, { status: 'DRAFT' });
    const readyWhere = withOrderScope(scope, { status: 'READY_TO_SHIP' });
    const activeWhere = withOrderScope(scope, {
        status: {
            in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED'],
        },
    });
    const tripWhere: Prisma.DeliveryScheduleVehicleWhereInput = {
        departureDate: businessDateToEntryDate(toBusinessDateString(now)),
        status: { not: 'CANCELLED' },
        ...(Object.keys(orderScope).length > 0
            ? { orders: { some: { salesOrder: orderScope } } }
            : {}),
    };

    const results = await Promise.allSettled([
        access.orders
            ? Promise.all([
                  prisma.salesOrder.count({ where: oldDraftWhere }),
                  prisma.salesOrder.findMany({
                      take: SAMPLE_LIMIT,
                      where: oldDraftWhere,
                      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                      select: {
                          id: true,
                          orderNumber: true,
                          createdAt: true,
                          customer: { select: { name: true } },
                      },
                  }),
              ])
            : Promise.resolve(null),
        access.orders
            ? Promise.all([
                  prisma.salesOrder.count({ where: readyWhere }),
                  prisma.salesOrder.count({ where: readyWithoutDoWhere }),
                  prisma.salesOrder.findMany({
                      take: SAMPLE_LIMIT,
                      where: readyWithoutDoWhere,
                      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                      select: {
                          id: true,
                          orderNumber: true,
                          customer: { select: { name: true } },
                      },
                  }),
              ])
            : Promise.resolve(null),
        access.deliveries
            ? Promise.all([
                  prisma.deliveryOrder.count({ where: openDeliveryWhere }),
                  prisma.deliveryOrder.findMany({
                      take: SAMPLE_LIMIT,
                      where: openDeliveryWhere,
                      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                      select: {
                          id: true,
                          orderNumber: true,
                          status: true,
                          salesOrder: {
                              select: { customer: { select: { name: true } } },
                          },
                      },
                  }),
              ])
            : Promise.resolve(null),
        access.invoices
            ? Promise.all([
                  prisma.invoice.count({ where: overdueWhere }),
                  includeNominal
                      ? prisma.invoice.aggregate({
                            where: overdueWhere,
                            _sum: { remainingAmount: true },
                        })
                      : Promise.resolve(null),
                  prisma.invoice.findMany({
                      take: SAMPLE_LIMIT,
                      where: overdueWhere,
                      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
                      select: {
                          id: true,
                          invoiceNumber: true,
                          totalAmount: true,
                          paidAmount: true,
                          creditedAmount: true,
                          priceAdjustmentAmount: true,
                          dueDate: true,
                          salesOrderId: true,
                          salesOrder: {
                              select: {
                                  id: true,
                                  customer: { select: { name: true } },
                              },
                          },
                      },
                  }),
              ])
            : Promise.resolve(null),
        access.customers
            ? getTopCustomerCreditRiskSnapshot(
                  SAMPLE_LIMIT,
                  withCustomerScope(scope, {
                      isActive: true,
                      creditLimit: { gt: 0 },
                  }),
              )
            : Promise.resolve(null),
        access.orders
            ? Promise.all([
                  prisma.salesOrder.count({ where: followUpWhere }),
                  prisma.salesOrder.findMany({
                      take: SAMPLE_LIMIT,
                      where: followUpWhere,
                      orderBy: [{ nextFollowUpDate: 'asc' }, { id: 'asc' }],
                      select: {
                          id: true,
                          orderNumber: true,
                          nextFollowUpDate: true,
                          customer: { select: { name: true } },
                      },
                  }),
              ])
            : Promise.resolve(null),
        access.deliverySchedules
            ? prisma.deliveryScheduleVehicle.count({ where: tripWhere })
            : Promise.resolve(null),
        access.orders || access.customers
            ? Promise.all([
                  access.orders
                      ? prisma.salesOrder.count({ where: activeWhere })
                      : Promise.resolve(null),
                  access.customers
                      ? prisma.customer.count({
                            where: withCustomerScope(scope, { isActive: true }),
                        })
                      : Promise.resolve(null),
              ])
            : Promise.resolve(null),
    ] as const);

    const oldDraft = fulfilled(results[0]);
    const ready = fulfilled(results[1]);
    const openDelivery = fulfilled(results[2]);
    const overdue = fulfilled(results[3]);
    const credit = fulfilled(results[4]);
    const followUp = fulfilled(results[5]);
    const tripsToday = fulfilled(results[6]);
    const snapshot = fulfilled(results[7]);

    return {
        state: results.every((result) => result.status === 'fulfilled')
            ? 'AVAILABLE'
            : 'UNAVAILABLE',
        counts: {
            draftOrders: oldDraft?.[0] ?? null,
            readyToShipOrders: ready?.[0] ?? null,
            readyWithoutDo: ready?.[1] ?? null,
            openDeliveryOrders: openDelivery?.[0] ?? null,
            tripsToday,
            overdueInvoices: overdue?.[0] ?? null,
            overdueAmount:
                includeNominal && overdue?.[1]
                    ? Number(overdue[1]._sum.remainingAmount ?? 0)
                    : null,
            activeOrders: snapshot?.[0] ?? null,
            activeCustomers: snapshot?.[1] ?? null,
        },
        oldDrafts: oldDraft
            ? sample(
                  oldDraft[0],
                  oldDraft[1].map((order) => ({
                      id: order.id,
                      orderNumber: order.orderNumber,
                      customerName: order.customer?.name ?? '-',
                      daysOld: Math.max(
                          0,
                          Math.floor(
                              (now.getTime() - order.createdAt.getTime()) /
                                  86_400_000,
                          ),
                      ),
                  })),
              )
            : null,
        readyWithoutDo: ready
            ? sample(
                  ready[1],
                  ready[2].map((order) => ({
                      id: order.id,
                      orderNumber: order.orderNumber,
                      customerName: order.customer?.name ?? '-',
                  })),
              )
            : null,
        openDeliveries: openDelivery
            ? sample(
                  openDelivery[0],
                  openDelivery[1].map((delivery) => ({
                      id: delivery.id,
                      deliveryNumber: delivery.orderNumber,
                      status: delivery.status,
                      customerName:
                          delivery.salesOrder?.customer?.name ?? undefined,
                  })),
              )
            : null,
        overdueInvoices: overdue
            ? sample(
                  overdue[0],
                  overdue[2].map((invoice) => ({
                      id: invoice.id,
                      invoiceNumber: invoice.invoiceNumber,
                      customerName: invoice.salesOrder?.customer?.name ?? '-',
                      ...(includeNominal
                          ? {
                                remaining: getInvoiceRemainingAmount(
                                    invoice.totalAmount,
                                    invoice.paidAmount,
                                    invoice.creditedAmount,
                                    invoice.priceAdjustmentAmount,
                                ),
                            }
                          : {}),
                      dueDate: invoice.dueDate?.toISOString() ?? '',
                      salesOrderId:
                          invoice.salesOrderId ??
                          invoice.salesOrder?.id ??
                          null,
                  })),
              )
            : null,
        creditRisk: credit
            ? sample(
                  credit.total,
                  credit.items.map((item) => ({
                      id: item.id,
                      name: item.name,
                      exposureStatus: item.exposureStatus,
                      ...(includeNominal ? { headroom: item.headroom } : {}),
                  })),
              )
            : null,
        followUpsDue: followUp
            ? sample(
                  followUp[0],
                  followUp[1].map((order) => ({
                      id: order.id,
                      orderNumber: order.orderNumber,
                      customerName: order.customer?.name ?? '-',
                      nextFollowUpDate:
                          order.nextFollowUpDate?.toISOString() ?? '',
                      isOverdue:
                          order.nextFollowUpDate != null &&
                          order.nextFollowUpDate < today.startOfDay,
                  })),
              )
            : null,
    };
}
