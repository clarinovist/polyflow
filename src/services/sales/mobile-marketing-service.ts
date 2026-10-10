import { Prisma, type PrismaClient } from '@prisma/client';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError } from '@/lib/errors/errors';
import { calculateComplianceRate } from '@/lib/sales/route-compliance';
import {
    availableSection,
    unavailableSection,
    type MobileSection,
} from '@/services/dashboard/mobile-section-state';
import {
    calculateSalesOrderRevenueWithReturns,
    isProcessedReturnStatus,
} from '@/lib/sales/revenue-basis';
import {
    getWibDayBounds,
    getWibMonthBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';

export const MARKETING_MOBILE_SAMPLE_LIMIT = 10;

type Sample<T> = { total: number; returned: number; items: T[] };
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
type TeamTarget = {
    orders: TargetProgress;
    visits: TargetProgress;
    revenue?: RevenueProgress;
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
    priority: 'URGENT' | 'HIGH' | 'NORMAL';
    occurredAt: string;
};

export type MarketingMobileOverviewDto = {
    generatedAt: string;
    businessDate: string;
    period: { year: number; month: number };
    sections: {
        team: MobileSection<{
            target: TeamTarget;
            members: Sample<MarketingTeamMemberDto>;
        }>;
        compliance: MobileSection<Sample<MarketingComplianceDto>>;
        pipelineExceptions: MobileSection<
            Sample<MarketingPipelineExceptionDto>
        >;
        reviews: MobileSection<Sample<MarketingReviewDto>>;
        customersWithoutFollowUp: MobileSection<Sample<MarketingFollowUpDto>>;
        tasks: MobileSection<Sample<MarketingTaskDto>>;
        receivables: MobileSection<{
            overdueCount: number;
            overdueAmount?: number;
        }>;
    };
};

type TeamRow = { id: string; name: string | null };
type Bounds = {
    now: Date;
    startOfDay: Date;
    endOfDay: Date;
    monthStart: Date;
    monthEnd: Date;
    year: number;
    month: number;
};
type TransactionDb = Prisma.TransactionClient;

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
function sample<T>(items: T[], total = items.length): Sample<T> {
    const limited = items.slice(0, MARKETING_MOBILE_SAMPLE_LIMIT);
    return { total, returned: limited.length, items: limited };
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
export function createMarketingTaskCandidateWheres(input: {
    teamIds: string[];
    now: Date;
    startOfDay: Date;
    endOfDay: Date;
}): {
    urgentValidityWhere: Prisma.SalesOrderWhereInput;
    urgentFollowUpWhere: Prisma.SalesOrderWhereInput;
    commercialPipelineWhere: Prisma.SalesOrderWhereInput;
    commercialFollowUpWhere: Prisma.SalesOrderWhereInput;
    commercialValidityWhere: Prisma.SalesOrderWhereInput;
    commercialUndatedWhere: Prisma.SalesOrderWhereInput;
} {
    const urgentBase: Prisma.SalesOrderWhereInput = {
        salesRepId: { in: input.teamIds },
        customerId: { not: null },
        status: { in: ['QUOTATION', 'QUOTATION_SENT'] },
        commercialReviewStatus: { not: 'PENDING' },
    };
    return {
        // These two predicates are mutually exclusive and match firstReason().
        // Keeping each pre-bound independently makes the merged global top ten
        // complete even when one urgent reason has more than ten candidates.
        urgentValidityWhere: {
            AND: [
                urgentBase,
                { validUntil: { lt: input.now } },
                {
                    OR: [
                        { validUntil: { lt: input.startOfDay } },
                        { nextFollowUpDate: { lte: input.endOfDay } },
                    ],
                },
            ],
        },
        urgentFollowUpWhere: {
            AND: [
                urgentBase,
                { nextFollowUpDate: { lte: input.endOfDay } },
                {
                    OR: [
                        { validUntil: null },
                        { validUntil: { gte: input.now } },
                    ],
                },
            ],
        },
        commercialPipelineWhere: {
            salesRepId: { in: input.teamIds },
            customerId: { not: null },
            status: { in: ['QUOTATION', 'QUOTATION_SENT'] },
            commercialReviewStatus: 'PENDING',
        },
        commercialFollowUpWhere: {
            salesRepId: { in: input.teamIds },
            customerId: { not: null },
            status: { in: ['QUOTATION', 'QUOTATION_SENT'] },
            commercialReviewStatus: 'PENDING',
            nextFollowUpDate: { not: null },
        },
        commercialValidityWhere: {
            salesRepId: { in: input.teamIds },
            customerId: { not: null },
            status: { in: ['QUOTATION', 'QUOTATION_SENT'] },
            commercialReviewStatus: 'PENDING',
            nextFollowUpDate: null,
            validUntil: { not: null },
        },
        commercialUndatedWhere: {
            salesRepId: { in: input.teamIds },
            customerId: { not: null },
            status: { in: ['QUOTATION', 'QUOTATION_SENT'] },
            commercialReviewStatus: 'PENDING',
            nextFollowUpDate: null,
            validUntil: null,
        },
    };
}

function taskPriorityRank(priority: MarketingTaskDto['priority']): number {
    return priority === 'URGENT' ? 0 : priority === 'HIGH' ? 1 : 2;
}
export function compareMarketingTasks(
    a: MarketingTaskDto,
    b: MarketingTaskDto,
): number {
    return (
        taskPriorityRank(a.priority) - taskPriorityRank(b.priority) ||
        a.occurredAt.localeCompare(b.occurredAt) ||
        a.kind.localeCompare(b.kind) ||
        a.id.localeCompare(b.id)
    );
}

async function readTeamRows(tx: TransactionDb): Promise<TeamRow[]> {
    return tx.user.findMany({
        where: {
            isActive: true,
            isSuperAdmin: false,
            OR: [{ role: 'SALES' }, { roles: { some: { role: 'SALES' } } }],
        },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
}
function pipelineWhere(
    teamIds: string[],
    bounds: Bounds,
): Prisma.SalesOrderWhereInput {
    return {
        salesRepId: { in: teamIds },
        customerId: { not: null },
        status: { in: ['QUOTATION', 'QUOTATION_SENT'] },
        OR: [
            { commercialReviewStatus: 'PENDING' },
            { nextFollowUpDate: { lte: bounds.endOfDay } },
            { validUntil: { lt: bounds.startOfDay } },
        ],
    };
}
function prospectWhere(teamIds: string[]): Prisma.CustomerWhereInput {
    return {
        lifecycleStatus: 'PROSPECT',
        OR: [
            { createdById: { in: teamIds } },
            {
                salesAssignments: {
                    some: { userId: { in: teamIds }, unassignedAt: null },
                },
            },
        ],
    };
}
function pendingVisitWhere(teamIds: string[]): Prisma.SalesVisitWhereInput {
    return { userId: { in: teamIds }, reviewStatus: 'PENDING' };
}
function noFollowUpWhere(
    teamIds: string[],
    bounds: Bounds,
): Prisma.CustomerWhereInput {
    return {
        isActive: true,
        lifecycleStatus: { in: ['ACTIVE', 'PROSPECT'] },
        salesAssignments: {
            some: { userId: { in: teamIds }, unassignedAt: null },
        },
        AND: [
            {
                salesOrders: {
                    none: {
                        status: { in: ['QUOTATION', 'QUOTATION_SENT'] },
                        nextFollowUpDate: { gte: bounds.startOfDay },
                    },
                },
            },
            {
                salesVisits: {
                    none: { checkInTime: { gte: bounds.monthStart } },
                },
            },
            {
                salesOrders: {
                    none: { orderDate: { gte: bounds.monthStart } },
                },
            },
        ],
    };
}
function overdueWhere(
    teamIds: string[],
    bounds: Bounds,
): Prisma.InvoiceWhereInput {
    return {
        status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
        remainingAmount: { gt: 0 },
        dueDate: { lt: bounds.startOfDay },
        salesOrder: {
            salesRepId: { in: teamIds },
            customerId: { not: null },
        },
    };
}
function transaction<T>(
    db: PrismaClient,
    read: (tx: TransactionDb) => Promise<T>,
): Promise<T> {
    return db.$transaction(read, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
}
function sectionFromOutcome<T>(
    outcome: PromiseSettledResult<T>,
): MobileSection<T> {
    return outcome.status === 'fulfilled'
        ? availableSection(outcome.value)
        : unavailableSection<T>();
}

async function readTeamSection(
    tx: TransactionDb,
    bounds: Bounds,
    canViewPrices: boolean,
): Promise<{
    target: TeamTarget;
    members: Sample<MarketingTeamMemberDto>;
}> {
    const teamRows = await readTeamRows(tx);
    const teamIds = teamRows.map((row) => row.id);
    if (teamRows.length === 0) {
        return {
            target: {
                orders: progress(0, null),
                visits: progress(0, null),
                ...(canViewPrices
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
            members: sample([]),
        };
    }
    const [targets, orderCounts, visitCounts, revenueOrders, revenueReturns] =
        await Promise.all([
            tx.salesTarget.findMany({
                where: {
                    userId: { in: teamIds },
                    periodYear: bounds.year,
                    periodMonth: bounds.month,
                },
                select: {
                    userId: true,
                    visitTarget: true,
                    orderTarget: true,
                    ...(canViewPrices ? { revenueTarget: true } : {}),
                },
            }),
            tx.salesOrder.groupBy({
                by: ['salesRepId'],
                where: {
                    salesRepId: { in: teamIds },
                    orderDate: {
                        gte: bounds.monthStart,
                        lte: bounds.monthEnd,
                    },
                    status: { not: 'CANCELLED' },
                },
                _count: { id: true },
            }),
            tx.salesVisit.groupBy({
                by: ['userId'],
                where: {
                    userId: { in: teamIds },
                    checkInTime: {
                        gte: bounds.monthStart,
                        lte: bounds.monthEnd,
                    },
                    reviewStatus: { not: 'REJECTED' },
                },
                _count: { id: true },
            }),
            canViewPrices
                ? tx.salesOrder.findMany({
                      where: {
                          salesRepId: { in: teamIds },
                          orderDate: {
                              gte: bounds.monthStart,
                              lte: bounds.monthEnd,
                          },
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
            canViewPrices
                ? tx.salesReturn.findMany({
                      where: {
                          returnDate: {
                              gte: bounds.monthStart,
                              lte: bounds.monthEnd,
                          },
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
        ]);
    const targetByUser = new Map(targets.map((row) => [row.userId, row]));
    const ordersByUser = new Map(
        orderCounts.flatMap((row) =>
            row.salesRepId ? [[row.salesRepId, row._count.id] as const] : [],
        ),
    );
    const visitsByUser = new Map(
        visitCounts.map((row) => [row.userId, row._count.id]),
    );
    const revenue = canViewPrices
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
    const members = teamRows.map((member) => {
        const target = targetByUser.get(member.id);
        const revenueTarget = canViewPrices
            ? decimalNumber(
                  (target as { revenueTarget?: unknown } | undefined)
                      ?.revenueTarget,
              )
            : 0;
        const revenueActual = canViewPrices
            ? decimalNumber(revenue?.attributed.get(member.id))
            : 0;
        return {
            id: member.id,
            name: member.name ?? 'Sales tanpa nama',
            orders: progress(
                ordersByUser.get(member.id) ?? 0,
                target?.orderTarget ?? null,
            ),
            visits: progress(
                visitsByUser.get(member.id) ?? 0,
                target?.visitTarget ?? null,
            ),
            ...(canViewPrices
                ? {
                      revenue: {
                          targetAmount: revenueTarget,
                          actualAmount: revenueActual,
                          gapAmount: Math.max(0, revenueTarget - revenueActual),
                          achievementPercent: percentage(
                              revenueActual,
                              revenueTarget,
                          ),
                      },
                  }
                : {}),
        };
    });
    members.sort(
        (a, b) =>
            a.name.localeCompare(b.name, 'id') || a.id.localeCompare(b.id),
    );
    const orderTargets = members
        .map((member) => member.orders.target)
        .filter((value): value is number => value != null);
    const visitTargets = members
        .map((member) => member.visits.target)
        .filter((value): value is number => value != null);
    const orderTarget =
        orderTargets.length > 0
            ? orderTargets.reduce((sum, value) => sum + value, 0)
            : null;
    const visitTarget =
        visitTargets.length > 0
            ? visitTargets.reduce((sum, value) => sum + value, 0)
            : null;
    const orderActual = members.reduce(
        (sum, member) => sum + member.orders.actual,
        0,
    );
    const visitActual = members.reduce(
        (sum, member) => sum + member.visits.actual,
        0,
    );
    const revenueTarget = members.reduce(
        (sum, member) => sum + (member.revenue?.targetAmount ?? 0),
        0,
    );
    const revenueActual = members.reduce(
        (sum, member) => sum + (member.revenue?.actualAmount ?? 0),
        0,
    );
    return {
        target: {
            orders: progress(orderActual, orderTarget),
            visits: progress(visitActual, visitTarget),
            ...(canViewPrices
                ? {
                      revenue: {
                          targetAmount: revenueTarget,
                          actualAmount: revenueActual,
                          gapAmount: Math.max(0, revenueTarget - revenueActual),
                          achievementPercent: percentage(
                              revenueActual,
                              revenueTarget,
                          ),
                      },
                  }
                : {}),
        },
        members: sample(members, teamRows.length),
    };
}

async function readComplianceSection(
    tx: TransactionDb,
    bounds: Bounds,
): Promise<Sample<MarketingComplianceDto>> {
    const teamRows = await readTeamRows(tx);
    const teamIds = teamRows.map((row) => row.id);
    const [dailyVisits, extraVisits, routePlans] = await Promise.all([
        tx.salesVisit.groupBy({
            by: ['userId'],
            where: {
                userId: { in: teamIds },
                checkInTime: {
                    gte: bounds.startOfDay,
                    lte: bounds.endOfDay,
                },
                reviewStatus: { not: 'REJECTED' },
            },
            _count: { id: true },
        }),
        tx.salesVisit.groupBy({
            by: ['userId'],
            where: {
                userId: { in: teamIds },
                checkInTime: {
                    gte: bounds.startOfDay,
                    lte: bounds.endOfDay,
                },
                reviewStatus: { not: 'REJECTED' },
                isExtraCall: true,
            },
            _count: { id: true },
        }),
        tx.salesRoutePlan.findMany({
            where: {
                userId: { in: teamIds },
                date: new Date(
                    `${toBusinessDateString(bounds.now)}T00:00:00.000Z`,
                ),
            },
            select: { userId: true, items: { select: { status: true } } },
        }),
    ]);
    const dailyByUser = new Map(
        dailyVisits.map((row) => [row.userId, row._count.id]),
    );
    const extraByUser = new Map(
        extraVisits.map((row) => [row.userId, row._count.id]),
    );
    const assignedByUser = new Map<string, number>();
    for (const plan of routePlans) {
        assignedByUser.set(
            plan.userId,
            (assignedByUser.get(plan.userId) ?? 0) + plan.items.length,
        );
    }
    const items = teamRows.map((member) => {
        const assigned = assignedByUser.get(member.id) ?? 0;
        const visited = dailyByUser.get(member.id) ?? 0;
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
    });
    items.sort(
        (a, b) =>
            a.salesName.localeCompare(b.salesName, 'id') ||
            a.id.localeCompare(b.id),
    );
    return sample(items, teamRows.length);
}

async function readPipelineSection(
    tx: TransactionDb,
    bounds: Bounds,
    canViewPrices: boolean,
): Promise<Sample<MarketingPipelineExceptionDto>> {
    const teamIds = (await readTeamRows(tx)).map((row) => row.id);
    const where = pipelineWhere(teamIds, bounds);
    const [total, rows] = await Promise.all([
        tx.salesOrder.count({ where }),
        tx.salesOrder.findMany({
            where,
            select: {
                id: true,
                orderNumber: true,
                commercialReviewStatus: true,
                nextFollowUpDate: true,
                validUntil: true,
                customer: { select: { name: true } },
                salesRep: { select: { name: true } },
                ...(canViewPrices ? { totalAmount: true } : {}),
            },
            orderBy: [
                { nextFollowUpDate: 'asc' },
                { validUntil: 'asc' },
                { id: 'asc' },
            ],
            take: MARKETING_MOBILE_SAMPLE_LIMIT,
        }),
    ]);
    const items = rows.map((row) => {
        const reason = firstReason(row, bounds.now);
        const dueDate =
            reason === 'VALIDITY_EXPIRED'
                ? row.validUntil
                : (row.nextFollowUpDate ?? row.validUntil);
        return {
            id: row.id,
            orderNumber: row.orderNumber,
            customerName: row.customer?.name ?? 'Customer tidak tersedia',
            salesName: row.salesRep?.name ?? 'Belum ditugaskan',
            reason,
            dueAt: dueDate?.toISOString() ?? null,
            ...(canViewPrices
                ? {
                      amount: decimalNumber(
                          (row as { totalAmount?: unknown }).totalAmount,
                      ),
                  }
                : {}),
        };
    });
    return sample(items, total);
}

async function readReviewsSection(
    tx: TransactionDb,
): Promise<Sample<MarketingReviewDto>> {
    const teamIds = (await readTeamRows(tx)).map((row) => row.id);
    const prospectFilter = prospectWhere(teamIds);
    const visitFilter = pendingVisitWhere(teamIds);
    const [prospectTotal, prospects, visitTotal, visits] = await Promise.all([
        tx.customer.count({ where: prospectFilter }),
        tx.customer.findMany({
            where: prospectFilter,
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
        tx.salesVisit.count({ where: visitFilter }),
        tx.salesVisit.findMany({
            where: visitFilter,
            select: {
                id: true,
                checkInTime: true,
                customer: { select: { name: true } },
                user: { select: { name: true } },
            },
            orderBy: [{ checkInTime: 'asc' }, { id: 'asc' }],
            take: MARKETING_MOBILE_SAMPLE_LIMIT,
        }),
    ]);
    const items: MarketingReviewDto[] = [
        ...prospects.map((row) => ({
            id: row.id,
            kind: 'PROSPECT' as const,
            title: row.name,
            salesName:
                row.salesAssignments[0]?.user.name ??
                row.createdBy?.name ??
                'Belum ditugaskan',
            queuedAt: row.createdAt.toISOString(),
        })),
        ...visits.map((row) => ({
            id: row.id,
            kind: 'VISIT' as const,
            title: row.customer.name,
            salesName: row.user.name ?? 'Sales tanpa nama',
            queuedAt: row.checkInTime.toISOString(),
        })),
    ].sort(
        (a, b) =>
            a.queuedAt.localeCompare(b.queuedAt) ||
            a.kind.localeCompare(b.kind) ||
            a.id.localeCompare(b.id),
    );
    return sample(items, prospectTotal + visitTotal);
}

async function readNoFollowUpSection(
    tx: TransactionDb,
    bounds: Bounds,
): Promise<Sample<MarketingFollowUpDto>> {
    const teamIds = (await readTeamRows(tx)).map((row) => row.id);
    const where = noFollowUpWhere(teamIds, bounds);
    const [total, rows] = await Promise.all([
        tx.customer.count({ where }),
        tx.customer.findMany({
            where,
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
    ]);
    return sample(
        rows.map((row) => ({
            id: row.id,
            customerName: row.name,
            city: row.city,
            salesName: row.salesAssignments[0]?.user.name ?? 'Belum ditugaskan',
            inactiveSince: row.updatedAt.toISOString(),
        })),
        total,
    );
}

async function readReceivablesSection(
    tx: TransactionDb,
    bounds: Bounds,
    canViewPrices: boolean,
): Promise<{ overdueCount: number; overdueAmount?: number }> {
    const teamIds = (await readTeamRows(tx)).map((row) => row.id);
    const where = overdueWhere(teamIds, bounds);
    const [overdueCount, amounts] = await Promise.all([
        tx.invoice.count({ where }),
        canViewPrices
            ? tx.invoice.aggregate({
                  where,
                  _sum: { remainingAmount: true },
              })
            : Promise.resolve(null),
    ]);
    return {
        overdueCount,
        ...(amounts
            ? { overdueAmount: decimalNumber(amounts._sum.remainingAmount) }
            : {}),
    };
}

async function readTasksSection(
    tx: TransactionDb,
    bounds: Bounds,
): Promise<Sample<MarketingTaskDto>> {
    const teamIds = (await readTeamRows(tx)).map((row) => row.id);
    const {
        urgentValidityWhere,
        urgentFollowUpWhere,
        commercialPipelineWhere,
        commercialFollowUpWhere,
        commercialValidityWhere,
        commercialUndatedWhere,
    } = createMarketingTaskCandidateWheres({
        teamIds,
        now: bounds.now,
        startOfDay: bounds.startOfDay,
        endOfDay: bounds.endOfDay,
    });
    const prospectFilter = prospectWhere(teamIds);
    const visitFilter = pendingVisitWhere(teamIds);
    const noFollowUpFilter = noFollowUpWhere(teamIds, bounds);
    const pipelineSelect = {
        id: true,
        orderNumber: true,
        commercialReviewStatus: true,
        nextFollowUpDate: true,
        validUntil: true,
        customer: { select: { name: true } },
        salesRep: { select: { name: true } },
    } satisfies Prisma.SalesOrderSelect;
    const [
        urgentValidityCount,
        urgentValidity,
        urgentFollowUpCount,
        urgentFollowUps,
        commercialCount,
        commercialFollowUps,
        commercialValidity,
        commercialUndated,
        prospectCount,
        prospects,
        visitCount,
        visits,
        noFollowUpCount,
        noFollowUps,
    ] = await Promise.all([
        tx.salesOrder.count({ where: urgentValidityWhere }),
        tx.salesOrder.findMany({
            where: urgentValidityWhere,
            select: pipelineSelect,
            orderBy: [{ validUntil: 'asc' }, { id: 'asc' }],
            take: MARKETING_MOBILE_SAMPLE_LIMIT,
        }),
        tx.salesOrder.count({ where: urgentFollowUpWhere }),
        tx.salesOrder.findMany({
            where: urgentFollowUpWhere,
            select: pipelineSelect,
            orderBy: [{ nextFollowUpDate: 'asc' }, { id: 'asc' }],
            take: MARKETING_MOBILE_SAMPLE_LIMIT,
        }),
        tx.salesOrder.count({ where: commercialPipelineWhere }),
        tx.salesOrder.findMany({
            where: commercialFollowUpWhere,
            select: pipelineSelect,
            orderBy: [{ nextFollowUpDate: 'asc' }, { id: 'asc' }],
            take: MARKETING_MOBILE_SAMPLE_LIMIT,
        }),
        tx.salesOrder.findMany({
            where: commercialValidityWhere,
            select: pipelineSelect,
            orderBy: [{ validUntil: 'asc' }, { id: 'asc' }],
            take: MARKETING_MOBILE_SAMPLE_LIMIT,
        }),
        tx.salesOrder.findMany({
            where: commercialUndatedWhere,
            select: pipelineSelect,
            orderBy: { id: 'asc' },
            take: MARKETING_MOBILE_SAMPLE_LIMIT,
        }),
        tx.customer.count({ where: prospectFilter }),
        tx.customer.findMany({
            where: prospectFilter,
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
        tx.salesVisit.count({ where: visitFilter }),
        tx.salesVisit.findMany({
            where: visitFilter,
            select: {
                id: true,
                checkInTime: true,
                customer: { select: { name: true } },
                user: { select: { name: true } },
            },
            orderBy: [{ checkInTime: 'asc' }, { id: 'asc' }],
            take: MARKETING_MOBILE_SAMPLE_LIMIT,
        }),
        tx.customer.count({ where: noFollowUpFilter }),
        tx.customer.findMany({
            where: noFollowUpFilter,
            select: {
                id: true,
                name: true,
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
    ]);
    const pipelineTask = (
        row: (typeof urgentValidity)[number],
        priority: 'URGENT' | 'HIGH',
    ): MarketingTaskDto => {
        const reason = firstReason(row, bounds.now);
        const dueAt =
            reason === 'VALIDITY_EXPIRED'
                ? row.validUntil
                : (row.nextFollowUpDate ?? row.validUntil);
        return {
            id: row.id,
            kind: 'PIPELINE',
            title: row.orderNumber,
            subtitle: `${row.customer?.name ?? 'Customer tidak tersedia'} · ${row.salesRep?.name ?? 'Belum ditugaskan'}`,
            priority,
            occurredAt: dueAt?.toISOString() ?? bounds.now.toISOString(),
        };
    };
    const tasks: MarketingTaskDto[] = [
        ...urgentValidity.map((row) => pipelineTask(row, 'URGENT')),
        ...urgentFollowUps.map((row) => pipelineTask(row, 'URGENT')),
        ...commercialFollowUps.map((row) => pipelineTask(row, 'HIGH')),
        ...commercialValidity.map((row) => pipelineTask(row, 'HIGH')),
        ...commercialUndated.map((row) => pipelineTask(row, 'HIGH')),
        ...prospects.map((row) => ({
            id: row.id,
            kind: 'PROSPECT_REVIEW' as const,
            title: row.name,
            subtitle:
                row.salesAssignments[0]?.user.name ??
                row.createdBy?.name ??
                'Belum ditugaskan',
            priority: 'HIGH' as const,
            occurredAt: row.createdAt.toISOString(),
        })),
        ...visits.map((row) => ({
            id: row.id,
            kind: 'VISIT_REVIEW' as const,
            title: row.customer.name,
            subtitle: row.user.name ?? 'Sales tanpa nama',
            priority: 'HIGH' as const,
            occurredAt: row.checkInTime.toISOString(),
        })),
        ...noFollowUps.map((row) => ({
            id: row.id,
            kind: 'NO_FOLLOW_UP' as const,
            title: row.name,
            subtitle: row.salesAssignments[0]?.user.name ?? 'Belum ditugaskan',
            priority: 'NORMAL' as const,
            occurredAt: row.updatedAt.toISOString(),
        })),
    ].sort(compareMarketingTasks);
    return sample(
        tasks,
        urgentValidityCount +
            urgentFollowUpCount +
            commercialCount +
            prospectCount +
            visitCount +
            noFollowUpCount,
    );
}

/**
 * Tenant-scoped read-only supervisor composer. Every section receives its own
 * RepeatableRead transaction so a PostgreSQL statement failure cannot abort
 * otherwise healthy peer sections.
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
    const bounds: Bounds = {
        now,
        startOfDay,
        endOfDay,
        monthStart,
        monthEnd,
        year,
        month,
    };
    const [
        team,
        compliance,
        pipeline,
        reviews,
        noFollowUp,
        tasks,
        receivables,
    ] = await Promise.allSettled([
        transaction(tenantDb, (tx) =>
            readTeamSection(tx, bounds, input.canViewPrices),
        ),
        transaction(tenantDb, (tx) => readComplianceSection(tx, bounds)),
        transaction(tenantDb, (tx) =>
            readPipelineSection(tx, bounds, input.canViewPrices),
        ),
        transaction(tenantDb, (tx) => readReviewsSection(tx)),
        transaction(tenantDb, (tx) => readNoFollowUpSection(tx, bounds)),
        transaction(tenantDb, (tx) => readTasksSection(tx, bounds)),
        transaction(tenantDb, (tx) =>
            readReceivablesSection(tx, bounds, input.canViewPrices),
        ),
    ]);
    return {
        generatedAt: now.toISOString(),
        businessDate,
        period: { year, month },
        sections: {
            team: sectionFromOutcome(team),
            compliance: sectionFromOutcome(compliance),
            pipelineExceptions: sectionFromOutcome(pipeline),
            reviews: sectionFromOutcome(reviews),
            customersWithoutFollowUp: sectionFromOutcome(noFollowUp),
            tasks: sectionFromOutcome(tasks),
            receivables: sectionFromOutcome(receivables),
        },
    };
}
