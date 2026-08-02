import { prisma } from '@/lib/core/prisma';
import { Prisma, type SalesVisitReviewStatus } from '@prisma/client';
import { logActivity } from '@/lib/tools/audit';
import { NotFoundError, BusinessRuleError } from '@/lib/errors/errors';
import { calculateComplianceRate } from '@/lib/sales/route-compliance';

export type ListTeamVisitsFilters = {
    from: Date;
    to: Date;
    userId?: string;
    customerId?: string;
    isExtraCall?: boolean;
    reviewStatus?: SalesVisitReviewStatus;
    page?: number;
    pageSize?: number;
};

export type TeamComplianceRow = {
    userId: string;
    userName: string;
    assigned: number;
    visited: number;
    extraCalls: number;
    compliance: number;
};

// ── listTeamVisits ──

export async function listTeamVisits(filters: ListTeamVisitsFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const skip = (page - 1) * pageSize;

    const where: Prisma.SalesVisitWhereInput = {
        checkInTime: {
            gte: filters.from,
            lte: filters.to,
        },
    };

    if (filters.userId) where.userId = filters.userId;
    if (filters.customerId) where.customerId = filters.customerId;
    if (typeof filters.isExtraCall === 'boolean') {
        where.isExtraCall = filters.isExtraCall;
    }
    if (filters.reviewStatus) where.reviewStatus = filters.reviewStatus;

    const [visits, total] = await Promise.all([
        prisma.salesVisit.findMany({
            where,
            include: {
                customer: true,
                user: true,
                routePlanItem: true,
            },
            orderBy: { checkInTime: 'desc' },
            skip,
            take: pageSize,
        }),
        prisma.salesVisit.count({ where }),
    ]);

    return {
        visits,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
}

// ── getTeamComplianceSummary ──

export async function getTeamComplianceSummary(
    from: Date,
    to: Date,
    userId?: string,
): Promise<TeamComplianceRow[]> {
    // Assigned per user from RoutePlan + items in date range
    const routeWhere: Prisma.SalesRoutePlanWhereInput = {
        date: { gte: from, lte: to },
        ...(userId ? { userId } : {}),
    };

    const plans = await prisma.salesRoutePlan.findMany({
        where: routeWhere,
        select: {
            userId: true,
            user: { select: { name: true } },
            items: { select: { id: true } },
        },
    });

    // Aggregate assigned per userId
    const assignedMap = new Map<
        string,
        { assigned: number; userName: string }
    >();
    for (const plan of plans) {
        const existing = assignedMap.get(plan.userId);
        const userName = plan.user?.name ?? plan.userId;
        if (existing) {
            existing.assigned += plan.items.length;
        } else {
            assignedMap.set(plan.userId, {
                assigned: plan.items.length,
                userName,
            });
        }
    }

    // Visited + extraCalls per user — exclude REJECTED per Q3
    const visitWhere: Prisma.SalesVisitWhereInput = {
        checkInTime: { gte: from, lte: to },
        reviewStatus: { not: 'REJECTED' },
        ...(userId ? { userId } : {}),
    };

    const visits = await prisma.salesVisit.groupBy({
        by: ['userId'],
        where: visitWhere,
        _count: { id: true },
    });

    const extraVisits = await prisma.salesVisit.groupBy({
        by: ['userId'],
        where: { ...visitWhere, isExtraCall: true },
        _count: { id: true },
    });

    // Also fetch user names for users that only have visits but no route plan (or name not in assignedMap)
    const userIdsFromVisits = visits.map((v) => v.userId);
    const missingUserIds = userIdsFromVisits.filter(
        (id) => !assignedMap.has(id),
    );
    let missingNames = new Map<string, string>();
    if (missingUserIds.length > 0) {
        const users = await prisma.user.findMany({
            where: { id: { in: missingUserIds } },
            select: { id: true, name: true },
        });
        missingNames = new Map(users.map((u) => [u.id, u.name ?? u.id]));
    }

    const visitedMap = new Map(visits.map((v) => [v.userId, v._count.id]));
    const extraMap = new Map(extraVisits.map((v) => [v.userId, v._count.id]));

    // Merge all userIds
    const allUserIds = new Set([...assignedMap.keys(), ...visitedMap.keys()]);

    const rows: TeamComplianceRow[] = [];
    for (const uid of allUserIds) {
        const assignedEntry = assignedMap.get(uid);
        const assigned = assignedEntry?.assigned ?? 0;
        const userName =
            assignedEntry?.userName ?? missingNames.get(uid) ?? uid;
        const visited = visitedMap.get(uid) ?? 0;
        const extraCalls = extraMap.get(uid) ?? 0;
        const compliance = calculateComplianceRate({
            assigned,
            visited,
            extraCalls,
        });

        rows.push({
            userId: uid,
            userName,
            assigned,
            visited,
            extraCalls,
            compliance,
        });
    }

    // If filter userId specified but no data, return single row with 0s so caller knows user exists
    if (userId && rows.length === 0) {
        // Try fetch name
        let uName = userId;
        try {
            const u = await prisma.user.findUnique({
                where: { id: userId },
                select: { name: true },
            });
            if (u?.name) uName = u.name;
        } catch {
            // ignore
        }
        rows.push({
            userId,
            userName: uName,
            assigned: 0,
            visited: 0,
            extraCalls: 0,
            compliance: 0,
        });
    }

    // Sort by compliance desc then name
    rows.sort((a, b) => {
        if (b.compliance !== a.compliance) return b.compliance - a.compliance;
        return a.userName.localeCompare(b.userName);
    });

    return rows;
}

// ── reviewVisit ──

export async function reviewVisit(
    visitId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewerId: string,
    notes?: string,
) {
    const existing = await prisma.salesVisit.findUnique({
        where: { id: visitId },
    });

    if (!existing) {
        throw new NotFoundError('SalesVisit', visitId);
    }

    if (existing.reviewStatus !== 'PENDING') {
        throw new BusinessRuleError(
            `Kunjungan ini sudah direview (status: ${existing.reviewStatus}). Tidak boleh review dua kali.`,
            { visitId, currentStatus: existing.reviewStatus },
            'ALREADY_REVIEWED',
        );
    }

    const updated = await prisma.salesVisit.update({
        where: { id: visitId },
        data: { reviewStatus: decision },
    });

    await logActivity({
        userId: reviewerId,
        action: decision === 'APPROVED' ? 'VISIT_APPROVED' : 'VISIT_REJECTED',
        entityType: 'SalesVisit',
        entityId: visitId,
        details:
            notes ??
            (decision === 'APPROVED'
                ? 'Extra call disetujui'
                : 'Extra call ditolak — tidak dihitung compliance (Q3)'),
        fromStatus: existing.reviewStatus,
        toStatus: decision,
    });

    return updated;
}
