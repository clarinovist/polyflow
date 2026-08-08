'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import {
    requireSalesAccess,
    requireSalesApprover,
} from '@/lib/auth/sales-access';
import { safeAction, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { revalidatePath } from 'next/cache';
import { haversineDistance } from '@/lib/utils/geo';
import { calculateComplianceRate } from '@/lib/sales/route-compliance';
import {
    getWeekBoard,
    getWeekDates,
} from '@/services/sales/route-planning-service';
import { serializeData } from '@/lib/utils/utils';
import type { PrismaClient } from '@prisma/client';

// ── Types ────────────────────────────────────────────────────────────

type RoutePlanItemInput = {
    customerId: string;
    sortOrder: number;
};

type CreateRoutePlanInput = {
    date: string; // ISO date string
    userId: string;
    items: RoutePlanItemInput[];
};

type UpdateRoutePlanInput = {
    id: string;
    items: RoutePlanItemInput[];
    status?: 'DRAFT' | 'PUBLISHED';
};

type PrismaTx = Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const ROUTE_PLAN_INCLUDE = {
    items: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
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
    user: { select: { id: true, name: true } },
};

// ── R2 guard: reconcile plan items without destroying visited history ──
//
// Rute PUBLISHED yang sudah dijalankan bisa punya SalesVisit yang tertaut
// lewat routePlanItemId. Item dengan kunjungan (visits.length > 0) pada plan
// PUBLISHED WAJIB dipertahankan — hanya sortOrder-nya boleh berubah. Item
// tanpa kunjungan boleh dihapus & dibuat ulang seperti sebelumnya.
async function reconcileRoutePlanItems(
    tx: PrismaTx,
    planId: string,
    planStatus: string,
    desiredItems: RoutePlanItemInput[],
): Promise<{ retainedCount: number }> {
    const existingItems = await tx.salesRoutePlanItem.findMany({
        where: { routePlanId: planId },
        include: { visits: { select: { id: true } } },
    });

    const isPublished = planStatus === 'PUBLISHED';
    const protectedItems = existingItems.filter(
        (item) => isPublished && item.visits.length > 0,
    );
    const protectedCustomerIds = new Set(
        protectedItems.map((item) => item.customerId),
    );

    const desiredByCustomer = new Map(
        desiredItems.map((item) => [item.customerId, item]),
    );

    // Hapus hanya item yang TIDAK dilindungi (belum ada kunjungan).
    const deletableIds = existingItems
        .filter((item) => !protectedCustomerIds.has(item.customerId))
        .map((item) => item.id);
    if (deletableIds.length > 0) {
        await tx.salesRoutePlanItem.deleteMany({
            where: { id: { in: deletableIds } },
        });
    }

    // Update sortOrder item yang dilindungi. Kalau item itu masih ada di
    // daftar baru, pakai sortOrder barunya; kalau caller menghapusnya dari
    // daftar (mencoba menghapus item bervisit), tetap dipertahankan dan
    // ditaruh setelah item lain supaya urutan tidak tabrakan.
    let nextOrphanOrder = desiredItems.length + 1;
    for (const item of protectedItems) {
        const desired = desiredByCustomer.get(item.customerId);
        const sortOrder = desired ? desired.sortOrder : nextOrphanOrder++;
        await tx.salesRoutePlanItem.update({
            where: { id: item.id },
            data: { sortOrder },
        });
    }

    // Buat ulang semua item yang tidak dilindungi (customer baru + customer
    // lama tanpa kunjungan yang tetap diinginkan caller).
    const toCreate = desiredItems.filter(
        (item) => !protectedCustomerIds.has(item.customerId),
    );
    if (toCreate.length > 0) {
        await tx.salesRoutePlanItem.createMany({
            data: toCreate.map((item) => ({
                routePlanId: planId,
                customerId: item.customerId,
                sortOrder: item.sortOrder,
                status: 'PENDING',
            })),
        });
    }

    return { retainedCount: protectedItems.length };
}

/**
 * Upsert satu SalesRoutePlan (date+userId) dengan item barunya, selalu lewat
 * `reconcileRoutePlanItems` di jalur update supaya guard R2 berlaku di semua
 * pemanggil (create manual, salin minggu lalu, salin dari tanggal, import
 * Excel) — bukan cuma createRoutePlan. Dipanggil di dalam `prisma.$transaction`.
 */
async function upsertRoutePlanWithGuard(
    tx: PrismaTx,
    params: {
        date: Date;
        userId: string;
        createdBy: string;
        items: RoutePlanItemInput[];
    },
) {
    const existing = await tx.salesRoutePlan.findUnique({
        where: { date_userId: { date: params.date, userId: params.userId } },
    });

    if (!existing) {
        const created = await tx.salesRoutePlan.create({
            data: {
                date: params.date,
                userId: params.userId,
                createdBy: params.createdBy,
                items: {
                    create: params.items.map((item) => ({
                        customerId: item.customerId,
                        sortOrder: item.sortOrder,
                        status: 'PENDING',
                    })),
                },
            },
            include: ROUTE_PLAN_INCLUDE,
        });
        return { plan: created, retainedCount: 0 };
    }

    const { retainedCount } = await reconcileRoutePlanItems(
        tx,
        existing.id,
        existing.status,
        params.items,
    );

    const updated = await tx.salesRoutePlan.update({
        where: { id: existing.id },
        data: { createdBy: params.createdBy },
        include: ROUTE_PLAN_INCLUDE,
    });
    return { plan: updated, retainedCount };
}

function retainedSuffix(retainedCount: number): string {
    return retainedCount > 0
        ? ` (${retainedCount} item dipertahankan karena sudah ada kunjungan)`
        : '';
}

// ── Get route plan for a specific date + rep ────────────────────────

export const getRoutePlan = withTenant(async function getRoutePlan(
    date: string,
    userId: string,
) {
    return safeAction(async () => {
        await requireSalesAccess();

        const plan = await prisma.salesRoutePlan.findUnique({
            where: {
                date_userId: {
                    date: new Date(date),
                    userId,
                },
            },
            include: {
                items: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        customer: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                                city: true,
                                latitude: true,
                                longitude: true,
                            },
                        },
                        // Dipakai UI untuk badge "terkunci" (konsekuensi guard R2):
                        // item dengan visitCount > 0 pada plan PUBLISHED tidak bisa dihapus.
                        _count: { select: { visits: true } },
                    },
                },
                user: {
                    select: { id: true, name: true },
                },
            },
        });

        return plan;
    });
});

// ── Get today's route plan for current user ──────────────────────────

export const getTodayRoutePlan = withTenant(async function getTodayRoutePlan() {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const userId = session.user.id;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const plan = await prisma.salesRoutePlan.findUnique({
            where: {
                date_userId: {
                    date: today,
                    userId,
                },
            },
            include: {
                items: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
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

        return plan;
    });
});

// ── List route plans (admin view — filter by date range + rep) ──────

export const listRoutePlans = withTenant(
    async function listRoutePlans(filters: {
        startDate?: string;
        endDate?: string;
        userId?: string;
    }) {
        return safeAction(async () => {
            await requireSalesAccess();

            const where: Record<string, unknown> = {};
            if (filters.startDate || filters.endDate) {
                where.date = {};
                if (filters.startDate) {
                    (where.date as Record<string, unknown>).gte = new Date(
                        filters.startDate,
                    );
                }
                if (filters.endDate) {
                    (where.date as Record<string, unknown>).lte = new Date(
                        filters.endDate,
                    );
                }
            }
            if (filters.userId) {
                where.userId = filters.userId;
            }

            const plans = await prisma.salesRoutePlan.findMany({
                where,
                include: {
                    items: {
                        orderBy: { sortOrder: 'asc' },
                        include: {
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
                    user: {
                        select: { id: true, name: true },
                    },
                },
                orderBy: { date: 'desc' },
                take: 50,
            });

            return plans;
        });
    },
);

// ── Create route plan ───────────────────────────────────────────────

export const createRoutePlan = withTenant(async function createRoutePlan(
    data: CreateRoutePlanInput,
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const userId = session.user.id;

        const { plan, retainedCount } = await prisma.$transaction((tx) =>
            upsertRoutePlanWithGuard(tx, {
                date: new Date(data.date),
                userId: data.userId,
                createdBy: userId,
                items: data.items,
            }),
        );

        await logActivity({
            userId,
            action: 'ROUTE_PLAN_CREATED',
            entityType: 'SalesRoutePlan',
            entityId: plan.id,
            details: `Rute ${data.date} untuk ${data.userId}: ${data.items.length} toko${retainedSuffix(retainedCount)}`,
        });

        revalidatePath('/sales/routes');
        revalidatePath('/field/sales');
        return plan;
    });
});

// ── Publish route plan (DRAFT → PUBLISHED) ──────────────────────────

export const publishRoutePlan = withTenant(async function publishRoutePlan(
    id: string,
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const userId = session.user.id;

        const plan = await prisma.salesRoutePlan.findUnique({ where: { id } });
        if (!plan) throw new NotFoundError('Route plan tidak ditemukan');

        const updated = await prisma.salesRoutePlan.update({
            where: { id },
            data: { status: 'PUBLISHED' },
            include: ROUTE_PLAN_INCLUDE,
        });

        await logActivity({
            userId,
            action: 'ROUTE_PLAN_PUBLISHED',
            entityType: 'SalesRoutePlan',
            entityId: id,
            details: `Rute ${plan.date.toISOString().split('T')[0]} dipublikasikan`,
        });

        revalidatePath('/sales/routes');
        revalidatePath('/field/sales');
        return updated;
    });
});

// ── Update route plan items ─────────────────────────────────────────

export const updateRoutePlanItems = withTenant(
    async function updateRoutePlanItems(data: UpdateRoutePlanInput) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const userId = session.user.id;

            const { updated, retainedCount } = await prisma.$transaction(
                async (tx) => {
                    const plan = await tx.salesRoutePlan.findUnique({
                        where: { id: data.id },
                    });
                    if (!plan)
                        throw new NotFoundError('Route plan tidak ditemukan');

                    // R2 guard: item bervisit pada plan PUBLISHED dipertahankan.
                    const { retainedCount: retained } =
                        await reconcileRoutePlanItems(
                            tx,
                            plan.id,
                            plan.status,
                            data.items,
                        );

                    const result = await tx.salesRoutePlan.update({
                        where: { id: data.id },
                        data: data.status ? { status: data.status } : {},
                        include: ROUTE_PLAN_INCLUDE,
                    });
                    return { updated: result, retainedCount: retained };
                },
            );

            await logActivity({
                userId,
                action: 'ROUTE_PLAN_UPDATED',
                entityType: 'SalesRoutePlan',
                entityId: data.id,
                details: `Rute diperbarui: ${data.items.length} toko${retainedSuffix(retainedCount)}`,
            });

            revalidatePath('/sales/routes');
            revalidatePath('/field/sales');
            return updated;
        });
    },
);

// ── Delete route plan ───────────────────────────────────────────────

export const deleteRoutePlan = withTenant(async function deleteRoutePlan(
    id: string,
) {
    return safeAction(async () => {
        const session = await requireSalesApprover();
        const userId = session.user.id;

        const plan = await prisma.salesRoutePlan.findUnique({ where: { id } });
        if (!plan) throw new NotFoundError('Route plan tidak ditemukan');

        await prisma.salesRoutePlan.delete({ where: { id } });

        await logActivity({
            userId,
            action: 'ROUTE_PLAN_DELETED',
            entityType: 'SalesRoutePlan',
            entityId: id,
            details: `Rute ${plan.date.toISOString().split('T')[0]} dihapus`,
        });

        revalidatePath('/sales/routes');
        revalidatePath('/field/sales');
        return { success: true };
    });
});

// ── Copy last week (same weekday) ─────────────────────────────────

export const copyLastWeekRoute = withTenant(async function copyLastWeekRoute(
    date: string,
    userId: string,
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const actorId = session.user.id;

        const targetDate = new Date(date);
        const lastWeek = new Date(targetDate);
        lastWeek.setDate(lastWeek.getDate() - 7);

        const lastWeekPlan = await prisma.salesRoutePlan.findUnique({
            where: {
                date_userId: { date: lastWeek, userId },
            },
            include: { items: { orderBy: { sortOrder: 'asc' } } },
        });

        if (!lastWeekPlan || lastWeekPlan.items.length === 0) {
            throw new NotFoundError('Rute minggu lalu tidak ditemukan');
        }

        const sourceItems: RoutePlanItemInput[] = lastWeekPlan.items.map(
            (item, idx) => ({
                customerId: item.customerId,
                sortOrder: idx + 1,
            }),
        );

        const { plan, retainedCount } = await prisma.$transaction((tx) =>
            upsertRoutePlanWithGuard(tx, {
                date: targetDate,
                userId,
                createdBy: actorId,
                items: sourceItems,
            }),
        );

        await logActivity({
            userId: actorId,
            action: 'ROUTE_PLAN_COPIED',
            entityType: 'SalesRoutePlan',
            entityId: plan.id,
            details: `Salin rute minggu lalu ke ${date}: ${lastWeekPlan.items.length} toko${retainedSuffix(retainedCount)}`,
        });

        revalidatePath('/sales/routes');
        revalidatePath('/field/sales');
        return plan;
    });
});

// ── Import from Excel (parse client-side, send customerCodes) ───────

export const importRouteExcel = withTenant(
    async function importRouteExcel(data: {
        date: string;
        userId: string;
        customerCodes: string[];
    }) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const userId = session.user.id;

            const customers = await prisma.customer.findMany({
                where: {
                    code: { in: data.customerCodes },
                    isActive: true,
                },
                select: { id: true, code: true },
            });

            const codeToId = new Map(customers.map((c) => [c.code, c.id]));
            const items: RoutePlanItemInput[] = [];

            for (const code of data.customerCodes) {
                const id = codeToId.get(code);
                if (id) {
                    items.push({ customerId: id, sortOrder: items.length + 1 });
                }
            }

            if (items.length === 0) {
                throw new NotFoundError(
                    'Tidak ada customer yang cocok dari file Excel',
                );
            }

            const { plan, retainedCount } = await prisma.$transaction((tx) =>
                upsertRoutePlanWithGuard(tx, {
                    date: new Date(data.date),
                    userId: data.userId,
                    createdBy: userId,
                    items,
                }),
            );

            await logActivity({
                userId,
                action: 'ROUTE_PLAN_IMPORTED',
                entityType: 'SalesRoutePlan',
                entityId: plan.id,
                details: `Import Excel: ${items.length} toko dari ${data.customerCodes.length} kode${retainedSuffix(retainedCount)}`,
            });

            revalidatePath('/sales/routes');
            revalidatePath('/field/sales');
            return plan;
        });
    },
);

// ── Nearest-neighbor route optimization ────────────────────────────

export const optimizeRouteNearestNeighbor = withTenant(
    async function optimizeRouteNearestNeighbor(id: string) {
        return safeAction(async () => {
            await requireSalesAccess();

            const plan = await prisma.salesRoutePlan.findUnique({
                where: { id },
                include: {
                    items: {
                        orderBy: { sortOrder: 'asc' },
                        include: {
                            customer: {
                                select: {
                                    id: true,
                                    latitude: true,
                                    longitude: true,
                                },
                            },
                        },
                    },
                },
            });
            if (!plan) throw new NotFoundError('Route plan tidak ditemukan');

            const allItems = plan.items;
            const withGps = allItems.filter(
                (i) =>
                    i.customer.latitude != null && i.customer.longitude != null,
            );
            const withoutGps = allItems.filter(
                (i) =>
                    i.customer.latitude == null || i.customer.longitude == null,
            );

            if (withGps.length <= 1) {
                const finalOrder = [...withGps, ...withoutGps];
                await prisma.$transaction(
                    finalOrder.map((item, i) =>
                        prisma.salesRoutePlanItem.update({
                            where: { id: item.id },
                            data: { sortOrder: i + 1 },
                        }),
                    ),
                );
                revalidatePath('/sales/routes');
                revalidatePath('/field/sales');
                return {
                    ...plan,
                    orderedCustomerIds: finalOrder.map((i) => i.customerId),
                };
            }

            // Nearest-neighbor from first item
            const sorted: typeof withGps = [withGps[0]];
            const remaining = withGps.slice(1);

            while (remaining.length > 0) {
                const last = sorted[sorted.length - 1];
                const lastLat = Number(last.customer.latitude);
                const lastLng = Number(last.customer.longitude);

                let bestIdx = 0;
                let bestDist = Infinity;
                for (let i = 0; i < remaining.length; i++) {
                    const d = haversineDistance(
                        lastLat,
                        lastLng,
                        Number(remaining[i].customer.latitude!),
                        Number(remaining[i].customer.longitude!),
                    );
                    if (d < bestDist) {
                        bestDist = d;
                        bestIdx = i;
                    }
                }
                sorted.push(remaining[bestIdx]);
                remaining.splice(bestIdx, 1);
            }

            // Append customers without GPS after optimized ones
            const finalOrder = [...sorted, ...withoutGps];

            // Reassign sortOrder atomically for all items
            await prisma.$transaction(
                finalOrder.map((item, i) =>
                    prisma.salesRoutePlanItem.update({
                        where: { id: item.id },
                        data: { sortOrder: i + 1 },
                    }),
                ),
            );

            revalidatePath('/sales/routes');
            revalidatePath('/field/sales');
            return {
                ...plan,
                orderedCustomerIds: finalOrder.map((i) => i.customerId),
            };
        });
    },
);

// ── Compliance KPI: EC stats for a rep on a date ──────────────────

export const getRouteComplianceStats = withTenant(
    async function getRouteComplianceStats(date: string, userId: string) {
        return safeAction(async () => {
            await requireSalesAccess();

            const planDate = new Date(date);
            const plan = await prisma.salesRoutePlan.findUnique({
                where: { date_userId: { date: planDate, userId } },
                include: { items: true },
            });

            if (!plan) {
                return {
                    assigned: 0,
                    visited: 0,
                    extraCalls: 0,
                    compliance: 0,
                };
            }

            const assigned = plan.items.length;
            const visited = plan.items.filter(
                (i) => i.status === 'COMPLETED' || i.status === 'VISITING',
            ).length;
            const extraCalls = plan.items.filter((i) => i.isExtraCall).length;

            return {
                assigned,
                visited,
                extraCalls,
                compliance: calculateComplianceRate({
                    assigned,
                    visited,
                    extraCalls,
                }),
            };
        });
    },
);

// ── Copy from any date (template) ────────────────────────────────

export const copyRouteFromDate = withTenant(async function copyRouteFromDate(
    fromDate: string,
    toDate: string,
    userId: string,
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const actorId = session.user.id;

        const sourceDate = new Date(fromDate);
        const targetDate = new Date(toDate);

        const sourcePlan = await prisma.salesRoutePlan.findUnique({
            where: {
                date_userId: { date: sourceDate, userId },
            },
            include: { items: { orderBy: { sortOrder: 'asc' } } },
        });

        if (!sourcePlan || sourcePlan.items.length === 0) {
            throw new NotFoundError('Rute sumber tidak ditemukan atau kosong');
        }

        const sourceItems: RoutePlanItemInput[] = sourcePlan.items.map(
            (item, idx) => ({
                customerId: item.customerId,
                sortOrder: idx + 1,
            }),
        );

        const { plan, retainedCount } = await prisma.$transaction((tx) =>
            upsertRoutePlanWithGuard(tx, {
                date: targetDate,
                userId,
                createdBy: actorId,
                items: sourceItems,
            }),
        );

        await logActivity({
            userId: actorId,
            action: 'ROUTE_PLAN_COPIED',
            entityType: 'SalesRoutePlan',
            entityId: plan.id,
            details: `Salin rute dari ${fromDate} ke ${toDate}: ${sourcePlan.items.length} toko${retainedSuffix(retainedCount)}`,
        });

        revalidatePath('/sales/routes');
        revalidatePath('/field/sales');
        return plan;
    });
});

// ── List recent dates with routes (for template picker) ──────────

export const listRecentRouteDates = withTenant(
    async function listRecentRouteDates(userId?: string) {
        return safeAction(async () => {
            await requireSalesAccess();

            const where: Record<string, unknown> = {};
            if (userId) where.userId = userId;

            const plans = await prisma.salesRoutePlan.findMany({
                where,
                select: {
                    date: true,
                    userId: true,
                    _count: { select: { items: true } },
                    user: { select: { name: true } },
                },
                orderBy: { date: 'desc' },
                take: 14,
            });

            // Deduplicate by date (keep first per date)
            const seen = new Set<string>();
            const unique = plans.filter((p) => {
                const key = p.date.toISOString().split('T')[0];
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            return unique.map((p) => ({
                date: p.date,
                userId: p.userId,
                userName: p.user.name ?? 'Unknown',
                itemCount: p._count.items,
            }));
        });
    },
);

// ── Fetch server visits (for merge with local) ─────────────────────

export const getServerVisits = withTenant(async function getServerVisits(
    date?: string,
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const userId = session.user.id;

        const where: Record<string, unknown> = { userId };
        if (date) {
            const d = new Date(date);
            const nextDay = new Date(d);
            nextDay.setDate(nextDay.getDate() + 1);
            where.checkInTime = { gte: d, lt: nextDay };
        }

        const visits = await prisma.salesVisit.findMany({
            where,
            include: {
                customer: { select: { id: true, name: true } },
            },
            orderBy: { checkInTime: 'desc' },
            take: 50,
        });

        return visits.map((v) => ({
            id: v.id,
            customerId: v.customerId,
            customerName: v.customer?.name ?? '-',
            checkInTime: v.checkInTime.toISOString(),
            checkOutTime: v.checkOutTime.toISOString(),
            durationSeconds: v.durationSeconds,
            distance: v.distance,
            notes: v.notes,
            photoUrl: v.photoUrl,
            synced: true,
            isExtraCall: v.isExtraCall,
            extraReason: v.extraReason,
            reviewStatus: v.reviewStatus,
        }));
    });
});

// ── Weekly board (Papan Mingguan): cakupan, overdue, bentrok ────────

export const getRouteWeekBoard = withTenant(async function getRouteWeekBoard(
    weekStart: string,
    userIds: string[],
) {
    return safeAction(async () => {
        await requireSalesAccess();

        const board = await getWeekBoard({
            weekStart: new Date(weekStart),
            userIds,
        });

        return serializeData(board);
    });
});

// ── Bulk publish: semua rute DRAFT dalam satu minggu → PUBLISHED ────

export const publishWeekRoutes = withTenant(async function publishWeekRoutes(
    weekStart: string,
    userIds: string[],
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const actorId = session.user.id;

        if (userIds.length === 0) {
            return { count: 0 };
        }

        const dates = getWeekDates(new Date(weekStart));
        const rangeEnd = new Date(dates[dates.length - 1]);
        rangeEnd.setUTCHours(23, 59, 59, 999);

        const result = await prisma.salesRoutePlan.updateMany({
            where: {
                userId: { in: userIds },
                date: { gte: dates[0], lte: rangeEnd },
                status: 'DRAFT',
            },
            data: { status: 'PUBLISHED' },
        });

        if (result.count > 0) {
            await logActivity({
                userId: actorId,
                action: 'ROUTE_PLAN_PUBLISHED',
                entityType: 'SalesRoutePlan',
                entityId: `week:${weekStart}`,
                details: `Terbitkan ${result.count} rute DRAFT pada minggu ${weekStart}`,
            });
        }

        revalidatePath('/sales/routes');
        revalidatePath('/field/sales');
        return { count: result.count };
    });
});
