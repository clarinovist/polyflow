import { prisma } from '@/lib/core/prisma';
import { Prisma, SalesOrderStatus, SalesLostReason } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { startOfMonth, endOfMonth } from 'date-fns';
import {
    QUOTATION_STATUSES,
    SALES_LOST_REASON_LABELS,
} from '@/lib/sales/order-phase';
import {
    type FieldSalesActorScope,
    scopedSalesOrderWhere,
} from './field-scope';

// ── Stage definitions ─────────────────────────────────────────────

export const PIPELINE_QUOTATION_STATUSES = QUOTATION_STATUSES;

export const PIPELINE_CONVERTED_STATUSES: readonly SalesOrderStatus[] = [
    'DRAFT',
    'CONFIRMED',
    'IN_PRODUCTION',
    'READY_TO_SHIP',
    'SHIPPED',
    'DELIVERED',
] as const;

export const PIPELINE_ALL_RELEVANT_STATUSES: readonly SalesOrderStatus[] = [
    ...PIPELINE_QUOTATION_STATUSES,
    ...PIPELINE_CONVERTED_STATUSES,
] as const;

export type PipelineStageKey =
    | 'QUOTATION'
    | 'QUOTATION_SENT'
    | 'QUOTATION_REJECTED'
    | 'QUOTATION_EXPIRED'
    | 'CONVERTED';

export type PipelineOrderCard = {
    id: string;
    orderNumber: string;
    status: SalesOrderStatus;
    customerId: string | null;
    customerName: string;
    totalAmount: Decimal;
    createdAt: Date;
    updatedAt: Date;
    ageDays: number;
    lostReason: string | null;
};

export type PipelineStageData = {
    key: PipelineStageKey;
    label: string;
    count: number;
    totalValue: Decimal;
    avgAgeDays: number;
    orders: PipelineOrderCard[];
};

export type LostReasonBucket = {
    reason: SalesLostReason | null;
    label: string;
    count: number;
    totalValue: Decimal;
};

export type PipelineData = {
    startDate: Date;
    endDate: Date;
    stages: PipelineStageData[];
    stagesByKey: Record<PipelineStageKey, PipelineStageData>;
    conversionRate: number;
    lostReasonBreakdown: LostReasonBucket[];
    totalCount: number;
    totalValue: Decimal;
};

const ZERO = new Decimal(0);

const STAGE_LABELS: Record<PipelineStageKey, string> = {
    QUOTATION: 'Penawaran',
    QUOTATION_SENT: 'Terkirim',
    QUOTATION_REJECTED: 'Ditolak',
    QUOTATION_EXPIRED: 'Kadarluarsa',
    CONVERTED: 'Terkonversi',
};

function toDecimal(value: unknown): Decimal {
    if (value == null) return ZERO;
    if (value instanceof Decimal) return value;
    if (typeof value === 'number') return new Decimal(value.toString());
    if (typeof value === 'string') {
        const n = Number(value);
        if (!Number.isFinite(n)) return ZERO;
        return new Decimal(value);
    }
    // duck-typed Decimal with toNumber
    const maybe = value as { toNumber?: () => number; toString?: () => string };
    if (typeof maybe.toNumber === 'function') {
        try {
            const num = maybe.toNumber();
            if (typeof num === 'number' && Number.isFinite(num)) {
                return new Decimal(num.toString());
            }
        } catch {
            // fallthrough
        }
    }
    if (typeof maybe.toString === 'function') {
        try {
            return new Decimal(maybe.toString());
        } catch {
            return ZERO;
        }
    }
    return ZERO;
}

function daysBetween(a: Date, b: Date): number {
    const ms = b.getTime() - a.getTime();
    return ms / (1000 * 60 * 60 * 24);
}

function computeAgeDays(
    key: PipelineStageKey,
    createdAt: Date,
    updatedAt: Date,
    now: Date,
): number {
    // Active quotation: now - createdAt
    // Terminal (REJECTED/EXPIRED/CONVERTED): updatedAt - createdAt
    if (key === 'QUOTATION' || key === 'QUOTATION_SENT') {
        return Math.max(0, daysBetween(createdAt, now));
    }
    return Math.max(0, daysBetween(createdAt, updatedAt));
}

function stageKeyFromStatus(status: SalesOrderStatus): PipelineStageKey | null {
    if (status === 'QUOTATION') return 'QUOTATION';
    if (status === 'QUOTATION_SENT') return 'QUOTATION_SENT';
    if (status === 'QUOTATION_REJECTED') return 'QUOTATION_REJECTED';
    if (status === 'QUOTATION_EXPIRED') return 'QUOTATION_EXPIRED';
    if ((PIPELINE_CONVERTED_STATUSES as readonly string[]).includes(status)) {
        return 'CONVERTED';
    }
    return null;
}

function lostReasonLabel(reason: string | null): string {
    if (!reason) return 'Tidak diketahui';
    return SALES_LOST_REASON_LABELS[reason] ?? reason;
}

export async function getPipelineData(
    scope: FieldSalesActorScope,
    startDate?: Date,
    endDate?: Date,
): Promise<PipelineData> {
    const now = new Date();
    const start = startDate ?? startOfMonth(now);
    const end = endDate ?? endOfMonth(now);

    const scopedWhere = scopedSalesOrderWhere(scope);

    // Build where: scoped + date + status
    const where: Prisma.SalesOrderWhereInput = {
        ...scopedWhere,
        orderDate: {
            gte: start,
            lte: end,
        },
        status: {
            in: [...PIPELINE_ALL_RELEVANT_STATUSES] as SalesOrderStatus[],
        },
    };

    const rows = await prisma.salesOrder.findMany({
        where,
        select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            updatedAt: true,
            customerId: true,
            lostReason: true,
            customer: {
                select: { name: true },
            },
        },
        orderBy: { orderDate: 'desc' },
    });

    // Init stage buckets
    const stageBuckets: Record<
        PipelineStageKey,
        {
            orders: PipelineOrderCard[];
            totalValue: Decimal;
            ageSum: number;
        }
    > = {
        QUOTATION: { orders: [], totalValue: ZERO, ageSum: 0 },
        QUOTATION_SENT: { orders: [], totalValue: ZERO, ageSum: 0 },
        QUOTATION_REJECTED: { orders: [], totalValue: ZERO, ageSum: 0 },
        QUOTATION_EXPIRED: { orders: [], totalValue: ZERO, ageSum: 0 },
        CONVERTED: { orders: [], totalValue: ZERO, ageSum: 0 },
    };

    let grandTotal = ZERO;

    for (const r of rows) {
        const key = stageKeyFromStatus(r.status as SalesOrderStatus);
        if (!key) continue;

        // Exclude legacy internal stock build orders dari CONVERTED
        if (key === 'CONVERTED' && !r.customerId) {
            continue;
        }

        const totalDec = toDecimal(r.totalAmount);
        const age = computeAgeDays(key, r.createdAt, r.updatedAt, now);

        const card: PipelineOrderCard = {
            id: r.id,
            orderNumber: r.orderNumber,
            status: r.status as SalesOrderStatus,
            customerId: r.customerId,
            customerName: r.customer?.name ?? '-',
            totalAmount: totalDec,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            ageDays: age,
            lostReason: (r.lostReason as string | null) ?? null,
        };

        stageBuckets[key].orders.push(card);
        stageBuckets[key].totalValue =
            stageBuckets[key].totalValue.add(totalDec);
        stageBuckets[key].ageSum += age;
        grandTotal = grandTotal.add(totalDec);
    }

    const stages: PipelineStageData[] = (
        Object.keys(stageBuckets) as PipelineStageKey[]
    ).map((k) => {
        const b = stageBuckets[k];
        const count = b.orders.length;
        return {
            key: k,
            label: STAGE_LABELS[k],
            count,
            totalValue: b.totalValue,
            avgAgeDays: count === 0 ? 0 : b.ageSum / count,
            orders: b.orders,
        };
    });

    // Order stages for kanban display: funnel order
    const orderedKeys: PipelineStageKey[] = [
        'QUOTATION',
        'QUOTATION_SENT',
        'CONVERTED',
        'QUOTATION_REJECTED',
        'QUOTATION_EXPIRED',
    ];
    stages.sort(
        (a, b) => orderedKeys.indexOf(a.key) - orderedKeys.indexOf(b.key),
    );

    const stagesByKey = stages.reduce(
        (acc, s) => {
            acc[s.key] = s;
            return acc;
        },
        {} as Record<PipelineStageKey, PipelineStageData>,
    );

    // Conversion rate: converted / (converted+rejected+expired+quotation+quotation_sent)
    const convertedCount = stagesByKey.CONVERTED?.count ?? 0;
    const totalFunnel =
        (stagesByKey.CONVERTED?.count ?? 0) +
        (stagesByKey.QUOTATION_REJECTED?.count ?? 0) +
        (stagesByKey.QUOTATION_EXPIRED?.count ?? 0) +
        (stagesByKey.QUOTATION?.count ?? 0) +
        (stagesByKey.QUOTATION_SENT?.count ?? 0);

    const conversionRate = totalFunnel === 0 ? 0 : convertedCount / totalFunnel;

    // Lost reason breakdown from REJECTED in period
    const rejectedOrders = stagesByKey.QUOTATION_REJECTED?.orders ?? [];
    const reasonMap = new Map<
        string | null,
        { count: number; totalValue: Decimal }
    >();

    for (const o of rejectedOrders) {
        const rKey = o.lostReason ?? null;
        const existing = reasonMap.get(rKey);
        if (existing) {
            existing.count += 1;
            existing.totalValue = existing.totalValue.add(o.totalAmount);
        } else {
            reasonMap.set(rKey, {
                count: 1,
                totalValue: o.totalAmount,
            });
        }
    }

    const lostReasonBreakdown: LostReasonBucket[] = Array.from(
        reasonMap.entries(),
    )
        .map(([reason, v]) => ({
            reason: reason as SalesLostReason | null,
            label: lostReasonLabel(reason),
            count: v.count,
            totalValue: v.totalValue,
        }))
        .sort((a, b) => b.count - a.count);

    const totalCount = stages.reduce((sum, s) => sum + s.count, 0);

    return {
        startDate: start,
        endDate: end,
        stages,
        stagesByKey,
        conversionRate,
        lostReasonBreakdown,
        totalCount,
        totalValue: grandTotal,
    };
}
