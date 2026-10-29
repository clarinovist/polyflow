'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireFinanceAccess, requireFinanceApprover } from '@/lib/auth/finance-access';
import { CostingService } from '@/services/accounting/costing-service';
import {
    aggregateHppReport,
    type HppReportData,
} from '@/lib/utils/hpp-report';
import {
    buildHppPeriodSnapshot,
    enrichHppProductionCosts,
    parseHppPeriodSnapshot,
    resolveHppPeriodBounds,
    type HppPeriodLockInfo,
    type HppPeriodSnapshot,
} from '@/lib/finance/hpp-period-snapshot';
import { getWibMonthBounds } from '@/lib/utils/timezone';
import { logActivity } from '@/lib/tools/audit';

// Narrow cast for PeriodLock.snapshot until `prisma generate` refreshes client types.
interface PeriodLockRowWithSnapshot {
    id: string;
    year: number;
    month: number;
    lockedAt: Date;
    lockedById: string | null;
    notes: string | null;
    snapshot?: unknown;
    lockedBy?: { name: string | null; email: string } | null;
}

interface PeriodLockDelegateWithSnapshot {
    findUnique(args: {
        where: { year_month: { year: number; month: number } };
        include?: { lockedBy: { select: { name: true; email: true } } };
    }): Promise<PeriodLockRowWithSnapshot | null>;
    upsert(args: {
        where: { year_month: { year: number; month: number } };
        create: {
            year: number;
            month: number;
            lockedById?: string | null;
            notes?: string | null;
            snapshot?: unknown;
        };
        update: {
            lockedAt?: Date;
            lockedById?: string | null;
            notes?: string | null;
            snapshot?: unknown;
        };
        include?: { lockedBy: { select: { name: true; email: true } } };
    }): Promise<PeriodLockRowWithSnapshot>;
    deleteMany(args: {
        where: { year: number; month: number };
    }): Promise<{ count: number }>;
}

function periodLockRepo(client: {
    periodLock: unknown;
}): PeriodLockDelegateWithSnapshot {
    return client.periodLock as PeriodLockDelegateWithSnapshot;
}

function formatPeriodLock(
    row: PeriodLockRowWithSnapshot | null | undefined,
    fallback?: {
        snapshot: HppPeriodSnapshot;
        lockedByName: string | null;
        notes: string | null;
    },
): HppPeriodLockInfo | null {
    if (!row && !fallback) return null;
    const lockedAt =
        row?.lockedAt instanceof Date
            ? row.lockedAt.toISOString()
            : typeof row?.lockedAt === 'string'
              ? row.lockedAt
              : new Date().toISOString();

    return {
        lockedAt,
        lockedByName:
            row?.lockedBy?.name ?? fallback?.lockedByName ?? null,
        notes: row?.notes ?? fallback?.notes ?? null,
        snapshot:
            parseHppPeriodSnapshot(row?.snapshot) ??
            fallback?.snapshot ??
            null,
    };
}

export const getHppReportData = withTenant(async function getHppReportData(
    startDate?: Date,
    _endDate?: Date,
) {
    return safeAction(async () => {
        await requireFinanceAccess();

        const { year, month, start, end } = resolveHppPeriodBounds(
            startDate ?? new Date(),
        );

        const [{ costs, conversion }, lockRow] = await Promise.all([
            CostingService.getPeriodCostReport(start, end),
            periodLockRepo(prisma).findUnique({
                where: { year_month: { year, month } },
                include: {
                    lockedBy: { select: { name: true, email: true } },
                },
            }),
        ]);

        const lock = formatPeriodLock(lockRow);

        if (costs.length === 0) {
            return {
                ...aggregateHppReport([], conversion),
                lock,
            } satisfies HppReportData;
        }

        const orderIds = costs.map((c) => c.productionOrderId);
        const ordersWithBom = await prisma.productionOrder.findMany({
            where: { id: { in: orderIds } },
            select: {
                id: true,
                bom: {
                    select: {
                        id: true,
                        name: true,
                        category: true,
                        productVariant: {
                            select: {
                                name: true,
                                skuCode: true,
                                standardCost: true,
                                product: { select: { name: true } },
                            },
                        },
                    },
                },
            },
        });

        const enriched = enrichHppProductionCosts(costs, ordersWithBom);

        return {
            ...aggregateHppReport(enriched, conversion),
            lock,
        } satisfies HppReportData;
    });
});

export const lockPeriod = withTenant(async function lockPeriod(
    year: number,
    month: number,
    notes?: string,
) {
    return safeAction(async () => {
        const session = await requireFinanceApprover();
        const { start, end } = getWibMonthBounds(year, month);
        const periodKey = `${year}-${String(month).padStart(2, '0')}`;

        const { costs } = await CostingService.getPeriodCostReport(
            start,
            end,
        );
        const snapshot = buildHppPeriodSnapshot(costs);

        const lock = await prisma.$transaction(async (tx) => {
            const saved = await periodLockRepo(tx).upsert({
                where: { year_month: { year, month } },
                create: {
                    year,
                    month,
                    lockedById: session.user.id,
                    notes,
                    snapshot,
                },
                update: {
                    lockedAt: new Date(),
                    lockedById: session.user.id,
                    notes,
                    snapshot,
                },
                include: {
                    lockedBy: { select: { name: true, email: true } },
                },
            });

            await logActivity({
                userId: session.user.id,
                action: 'LOCK_HPP_PERIOD',
                entityType: 'PeriodLock',
                entityId: saved?.id ?? periodKey,
                details: `Locked HPP period ${periodKey}`,
                changes: {
                    year,
                    month,
                    notes: notes ?? null,
                    snapshot,
                },
                tx,
            });

            return formatPeriodLock(saved, {
                snapshot,
                lockedByName: session.user.name ?? null,
                notes: notes ?? null,
            });
        });

        return { success: true, lock };
    });
});

export const unlockPeriod = withTenant(async function unlockPeriod(
    year: number,
    month: number,
) {
    return safeAction(async () => {
        const session = await requireFinanceApprover();
        const periodKey = `${year}-${String(month).padStart(2, '0')}`;

        await prisma.$transaction(async (tx) => {
            const existing = await periodLockRepo(tx).findUnique({
                where: { year_month: { year, month } },
            });

            await logActivity({
                userId: session.user.id,
                action: 'UNLOCK_HPP_PERIOD',
                entityType: 'PeriodLock',
                entityId: existing?.id ?? periodKey,
                details: `Unlocked HPP period ${periodKey}`,
                changes: {
                    year,
                    month,
                    snapshot: existing?.snapshot ?? null,
                },
                tx,
            });

            await periodLockRepo(tx).deleteMany({ where: { year, month } });
        });

        return { success: true };
    });
});
