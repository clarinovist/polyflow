import { prisma } from '@/lib/core/prisma';
import {
    OVERDUE_VISIT_DAYS,
    getRouteWeekDates,
} from '@/lib/sales/route-compliance';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VISITED_ITEM_STATUSES = new Set(['COMPLETED', 'VISITING']);

// ── Types ────────────────────────────────────────────────────────────

export type WeekBoardDayPlan = {
    userId: string;
    planId: string | null;
    status: string | null;
    itemCount: number;
    visitedCount: number;
};

export type WeekBoardDay = {
    date: Date;
    plans: WeekBoardDayPlan[];
};

export type WeekBoardCoverage = {
    activeCustomers: number;
    scheduledThisWeek: number;
};

export type WeekBoardOverdueEntry = {
    customerId: string;
    name: string;
    lastVisitAt: Date | null;
    daysSince: number | null;
};

/** Sama isinya dengan WeekBoardOverdueEntry, tapi UNTUK SEMUA customer aktif
 * (bukan cuma yang overdue) — dipakai UI untuk badge "umur kunjungan
 * terakhir" per stop di RouteStopList (R6), bukan hanya di bar overdue. */
export type WeekBoardVisitAge = WeekBoardOverdueEntry;

export type WeekBoardConflict = {
    customerId: string;
    name: string;
    date: Date;
    userIds: string[];
};

export type WeekBoard = {
    days: WeekBoardDay[];
    coverage: WeekBoardCoverage;
    overdue: WeekBoardOverdueEntry[];
    conflicts: WeekBoardConflict[];
    /** Umur kunjungan (daysSince null = belum pernah) untuk SEMUA customer
     * yang aktif di-assign ke userIds — superset dari `overdue`. Dihitung
     * dari data yang sama, tanpa query tambahan. */
    lastVisits: WeekBoardVisitAge[];
};

// ── Helpers ──────────────────────────────────────────────────────────

/** Re-exported supaya pemanggil lama (route-plans.ts) tidak perlu ganti import. */
export const getWeekDates = getRouteWeekDates;

function dateKey(date: Date): string {
    return date.toISOString().split('T')[0];
}

function daysSince(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

// ── Main aggregation ────────────────────────────────────────────────

/**
 * Agregasi papan mingguan rute untuk sekumpulan rep.
 * Sengaja dibatasi 3 query (bukan N+1 per rep per hari):
 *  1. Semua SalesRoutePlan + item pada rentang minggu untuk userIds.
 *  2. MAX(checkInTime) per customer (agregat, groupBy) untuk userIds.
 *  3. Customer aktif yang di-assign ke userIds (distinct by customerId) —
 *     dipakai untuk hitung "customer aktif" sekaligus nama untuk overdue/conflict.
 */
export async function getWeekBoard({
    weekStart,
    userIds,
    now = new Date(),
}: {
    weekStart: Date;
    userIds: string[];
    now?: Date;
}): Promise<WeekBoard> {
    const dates = getWeekDates(weekStart);
    const rangeEnd = new Date(dates[dates.length - 1]);
    rangeEnd.setUTCHours(23, 59, 59, 999);

    if (userIds.length === 0) {
        return {
            days: dates.map((date) => ({ date, plans: [] })),
            coverage: { activeCustomers: 0, scheduledThisWeek: 0 },
            overdue: [],
            conflicts: [],
            lastVisits: [],
        };
    }

    const [plans, lastVisitRows, assignedCustomers] = await Promise.all([
        prisma.salesRoutePlan.findMany({
            where: {
                userId: { in: userIds },
                date: { gte: dates[0], lte: rangeEnd },
            },
            select: {
                id: true,
                date: true,
                userId: true,
                status: true,
                items: { select: { customerId: true, status: true } },
            },
        }),
        prisma.salesVisit.groupBy({
            by: ['customerId'],
            where: { userId: { in: userIds } },
            _max: { checkInTime: true },
        }),
        prisma.customerSalesAssignment.findMany({
            where: { userId: { in: userIds }, unassignedAt: null },
            select: { customerId: true, customer: { select: { name: true } } },
            distinct: ['customerId'],
        }),
    ]);

    const lastVisitByCustomer = new Map<string, Date>();
    for (const row of lastVisitRows) {
        if (row._max.checkInTime) {
            lastVisitByCustomer.set(row.customerId, row._max.checkInTime);
        }
    }

    const customerNameById = new Map<string, string>();
    for (const a of assignedCustomers) {
        customerNameById.set(a.customerId, a.customer.name);
    }

    // ── days ──
    const plansByDateAndUser = new Map<string, WeekBoardDayPlan>();
    const scheduledCustomerIds = new Set<string>();
    const conflictBuckets = new Map<
        string,
        { customerId: string; date: Date; userIds: Set<string> }
    >();

    for (const plan of plans) {
        const key = `${dateKey(plan.date)}|${plan.userId}`;
        const visitedCount = plan.items.filter((i) =>
            VISITED_ITEM_STATUSES.has(i.status),
        ).length;
        plansByDateAndUser.set(key, {
            userId: plan.userId,
            planId: plan.id,
            status: plan.status,
            itemCount: plan.items.length,
            visitedCount,
        });

        for (const item of plan.items) {
            scheduledCustomerIds.add(item.customerId);

            const conflictKey = `${dateKey(plan.date)}|${item.customerId}`;
            const bucket = conflictBuckets.get(conflictKey) ?? {
                customerId: item.customerId,
                date: plan.date,
                userIds: new Set<string>(),
            };
            bucket.userIds.add(plan.userId);
            conflictBuckets.set(conflictKey, bucket);
        }
    }

    const days: WeekBoardDay[] = dates.map((date) => ({
        date,
        plans: userIds.map(
            (userId) =>
                plansByDateAndUser.get(`${dateKey(date)}|${userId}`) ?? {
                    userId,
                    planId: null,
                    status: null,
                    itemCount: 0,
                    visitedCount: 0,
                },
        ),
    }));

    // ── coverage ──
    const coverage: WeekBoardCoverage = {
        activeCustomers: assignedCustomers.length,
        scheduledThisWeek: scheduledCustomerIds.size,
    };

    // ── umur kunjungan per customer (semua yang di-assign, bukan cuma overdue) ──
    const lastVisits: WeekBoardVisitAge[] = assignedCustomers.map((a) => {
        const lastVisitAt = lastVisitByCustomer.get(a.customerId) ?? null;
        const days = lastVisitAt ? daysSince(lastVisitAt, now) : null;
        return {
            customerId: a.customerId,
            name: a.customer.name,
            lastVisitAt,
            daysSince: days,
        };
    });

    // ── overdue: subset dari lastVisits, difilter + diurutkan ──
    const overdue: WeekBoardOverdueEntry[] = lastVisits
        .filter(
            (entry) =>
                entry.daysSince === null ||
                entry.daysSince > OVERDUE_VISIT_DAYS,
        )
        .sort((a, b) => {
            // Belum pernah dikunjungi (null) paling atas, lalu terlama.
            if (a.daysSince === null && b.daysSince === null) return 0;
            if (a.daysSince === null) return -1;
            if (b.daysSince === null) return 1;
            return b.daysSince - a.daysSince;
        });

    // ── conflicts ──
    const conflicts: WeekBoardConflict[] = Array.from(conflictBuckets.values())
        .filter((b) => b.userIds.size > 1)
        .map((b) => ({
            customerId: b.customerId,
            name:
                customerNameById.get(b.customerId) ??
                `Customer ${b.customerId}`,
            date: b.date,
            userIds: Array.from(b.userIds),
        }));

    return { days, coverage, overdue, conflicts, lastVisits };
}
