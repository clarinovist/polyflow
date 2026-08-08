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
    // `id`/`createdById`/`createdAt`/`updatedAt` null artinya baris ini murni
    // dari anggota tim (T3) — belum ada SalesTarget yang dibuat untuknya.
    id: string | null;
    userId: string;
    periodYear: number;
    periodMonth: number;
    revenueTarget: Decimal;
    visitTarget: number | null;
    orderTarget: number | null;
    notes: string | null;
    createdById: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    userName: string | null;
    revenueActual: Decimal;
    revenueAchievementPercent: number | null;
    visitActual: number;
    visitAchievementPercent: number | null;
    orderActual: number;
    orderAchievementPercent: number | null;
};

export type TargetContextEntry = {
    userId: string;
    prevMonthActual: Decimal;
    avg3MonthActual: Decimal;
    sameMonthLastYearActual: Decimal;
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

/**
 * Anggota tim sales/marketing aktif — sumber baris untuk getTargetsForPeriod
 * (T3), bukan salesTarget.findMany, supaya sales tanpa target tetap muncul
 * dengan realisasinya. Kriteria filter sengaja dicerminkan dari
 * src/actions/sales/sales-team.ts (file itu read-only untuk stream ini —
 * lihat AGENTS.md/plan §0.2 — jadi tidak bisa diekstrak jadi helper bersama
 * tanpa mengeditnya).
 */
async function getActiveSalesTeamUserIds(): Promise<
    { id: string; name: string | null }[]
> {
    return prisma.user.findMany({
        where: {
            isActive: true,
            isSuperAdmin: false,
            OR: [
                { roles: { some: { role: 'SALES' } } },
                { role: 'SALES' },
                { roles: { some: { role: 'MARKETING' } } },
                { role: 'MARKETING' },
            ],
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
}

function periodKey(year: number, month: number): string {
    return `${year}-${month}`;
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

    // T3: sumber baris = anggota tim aktif, bukan salesTarget.findMany —
    // supaya sales tanpa target sama sekali tetap muncul dengan realisasinya.
    const team = await getActiveSalesTeamUserIds();
    if (team.length === 0) return [];

    const userIds = team.map((u) => u.id);

    const targets = await prisma.salesTarget.findMany({
        where: { periodYear, periodMonth, userId: { in: userIds } },
        include: { user: { select: { name: true } } },
    });
    const targetMap = new Map(targets.map((t) => [t.userId, t]));

    const { start, end } = periodRange(periodYear, periodMonth);

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

    // Order actual per user (T2) — dari query `orders` yang sama, tidak
    // menambah query baru. Basis sama dengan revenue: SO non-CANCELLED.
    const orderCountMap = new Map<string, number>();
    for (const o of orders) {
        if (!o.salesRepId) continue;
        orderCountMap.set(
            o.salesRepId,
            (orderCountMap.get(o.salesRepId) ?? 0) + 1,
        );
    }

    return team.map((member) => {
        const t = targetMap.get(member.id);
        const revenueTarget =
            (t?.revenueTarget as unknown as Decimal | undefined) ??
            new Decimal(0);
        const revenueActual =
            revenueResult.attributed.get(member.id) ?? new Decimal(0);
        const visitActual = visitCountMap.get(member.id) ?? 0;
        const orderActual = orderCountMap.get(member.id) ?? 0;

        return {
            id: t?.id ?? null,
            userId: member.id,
            periodYear,
            periodMonth,
            revenueTarget,
            visitTarget: t?.visitTarget ?? null,
            orderTarget: t?.orderTarget ?? null,
            notes: t?.notes ?? null,
            createdById: t?.createdById ?? null,
            createdAt: t?.createdAt ?? null,
            updatedAt: t?.updatedAt ?? null,
            userName: t?.user?.name ?? member.name,
            revenueActual,
            revenueAchievementPercent: calcAchievementPercent(
                revenueActual,
                revenueTarget,
            ),
            visitActual,
            visitAchievementPercent: calcIntAchievementPercent(
                visitActual,
                t?.visitTarget ?? null,
            ),
            orderActual,
            orderAchievementPercent: calcIntAchievementPercent(
                orderActual,
                t?.orderTarget ?? null,
            ),
        };
    });
}

// ── Konteks historis (T4): prevMonth / avg3Month / sameMonthLastYear ──
// Satu query SO untuk seluruh rentang, di-bucket di memori — bukan N query
// per user (lihat plan §4.3 Step T-3).

export async function getTargetContext(
    userIds: string[],
    periodYear: number,
    periodMonth: number,
): Promise<Map<string, TargetContextEntry>> {
    validatePeriod(periodYear, periodMonth);

    const result = new Map<string, TargetContextEntry>();
    if (!userIds || userIds.length === 0) return result;

    const prev1 = prevPeriod(periodYear, periodMonth);
    const prev2 = prevPeriod(prev1.year, prev1.month);
    const prev3 = prevPeriod(prev2.year, prev2.month);
    const sameMonthLastYear = { year: periodYear - 1, month: periodMonth };

    const rangeStart = periodRange(
        sameMonthLastYear.year,
        sameMonthLastYear.month,
    ).start;
    const rangeEnd = periodRange(prev1.year, prev1.month).end;

    const orders = await prisma.salesOrder.findMany({
        where: {
            salesRepId: { in: userIds },
            orderDate: { gte: rangeStart, lte: rangeEnd },
            status: { not: 'CANCELLED' },
        },
        select: { salesRepId: true, totalAmount: true, orderDate: true },
    });

    const prevKey = periodKey(prev1.year, prev1.month);
    const p2Key = periodKey(prev2.year, prev2.month);
    const p3Key = periodKey(prev3.year, prev3.month);
    const lastYearKey = periodKey(
        sameMonthLastYear.year,
        sameMonthLastYear.month,
    );

    const sums = new Map<string, Decimal>();
    const addSum = (key: string, amount: Decimal) => {
        sums.set(key, (sums.get(key) ?? new Decimal(0)).add(amount));
    };

    for (const o of orders) {
        if (!o.salesRepId) continue;
        const k = periodKey(
            o.orderDate.getFullYear(),
            o.orderDate.getMonth() + 1,
        );
        const amount = o.totalAmount as unknown as Decimal;

        if (k === prevKey) addSum(`${o.salesRepId}|prev`, amount);
        else if (k === p2Key) addSum(`${o.salesRepId}|p2`, amount);
        else if (k === p3Key) addSum(`${o.salesRepId}|p3`, amount);
        else if (k === lastYearKey) addSum(`${o.salesRepId}|lastYear`, amount);
    }

    for (const userId of userIds) {
        const prevMonthActual = sums.get(`${userId}|prev`) ?? new Decimal(0);
        const p2 = sums.get(`${userId}|p2`) ?? new Decimal(0);
        const p3 = sums.get(`${userId}|p3`) ?? new Decimal(0);
        const sameMonthLastYearActual =
            sums.get(`${userId}|lastYear`) ?? new Decimal(0);
        const avg3MonthActual = prevMonthActual.add(p2).add(p3).div(3);

        result.set(userId, {
            userId,
            prevMonthActual,
            avg3MonthActual,
            sameMonthLastYearActual,
        });
    }

    return result;
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
    const orderActual = orders.length;

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
        orderActual,
        orderAchievementPercent: calcIntAchievementPercent(
            orderActual,
            tgt.orderTarget,
        ),
    };
}
