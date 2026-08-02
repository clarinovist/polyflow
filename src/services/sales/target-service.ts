import { prisma } from '@/lib/core/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { ValidationError } from '@/lib/errors/errors';
import {
    calculateSalesOrderRevenueWithReturns,
    isProcessedReturnStatus,
} from '@/lib/sales/revenue-basis';

// ── Types ──────────────────────────────────────────────────────────

export type UpsertTargetInput = {
    userId: string;
    periodYear: number;
    periodMonth: number;
    revenueTarget: number | Decimal;
    visitTarget?: number | null;
    orderTarget?: number | null;
    notes?: string | null;
    createdById?: string | null;
};

export type TargetWithAchievement = {
    id: string;
    userId: string;
    periodYear: number;
    periodMonth: number;
    revenueTarget: Decimal;
    visitTarget: number | null;
    orderTarget: number | null;
    notes: string | null;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
    userName: string | null;
    revenueActual: Decimal;
    revenueAchievementPercent: number | null;
    visitActual: number;
    visitAchievementPercent: number | null;
};

type UpsertResult = {
    target: unknown;
    error: null;
    input: UpsertTargetInput;
};

type UpsertError = {
    target: null;
    error: string;
    input: UpsertTargetInput;
};

export type BulkUpsertResult = {
    successes: UpsertResult[];
    failures: UpsertError[];
};

type CopyResult = {
    created: number;
    skipped: number;
    skippedUserIds: string[];
    errors: { userId: string; message: string }[];
};

// ── Helpers ────────────────────────────────────────────────────────

function toDecimal(v: number | Decimal | null | undefined): Decimal {
    if (v == null) return new Decimal(0);
    if (v instanceof Decimal) return v;
    return new Decimal(v.toString());
}

function validatePeriod(year: number, month: number): void {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new ValidationError(`periodYear tidak valid: ${year}`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new ValidationError(`periodMonth harus 1-12, got: ${month}`);
    }
}

function periodRange(year: number, month: number): { start: Date; end: Date } {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
}

export function prevPeriod(
    year: number,
    month: number,
): { year: number; month: number } {
    if (month === 1) return { year: year - 1, month: 12 };
    return { year, month: month - 1 };
}

function calcAchievementPercent(
    actual: Decimal,
    target: Decimal,
): number | null {
    if (target.isZero()) return null;
    const pct = actual.div(target).mul(100);
    return Number(pct.toFixed(2));
}

function calcIntAchievementPercent(
    actual: number,
    target: number | null | undefined,
): number | null {
    if (target == null || target === 0) return null;
    return Math.round((actual / target) * 10000) / 100;
}

// ── Upsert single ──────────────────────────────────────────────────

export async function upsertTarget(input: UpsertTargetInput) {
    validatePeriod(input.periodYear, input.periodMonth);
    if (!input.userId) throw new ValidationError('userId wajib diisi');

    const revenueTargetDec = toDecimal(input.revenueTarget);

    return prisma.salesTarget.upsert({
        where: {
            userId_periodYear_periodMonth: {
                userId: input.userId,
                periodYear: input.periodYear,
                periodMonth: input.periodMonth,
            },
        },
        update: {
            revenueTarget: revenueTargetDec,
            visitTarget: input.visitTarget ?? undefined,
            orderTarget: input.orderTarget ?? undefined,
            notes: input.notes ?? undefined,
        },
        create: {
            userId: input.userId,
            periodYear: input.periodYear,
            periodMonth: input.periodMonth,
            revenueTarget: revenueTargetDec,
            visitTarget: input.visitTarget ?? null,
            orderTarget: input.orderTarget ?? null,
            notes: input.notes ?? null,
            createdById: input.createdById ?? null,
        },
    });
}

// ── Bulk set — jangan gagal semua kalau 1 error ───────────────────

export async function bulkSetTargets(
    items: UpsertTargetInput[],
): Promise<BulkUpsertResult> {
    if (!items || items.length === 0) return { successes: [], failures: [] };

    const successes: UpsertResult[] = [];
    const failures: UpsertError[] = [];

    // Proses satu per satu agar satu gagal tidak abort yang lain.
    // Gunakan $transaction per item secara independen? Lebih sederhana loop + try.
    for (const item of items) {
        try {
            validatePeriod(item.periodYear, item.periodMonth);
            if (!item.userId) throw new ValidationError('userId wajib diisi');

            const tgt = await upsertTarget(item);
            successes.push({ target: tgt, error: null, input: item });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            failures.push({ target: null, error: msg, input: item });
        }
    }

    return { successes, failures };
}

// ── Copy dari bulan lalu ───────────────────────────────────────────
// ponytail: copy hanya revenueTarget/visitTarget/orderTarget/notes. Jika nanti
// perlu copy per-produk/kategori, tambah model relasi + copy loop di sini.

export async function copyTargetsFromPreviousMonth(
    periodYear: number,
    periodMonth: number,
    createdById: string,
): Promise<CopyResult> {
    validatePeriod(periodYear, periodMonth);

    const prev = prevPeriod(periodYear, periodMonth);

    const prevTargets = await prisma.salesTarget.findMany({
        where: { periodYear: prev.year, periodMonth: prev.month },
    });

    const existing = await prisma.salesTarget.findMany({
        where: { periodYear, periodMonth },
        select: { userId: true },
    });
    const existingSet = new Set(existing.map((r) => r.userId));

    let created = 0;
    let skipped = 0;
    const skippedUserIds: string[] = [];
    const errors: { userId: string; message: string }[] = [];

    for (const t of prevTargets) {
        if (existingSet.has(t.userId)) {
            skipped++;
            skippedUserIds.push(t.userId);
            continue;
        }
        try {
            await prisma.salesTarget.create({
                data: {
                    userId: t.userId,
                    periodYear,
                    periodMonth,
                    revenueTarget: t.revenueTarget,
                    visitTarget: t.visitTarget,
                    orderTarget: t.orderTarget,
                    notes: t.notes,
                    createdById,
                },
            });
            created++;
        } catch (err) {
            errors.push({
                userId: t.userId,
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return { created, skipped, skippedUserIds, errors };
}

// ── Get targets with achievement (basis SALES_ORDER + visit non-REJECTED) ──

export async function getTargetsForPeriod(
    periodYear: number,
    periodMonth: number,
): Promise<TargetWithAchievement[]> {
    validatePeriod(periodYear, periodMonth);

    const targets = await prisma.salesTarget.findMany({
        where: { periodYear, periodMonth },
        include: { user: { select: { name: true } } },
        orderBy: { userId: 'asc' },
    });

    if (targets.length === 0) return [];

    const { start, end } = periodRange(periodYear, periodMonth);
    const userIds = targets.map((t) => t.userId);

    // Revenue actual: query SO dalam periode bulan ini + SalesReturn di periode sama
    // Filter sama dengan revenue-basis: SALES_ORDER basis
    const [orders, returns, visits] = await Promise.all([
        prisma.salesOrder.findMany({
            where: {
                salesRepId: { in: userIds },
                orderDate: { gte: start, lte: end },
                status: { not: 'CANCELLED' },
            },
            select: {
                id: true,
                salesRepId: true,
                totalAmount: true,
                status: true,
            },
        }),
        prisma.salesReturn.findMany({
            where: {
                returnDate: { gte: start, lte: end },
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            include: {
                salesOrder: { select: { salesRepId: true } },
            },
        }),
        prisma.salesVisit.findMany({
            where: {
                userId: { in: userIds },
                checkInTime: { gte: start, lte: end },
                reviewStatus: { not: 'REJECTED' },
            },
            select: { userId: true },
        }),
    ]);

    // Adapt ke shape revenue-basis (pure): SO
    const soRows = orders.map((o) => ({
        id: o.id,
        salesRepId: o.salesRepId,
        totalAmount: o.totalAmount,
        status: o.status,
    }));

    // Returns: resolve salesRepId via salesOrder relation, fallback null
    const retRows = returns
        .filter((r) => isProcessedReturnStatus(r.status))
        .map((r) => ({
            id: r.id,
            salesRepId: r.salesOrder?.salesRepId ?? null,
            totalAmount: r.totalAmount ?? new Decimal(0),
            status: r.status,
        }));

    const revenueResult = calculateSalesOrderRevenueWithReturns(
        soRows,
        retRows,
    );

    // Visit actual per user
    const visitCountMap = new Map<string, number>();
    for (const v of visits) {
        visitCountMap.set(v.userId, (visitCountMap.get(v.userId) ?? 0) + 1);
    }

    return targets.map((t) => {
        const revenueActual =
            revenueResult.attributed.get(t.userId) ?? new Decimal(0);
        const visitActual = visitCountMap.get(t.userId) ?? 0;
        const revenueAchievementPercent = calcAchievementPercent(
            revenueActual,
            t.revenueTarget as unknown as Decimal,
        );
        const visitAchievementPercent = calcIntAchievementPercent(
            visitActual,
            t.visitTarget,
        );

        return {
            id: t.id,
            userId: t.userId,
            periodYear: t.periodYear,
            periodMonth: t.periodMonth,
            revenueTarget: t.revenueTarget as unknown as Decimal,
            visitTarget: t.visitTarget,
            orderTarget: t.orderTarget,
            notes: t.notes,
            createdById: t.createdById,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            userName: t.user?.name ?? null,
            revenueActual,
            revenueAchievementPercent,
            visitActual,
            visitAchievementPercent,
        };
    });
}

// ── Single user view ───────────────────────────────────────────────

export async function getMyTarget(
    userId: string,
    periodYear: number,
    periodMonth: number,
): Promise<TargetWithAchievement | null> {
    validatePeriod(periodYear, periodMonth);
    if (!userId) throw new ValidationError('userId wajib diisi');

    const tgt = await prisma.salesTarget.findUnique({
        where: {
            userId_periodYear_periodMonth: { userId, periodYear, periodMonth },
        },
        include: { user: { select: { name: true } } },
    });

    if (!tgt) return null;

    const { start, end } = periodRange(periodYear, periodMonth);

    const [orders, returns, visitCount] = await Promise.all([
        prisma.salesOrder.findMany({
            where: {
                salesRepId: userId,
                orderDate: { gte: start, lte: end },
                status: { not: 'CANCELLED' },
            },
            select: {
                id: true,
                salesRepId: true,
                totalAmount: true,
                status: true,
            },
        }),
        prisma.salesReturn.findMany({
            where: {
                returnDate: { gte: start, lte: end },
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            include: { salesOrder: { select: { salesRepId: true, id: true } } },
        }),
        prisma.salesVisit.count({
            where: {
                userId,
                checkInTime: { gte: start, lte: end },
                reviewStatus: { not: 'REJECTED' },
            },
        }),
    ]);

    // Filter returns: hanya yang resolved ke salesRepId = userId
    const filteredReturns = returns.filter(
        (r) => r.salesOrder?.salesRepId === userId,
    );

    const soRows = orders.map((o) => ({
        id: o.id,
        salesRepId: o.salesRepId,
        totalAmount: o.totalAmount,
        status: o.status,
    }));

    const retRows = filteredReturns
        .filter((r) => isProcessedReturnStatus(r.status))
        .map((r) => ({
            id: r.id,
            salesRepId: r.salesOrder?.salesRepId ?? null,
            totalAmount: r.totalAmount ?? new Decimal(0),
            status: r.status,
        }));

    const revenueResult = calculateSalesOrderRevenueWithReturns(
        soRows,
        retRows,
    );
    const revenueActual =
        revenueResult.attributed.get(userId) ?? new Decimal(0);

    return {
        id: tgt.id,
        userId: tgt.userId,
        periodYear: tgt.periodYear,
        periodMonth: tgt.periodMonth,
        revenueTarget: tgt.revenueTarget as unknown as Decimal,
        visitTarget: tgt.visitTarget,
        orderTarget: tgt.orderTarget,
        notes: tgt.notes,
        createdById: tgt.createdById,
        createdAt: tgt.createdAt,
        updatedAt: tgt.updatedAt,
        userName: tgt.user?.name ?? null,
        revenueActual,
        revenueAchievementPercent: calcAchievementPercent(
            revenueActual,
            tgt.revenueTarget as unknown as Decimal,
        ),
        visitActual: visitCount,
        visitAchievementPercent: calcIntAchievementPercent(
            visitCount,
            tgt.visitTarget,
        ),
    };
}
