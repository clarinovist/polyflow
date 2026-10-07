import { Prisma } from '@prisma/client';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError } from '@/lib/errors/errors';
import {
    calculateSalesOrderRevenueWithReturns,
    isProcessedReturnStatus,
} from '@/lib/sales/revenue-basis';
import { calculateComplianceRate } from '@/lib/sales/route-compliance';
import {
    getWibDayBounds,
    getWibMonthBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';

export const MARKETING_MOBILE_SAMPLE_LIMIT = 10;

type Sample<T> = {
    total: number;
    returned: number;
    items: T[];
};

type TargetProgress = {
    target: number | null;
    actual: number;
    gap: number | null;
    achievementPercent: number | null;
};

type RevenueProgress = {
    targetAmount: number;
    actualAmount: number;
    gapAmount: number;
    achievementPercent: number | null;
};

export type MarketingTeamMemberDto = {
    id: string;
    name: string;
    orders: TargetProgress;
    visits: TargetProgress;
    revenue?: RevenueProgress;
};

export type MarketingComplianceDto = {
    id: string;
    salesName: string;
    assigned: number;
    visited: number;
    extraCalls: number;
    compliancePercent: number;
};

export type MarketingPipelineExceptionDto = {
    id: string;
    orderNumber: string;
    customerName: string;
    salesName: string;
    reason: 'COMMERCIAL_REVIEW' | 'FOLLOW_UP_DUE' | 'VALIDITY_EXPIRED';
    dueAt: string | null;
    amount?: number;
};

export type MarketingReviewDto = {
    id: string;
    kind: 'PROSPECT' | 'VISIT';
    title: string;
    salesName: string;
    queuedAt: string;
};

export type MarketingFollowUpDto = {
    id: string;
    customerName: string;
    city: string | null;
    salesName: string;
    inactiveSince: string;
};

export type MarketingTaskDto = {
    id: string;
    kind: 'PIPELINE' | 'PROSPECT_REVIEW' | 'VISIT_REVIEW' | 'NO_FOLLOW_UP';
    title: string;
    subtitle: string;
    priority: 'NORMAL' | 'HIGH' | 'URGENT';
    occurredAt: string;
};

export type MarketingMobileOverviewDto = {
    generatedAt: string;
    businessDate: string;
    period: { year: number; month: number };
    highlights: {
        teamMemberCount: number;
        pipelineExceptionCount: number;
        pendingReviewCount: number;
        customersWithoutFollowUpCount: number;
        overdueReceivableCount: number;
        overdueReceivableAmount?: number;
    };
    teamTarget: {
        orders: TargetProgress;
        visits: TargetProgress;
        revenue?: RevenueProgress;
    };
    team: Sample<MarketingTeamMemberDto>;
    compliance: Sample<MarketingComplianceDto>;
    pipelineExceptions: Sample<MarketingPipelineExceptionDto>;
    reviews: Sample<MarketingReviewDto>;
    customersWithoutFollowUp: Sample<MarketingFollowUpDto>;
    tasks: Sample<MarketingTaskDto>;
};

function percentage(actual: number, target: number | null): number | null {
    if (target == null || target === 0) return null;
    return Math.round((actual / target) * 10_000) / 100;
}

function progress(actual: number, target: number | null): TargetProgress {
    return {
        target,
        actual,
        gap: target == null ? null : Math.max(0, target - actual),
        achievementPercent: percentage(actual, target),
    };
}

function decimalNumber(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && 'toNumber' in value) {
        return (value as { toNumber: () => number }).toNumber();
    }
    return Number(value);
}

function firstReason(
    row: {
        commercialReviewStatus: string;
        nextFollowUpDate: Date | null;
        validUntil: Date | null;
    },
    now: Date,
): MarketingPipelineExceptionDto['reason'] {
    if (row.commercialReviewStatus === 'PENDING') return 'COMMERCIAL_REVIEW';
    if (row.validUntil && row.validUntil < now) return 'VALIDITY_EXPIRED';
    return 'FOLLOW_UP_DUE';
}

function sample<T>(items: T[], total = items.length): Sample<T> {
    const limited = items.slice(0, MARKETING_MOBILE_SAMPLE_LIMIT);
    return { total, returned: limited.length, items: limited };
}

/**
 * Tenant-scoped, read-only supervisor snapshot. The action must establish the
 * tenant context and both the mobile portal and sales-manager guards first.
 */
export async function readMarketingMobileOverview(input: {
    canViewPrices: boolean;
    now?: Date;
}): Promise<MarketingMobileOverviewDto> {
    const tenantDb = getTenantDbFromContext();
    if (!tenantDb) {
        throw new BusinessRuleError(
            'Konteks tenant untuk ringkasan marketing tidak tersedia.',
        );
    }

    const now = input.now ?? new Date();
    const businessDate = toBusinessDateString(now);
    const { startOfDay, endOfDay } = getWibDayBounds(businessDate);
    const [year, month] = businessDate.split('-').map(Number);
    const { start: monthStart, end: monthEnd } = getWibMonthBounds(year, month);

    return tenantDb.$transaction(
        async (tx) => {
            const teamRows = await tx.user.findMany({
                where: {
                    isActive: true,
                    isSuperAdmin: false,
                    OR: [
                        { role: 'SALES' },
                        { roles: { some: { role: 'SALES' } } },
                    ],
                },
                select: { id: true, name: true },
                orderBy: [{ name: 'asc' }, { id: 'asc' }],
            });
            const teamIds = teamRows.map((member) => member.id);

            if (teamIds.length === 0) {
                return {
                    generatedAt: now.toISOString(),
                    businessDate,
                    period: { year, month },
                    highlights: {
                        teamMemberCount: 0,
                        pipelineExceptionCount: 0,
                        pendingReviewCount: 0,
                        customersWithoutFollowUpCount: 0,
                        overdueReceivableCount: 0,
                        ...(input.canViewPrices
                            ? { overdueReceivableAmount: 0 }
                            : {}),
                    },
                    teamTarget: {
                        orders: progress(0, null),
                        visits: progress(0, null),
                        ...(input.canViewPrices
                            ? {
                                  revenue: {
                                      targetAmount: 0,
                                      actualAmount: 0,
                                      gapAmount: 0,
                                      achievementPercent: null,
                                  },
                              }
                            : {}),
                    },
                    team: sample([]),
                    compliance: sample([]),
                    pipelineExceptions: sample([]),
                    reviews: sample([]),
                    customersWithoutFollowUp: sample([]),
                    tasks: sample([]),
                } satisfies MarketingMobileOverviewDto;
            }

            const pipelineWhere: Prisma.SalesOrderWhereInput = {
                salesRepId: { in: teamIds },
                customerId: { not: null },
                status: { in: ['QUOTATION', 'QUOTATION_SENT'] },
                OR: [
                    { commercialReviewStatus: 'PENDING' },
                    { nextFollowUpDate: { lte: endOfDay } },
                    { validUntil: { lt: startOfDay } },
                ],
            };
            const prospectWhere: Prisma.CustomerWhereInput = {
                lifecycleStatus: 'PROSPECT',
                OR: [
                    { createdById: { in: teamIds } },
                    {
                        salesAssignments: {
                            some: {
                                userId: { in: teamIds },
                                unassignedAt: null,
                            },
                        },
                    },
                ],
            };
            const pendingVisitWhere: Prisma.SalesVisitWhereInput = {
                userId: { in: teamIds },
                reviewStatus: 'PENDING',
            };
            const noFollowUpWhere: Prisma.CustomerWhereInput = {
                isActive: true,
                lifecycleStatus: { in: ['ACTIVE', 'PROSPECT'] },
                salesAssignments: {
                    some: { userId: { in: teamIds }, unassignedAt: null },
                },
                AND: [
                    {
                        salesOrders: {
                            none: {
                                status: {
                                    in: ['QUOTATION', 'QUOTATION_SENT'],
                                },
                                nextFollowUpDate: { gte: startOfDay },
                            },
                        },
                    },
                    {
                        salesVisits: {
                            none: { checkInTime: { gte: monthStart } },
                        },
                    },
                    {
                        salesOrders: {
                            none: { orderDate: { gte: monthStart } },
                        },
                    },
                ],
            };
            const overdueWhere: Prisma.InvoiceWhereInput = {
                status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                remainingAmount: { gt: 0 },
                dueDate: { lt: startOfDay },
                salesOrder: {
                    salesRepId: { in: teamIds },
                    customerId: { not: null },
                },
            };

            const [
                targets,
                orderCounts,
                visitCounts,
                dailyVisitCounts,
                extraVisitCounts,
                routePlans,
                pipelineTotal,
                rawPipeline,
                prospectTotal,
                rawProspects,
                visitReviewTotal,
                rawVisitReviews,
                noFollowUpTotal,
                rawNoFollowUps,
                overdueReceivableCount,
                revenueOrders,
                revenueReturns,
                overdueAmounts,
            ] = await Promise.all([
                tx.salesTarget.findMany({
                    where: {
                        userId: { in: teamIds },
                        periodYear: year,
                        periodMonth: month,
                    },
                    select: {
                        userId: true,
                        visitTarget: true,
                        orderTarget: true,
                        ...(input.canViewPrices ? { revenueTarget: true } : {}),
                    },
                }),
                tx.salesOrder.groupBy({
                    by: ['salesRepId'],
                    where: {
                        salesRepId: { in: teamIds },
                        orderDate: { gte: monthStart, lte: monthEnd },
                        status: { not: 'CANCELLED' },
                    },
                    _count: { id: true },
                }),
                tx.salesVisit.groupBy({
                    by: ['userId'],
                    where: {
                        userId: { in: teamIds },
                        checkInTime: { gte: monthStart, lte: monthEnd },
                        reviewStatus: { not: 'REJECTED' },
                    },
                    _count: { id: true },
                }),
                tx.salesVisit.groupBy({
                    by: ['userId'],
                    where: {
                        userId: { in: teamIds },
                        checkInTime: { gte: startOfDay, lte: endOfDay },
                        reviewStatus: { not: 'REJECTED' },
                    },
                    _count: { id: true },
                }),
                tx.salesVisit.groupBy({
                    by: ['userId'],
                    where: {
                        userId: { in: teamIds },
                        checkInTime: { gte: startOfDay, lte: endOfDay },
                        reviewStatus: { not: 'REJECTED' },
                        isExtraCall: true,
                    },
                    _count: { id: true },
                }),
                tx.salesRoutePlan.findMany({
                    where: {
                        userId: { in: teamIds },
                        date: { gte: startOfDay, lte: endOfDay },
                    },
                    select: {
                        userId: true,
                        items: { select: { status: true } },
                    },
                }),
                tx.salesOrder.count({ where: pipelineWhere }),
                tx.salesOrder.findMany({
                    where: pipelineWhere,
                    select: {
                        id: true,
                        orderNumber: true,
                        commercialReviewStatus: true,
                        nextFollowUpDate: true,
                        validUntil: true,
                        customer: { select: { name: true } },
                        salesRep: { select: { name: true } },
                        ...(input.canViewPrices ? { totalAmount: true } : {}),
                    },
                    orderBy: [
                        { nextFollowUpDate: 'asc' },
                        { validUntil: 'asc' },
                        { id: 'asc' },
                    ],
                    take: MARKETING_MOBILE_SAMPLE_LIMIT,
                }),
                tx.customer.count({ where: prospectWhere }),
                tx.customer.findMany({
                    where: prospectWhere,
                    select: {
                        id: true,
                        name: true,
                        createdAt: true,
                        createdBy: { select: { name: true } },
                        salesAssignments: {
                            where: {
                                userId: { in: teamIds },
                                unassignedAt: null,
                            },
                            select: { user: { select: { name: true } } },
                            orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
                            take: 1,
                        },
                    },
                    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                    take: MARKETING_MOBILE_SAMPLE_LIMIT,
                }),
                tx.salesVisit.count({ where: pendingVisitWhere }),
                tx.salesVisit.findMany({
                    where: pendingVisitWhere,
                    select: {
                        id: true,
                        checkInTime: true,
                        customer: { select: { name: true } },
                        user: { select: { name: true } },
                    },
                    orderBy: [{ checkInTime: 'asc' }, { id: 'asc' }],
                    take: MARKETING_MOBILE_SAMPLE_LIMIT,
                }),
                tx.customer.count({ where: noFollowUpWhere }),
                tx.customer.findMany({
                    where: noFollowUpWhere,
                    select: {
                        id: true,
                        name: true,
                        city: true,
                        updatedAt: true,
                        salesAssignments: {
                            where: {
                                userId: { in: teamIds },
                                unassignedAt: null,
                            },
                            select: { user: { select: { name: true } } },
                            orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
                            take: 1,
                        },
                    },
                    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
                    take: MARKETING_MOBILE_SAMPLE_LIMIT,
                }),
                tx.invoice.count({ where: overdueWhere }),
                input.canViewPrices
                    ? tx.salesOrder.findMany({
                          where: {
                              salesRepId: { in: teamIds },
                              orderDate: { gte: monthStart, lte: monthEnd },
                              status: { not: 'CANCELLED' },
                          },
                          select: {
                              id: true,
                              salesRepId: true,
                              totalAmount: true,
                              status: true,
                          },
                      })
                    : Promise.resolve([]),
                input.canViewPrices
                    ? tx.salesReturn.findMany({
                          where: {
                              returnDate: { gte: monthStart, lte: monthEnd },
                              status: { notIn: ['DRAFT', 'CANCELLED'] },
                              salesOrder: { salesRepId: { in: teamIds } },
                          },
                          select: {
                              id: true,
                              totalAmount: true,
                              status: true,
                              salesOrder: { select: { salesRepId: true } },
                          },
                      })
                    : Promise.resolve([]),
                input.canViewPrices
                    ? tx.invoice.aggregate({
                          where: overdueWhere,
                          _sum: {
                              totalAmount: true,
                              paidAmount: true,
                              creditedAmount: true,
                              priceAdjustmentAmount: true,
                          },
                      })
                    : Promise.resolve(null),
            ]);

            const targetByUser = new Map(
                targets.map((row) => [row.userId, row]),
            );
            const ordersByUser = new Map(
                orderCounts.flatMap((row) =>
                    row.salesRepId
                        ? [[row.salesRepId, row._count.id] as const]
                        : [],
                ),
            );
            const visitsByUser = new Map(
                visitCounts.map((row) => [row.userId, row._count.id]),
            );
            const dailyVisitsByUser = new Map(
                dailyVisitCounts.map((row) => [row.userId, row._count.id]),
            );
            const extraByUser = new Map(
                extraVisitCounts.map((row) => [row.userId, row._count.id]),
            );
            const assignedByUser = new Map<string, number>();
            for (const plan of routePlans) {
                assignedByUser.set(
                    plan.userId,
                    (assignedByUser.get(plan.userId) ?? 0) + plan.items.length,
                );
            }

            const revenue = input.canViewPrices
                ? calculateSalesOrderRevenueWithReturns(
                      revenueOrders.map((order) => ({
                          id: order.id,
                          salesRepId: order.salesRepId,
                          totalAmount: order.totalAmount,
                          status: order.status,
                      })),
                      revenueReturns
                          .filter((row) => isProcessedReturnStatus(row.status))
                          .map((row) => ({
                              id: row.id,
                              salesRepId: row.salesOrder.salesRepId,
                              totalAmount: row.totalAmount,
                              status: row.status,
                          })),
                  )
                : null;

            const teamItems: MarketingTeamMemberDto[] = teamRows.map(
                (member) => {
                    const target = targetByUser.get(member.id);
                    const orderActual = ordersByUser.get(member.id) ?? 0;
                    const visitActual = visitsByUser.get(member.id) ?? 0;
                    const revenueTarget = input.canViewPrices
                        ? decimalNumber(
                              (
                                  target as
                                      | { revenueTarget?: unknown }
                                      | undefined
                              )?.revenueTarget,
                          )
                        : 0;
                    const revenueActual = input.canViewPrices
                        ? decimalNumber(revenue?.attributed.get(member.id))
                        : 0;
                    return {
                        id: member.id,
                        name: member.name ?? 'Sales tanpa nama',
                        orders: progress(
                            orderActual,
                            target?.orderTarget ?? null,
                        ),
                        visits: progress(
                            visitActual,
                            target?.visitTarget ?? null,
                        ),
                        ...(input.canViewPrices
                            ? {
                                  revenue: {
                                      targetAmount: revenueTarget,
                                      actualAmount: revenueActual,
                                      gapAmount: Math.max(
                                          0,
                                          revenueTarget - revenueActual,
                                      ),
                                      achievementPercent: percentage(
                                          revenueActual,
                                          revenueTarget,
                                      ),
                                  },
                              }
                            : {}),
                    };
                },
            );
            teamItems.sort(
                (a, b) =>
                    a.name.localeCompare(b.name, 'id') ||
                    a.id.localeCompare(b.id),
            );

            const complianceItems: MarketingComplianceDto[] = teamRows.map(
                (member) => {
                    const assigned = assignedByUser.get(member.id) ?? 0;
                    const visited = dailyVisitsByUser.get(member.id) ?? 0;
                    const extraCalls = extraByUser.get(member.id) ?? 0;
                    return {
                        id: member.id,
                        salesName: member.name ?? 'Sales tanpa nama',
                        assigned,
                        visited,
                        extraCalls,
                        compliancePercent: calculateComplianceRate({
                            assigned,
                            visited,
                            extraCalls,
                        }),
                    };
                },
            );
            complianceItems.sort(
                (a, b) =>
                    a.salesName.localeCompare(b.salesName, 'id') ||
                    a.id.localeCompare(b.id),
            );

            const pipelineItems: MarketingPipelineExceptionDto[] =
                rawPipeline.map((row) => {
                    const reason = firstReason(row, now);
                    const dueDate =
                        reason === 'VALIDITY_EXPIRED'
                            ? row.validUntil
                            : (row.nextFollowUpDate ?? row.validUntil);
                    return {
                        id: row.id,
                        orderNumber: row.orderNumber,
                        customerName:
                            row.customer?.name ?? 'Customer tidak tersedia',
                        salesName: row.salesRep?.name ?? 'Belum ditugaskan',
                        reason,
                        dueAt: dueDate?.toISOString() ?? null,
                        ...(input.canViewPrices
                            ? {
                                  amount: decimalNumber(
                                      (row as { totalAmount?: unknown })
                                          .totalAmount,
                                  ),
                              }
                            : {}),
                    };
                });

            const prospectReviews: MarketingReviewDto[] = rawProspects.map(
                (row) => ({
                    id: row.id,
                    kind: 'PROSPECT',
                    title: row.name,
                    salesName:
                        row.salesAssignments[0]?.user.name ??
                        row.createdBy?.name ??
                        'Belum ditugaskan',
                    queuedAt: row.createdAt.toISOString(),
                }),
            );
            const visitReviews: MarketingReviewDto[] = rawVisitReviews.map(
                (row) => ({
                    id: row.id,
                    kind: 'VISIT',
                    title: row.customer.name,
                    salesName: row.user.name ?? 'Sales tanpa nama',
                    queuedAt: row.checkInTime.toISOString(),
                }),
            );
            const reviewItems = [...prospectReviews, ...visitReviews].sort(
                (a, b) =>
                    a.queuedAt.localeCompare(b.queuedAt) ||
                    a.kind.localeCompare(b.kind) ||
                    a.id.localeCompare(b.id),
            );

            const noFollowUpItems: MarketingFollowUpDto[] = rawNoFollowUps.map(
                (row) => ({
                    id: row.id,
                    customerName: row.name,
                    city: row.city,
                    salesName:
                        row.salesAssignments[0]?.user.name ??
                        'Belum ditugaskan',
                    inactiveSince: row.updatedAt.toISOString(),
                }),
            );

            const tasks: MarketingTaskDto[] = [
                ...pipelineItems.map((item) => ({
                    id: item.id,
                    kind: 'PIPELINE' as const,
                    title: item.orderNumber,
                    subtitle: `${item.customerName} · ${item.salesName}`,
                    priority:
                        item.reason === 'COMMERCIAL_REVIEW'
                            ? ('HIGH' as const)
                            : ('URGENT' as const),
                    occurredAt: item.dueAt ?? now.toISOString(),
                })),
                ...reviewItems.map((item) => ({
                    id: item.id,
                    kind:
                        item.kind === 'PROSPECT'
                            ? ('PROSPECT_REVIEW' as const)
                            : ('VISIT_REVIEW' as const),
                    title: item.title,
                    subtitle: item.salesName,
                    priority: 'HIGH' as const,
                    occurredAt: item.queuedAt,
                })),
                ...noFollowUpItems.map((item) => ({
                    id: item.id,
                    kind: 'NO_FOLLOW_UP' as const,
                    title: item.customerName,
                    subtitle: item.salesName,
                    priority: 'NORMAL' as const,
                    occurredAt: item.inactiveSince,
                })),
            ].sort(
                (a, b) =>
                    a.occurredAt.localeCompare(b.occurredAt) ||
                    a.kind.localeCompare(b.kind) ||
                    a.id.localeCompare(b.id),
            );

            const orderTargets = teamItems
                .map((member) => member.orders.target)
                .filter((target): target is number => target != null);
            const visitTargets = teamItems
                .map((member) => member.visits.target)
                .filter((target): target is number => target != null);
            const orderTarget =
                orderTargets.length > 0
                    ? orderTargets.reduce((sum, value) => sum + value, 0)
                    : null;
            const visitTarget =
                visitTargets.length > 0
                    ? visitTargets.reduce((sum, value) => sum + value, 0)
                    : null;
            const orderActual = teamItems.reduce(
                (sum, member) => sum + member.orders.actual,
                0,
            );
            const visitActual = teamItems.reduce(
                (sum, member) => sum + member.visits.actual,
                0,
            );
            const revenueTarget = teamItems.reduce(
                (sum, member) => sum + (member.revenue?.targetAmount ?? 0),
                0,
            );
            const revenueActual = teamItems.reduce(
                (sum, member) => sum + (member.revenue?.actualAmount ?? 0),
                0,
            );

            const overdueReceivableAmount = overdueAmounts
                ? decimalNumber(overdueAmounts._sum.totalAmount) +
                  decimalNumber(overdueAmounts._sum.priceAdjustmentAmount) -
                  decimalNumber(overdueAmounts._sum.paidAmount) -
                  decimalNumber(overdueAmounts._sum.creditedAmount)
                : undefined;

            return {
                generatedAt: now.toISOString(),
                businessDate,
                period: { year, month },
                highlights: {
                    teamMemberCount: teamRows.length,
                    pipelineExceptionCount: pipelineTotal,
                    pendingReviewCount: prospectTotal + visitReviewTotal,
                    customersWithoutFollowUpCount: noFollowUpTotal,
                    overdueReceivableCount,
                    ...(overdueReceivableAmount === undefined
                        ? {}
                        : { overdueReceivableAmount }),
                },
                teamTarget: {
                    orders: progress(orderActual, orderTarget),
                    visits: progress(visitActual, visitTarget),
                    ...(input.canViewPrices
                        ? {
                              revenue: {
                                  targetAmount: revenueTarget,
                                  actualAmount: revenueActual,
                                  gapAmount: Math.max(
                                      0,
                                      revenueTarget - revenueActual,
                                  ),
                                  achievementPercent: percentage(
                                      revenueActual,
                                      revenueTarget,
                                  ),
                              },
                          }
                        : {}),
                },
                team: sample(teamItems, teamRows.length),
                compliance: sample(complianceItems, teamRows.length),
                pipelineExceptions: sample(pipelineItems, pipelineTotal),
                reviews: sample(reviewItems, prospectTotal + visitReviewTotal),
                customersWithoutFollowUp: sample(
                    noFollowUpItems,
                    noFollowUpTotal,
                ),
                tasks: sample(
                    tasks,
                    pipelineTotal +
                        prospectTotal +
                        visitReviewTotal +
                        noFollowUpTotal,
                ),
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}
