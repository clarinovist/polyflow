import type { ProductionCost } from '@/services/accounting/costing-service';
import type { EnrichedProductionCost } from '@/lib/utils/hpp-report';
import { getWibMonthBounds, toBusinessDateString } from '@/lib/utils/timezone';

export const HPP_SNAPSHOT_TOLERANCE_RUPIAH = 1;

export interface HppSnapshotOrder {
    productionOrderId: string;
    orderNumber?: string;
    totalCost: number;
}

export interface HppPeriodSnapshot {
    version: 1;
    computedAt: string;
    totalCogm: number;
    totalQuantity: number;
    orderCount: number;
    orders: HppSnapshotOrder[];
}

export interface HppPeriodLockInfo {
    lockedAt: string;
    lockedByName: string | null;
    notes: string | null;
    snapshot: HppPeriodSnapshot | null;
}

export type HppOrderChangeKind = 'CHANGED' | 'ADDED' | 'REMOVED';

export interface HppOrderDiff {
    productionOrderId: string;
    orderNumber: string;
    kind: HppOrderChangeKind;
    lockedCost: number | null;
    currentCost: number | null;
    deltaCost: number;
}

export interface HppLockComparison {
    status: 'MISSING_SNAPSHOT' | 'UNCHANGED' | 'CHANGED';
    changed: boolean;
    lockedTotalCogm: number | null;
    currentTotalCogm: number;
    deltaCogm: number;
    lockedQuantity: number | null;
    currentQuantity: number;
    lockedOrderCount: number | null;
    currentOrderCount: number;
    orderChanges: HppOrderDiff[];
}

export type HppOrderCostInput =
    | {
          productionOrderId: string;
          orderNumber?: string;
          totalCost: number;
          quantityProduced?: number;
      }
    | {
          orderId: string;
          orderNumber?: string;
          totalCost: number;
          quantity?: number;
      };

export type HppPeriodSummaryInput =
    | ReadonlyArray<HppOrderCostInput>
    | {
          summary: {
              totalCogm: number;
              totalQuantity: number;
              orderCount: number;
          };
          orders: ReadonlyArray<HppOrderCostInput>;
      }
    | {
          totalCogm: number;
          totalQuantity: number;
          orderCount: number;
          orders: ReadonlyArray<HppOrderCostInput>;
      };

export interface HppOrderWithBom {
    id: string;
    bom: {
        id: string;
        name: string;
        category: string | null;
        productVariant: {
            name: string;
            skuCode: string | null;
            standardCost: unknown;
            product: { name: string } | null;
        } | null;
    } | null;
}

export function resolveHppPeriodBounds(referenceDate: Date = new Date()): {
    year: number;
    month: number;
    start: Date;
    end: Date;
} {
    const dateStr = toBusinessDateString(referenceDate);
    const [year, month] = dateStr.split('-').map(Number);
    const { start, end } = getWibMonthBounds(year, month);
    return { year, month, start, end };
}

function normalizeOrderEntry(item: HppOrderCostInput): {
    productionOrderId: string;
    orderNumber?: string;
    totalCost: number;
    quantity: number;
} {
    if ('productionOrderId' in item) {
        return {
            productionOrderId: item.productionOrderId,
            orderNumber: item.orderNumber,
            totalCost: Number(item.totalCost),
            quantity: Number(item.quantityProduced ?? 0),
        };
    }
    return {
        productionOrderId: item.orderId,
        orderNumber: item.orderNumber,
        totalCost: Number(item.totalCost),
        quantity: Number(item.quantity ?? 0),
    };
}

export function summarizeHppPeriod(input: HppPeriodSummaryInput): {
    totalCogm: number;
    totalQuantity: number;
    orderCount: number;
    orders: HppSnapshotOrder[];
} {
    const rawOrders: ReadonlyArray<HppOrderCostInput> =
        'orders' in input ? input.orders : input;
    const normalized = rawOrders.map(normalizeOrderEntry);

    const orders: HppSnapshotOrder[] = normalized
        .map((o) => ({
            productionOrderId: o.productionOrderId,
            ...(o.orderNumber ? { orderNumber: o.orderNumber } : {}),
            totalCost: o.totalCost,
        }))
        .sort((a, b) =>
            (a.orderNumber ?? a.productionOrderId).localeCompare(
                b.orderNumber ?? b.productionOrderId,
            ),
        );

    if ('summary' in input) {
        return {
            totalCogm: input.summary.totalCogm,
            totalQuantity: input.summary.totalQuantity,
            orderCount: input.summary.orderCount,
            orders,
        };
    }

    if ('totalCogm' in input) {
        return {
            totalCogm: input.totalCogm,
            totalQuantity: input.totalQuantity,
            orderCount: input.orderCount,
            orders,
        };
    }

    return {
        totalCogm: normalized.reduce((sum, o) => sum + o.totalCost, 0),
        totalQuantity: normalized.reduce((sum, o) => sum + o.quantity, 0),
        orderCount: normalized.length,
        orders,
    };
}

export function buildHppPeriodSnapshot(
    input: HppPeriodSummaryInput,
    computedAt: Date | string = new Date(),
): HppPeriodSnapshot {
    const summary = summarizeHppPeriod(input);
    return {
        version: 1,
        computedAt:
            typeof computedAt === 'string'
                ? computedAt
                : computedAt.toISOString(),
        totalCogm: summary.totalCogm,
        totalQuantity: summary.totalQuantity,
        orderCount: summary.orderCount,
        orders: summary.orders,
    };
}

export function parseHppPeriodSnapshot(
    value: unknown,
): HppPeriodSnapshot | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    if (
        candidate.version !== 1 ||
        typeof candidate.computedAt !== 'string' ||
        typeof candidate.totalCogm !== 'number' ||
        !Number.isFinite(candidate.totalCogm) ||
        typeof candidate.totalQuantity !== 'number' ||
        !Number.isFinite(candidate.totalQuantity) ||
        typeof candidate.orderCount !== 'number' ||
        !Number.isFinite(candidate.orderCount) ||
        !Array.isArray(candidate.orders)
    ) {
        return null;
    }

    const orders: HppSnapshotOrder[] = [];
    for (const entry of candidate.orders) {
        if (!entry || typeof entry !== 'object') return null;
        const row = entry as Record<string, unknown>;
        if (
            typeof row.productionOrderId !== 'string' ||
            typeof row.totalCost !== 'number' ||
            !Number.isFinite(row.totalCost)
        ) {
            return null;
        }
        orders.push({
            productionOrderId: row.productionOrderId,
            ...(typeof row.orderNumber === 'string'
                ? { orderNumber: row.orderNumber }
                : {}),
            totalCost: row.totalCost,
        });
    }

    return {
        version: 1,
        computedAt: candidate.computedAt,
        totalCogm: candidate.totalCogm,
        totalQuantity: candidate.totalQuantity,
        orderCount: candidate.orderCount,
        orders,
    };
}

export function compareHppPeriodSnapshot(
    snapshot: HppPeriodSnapshot | null | undefined,
    liveInput: HppPeriodSummaryInput,
): HppLockComparison {
    const live = summarizeHppPeriod(liveInput);

    if (!snapshot) {
        return {
            status: 'MISSING_SNAPSHOT',
            changed: false,
            lockedTotalCogm: null,
            currentTotalCogm: live.totalCogm,
            deltaCogm: 0,
            lockedQuantity: null,
            currentQuantity: live.totalQuantity,
            lockedOrderCount: null,
            currentOrderCount: live.orderCount,
            orderChanges: [],
        };
    }

    const lockedMap = new Map<string, HppSnapshotOrder>();
    for (const order of snapshot.orders) {
        lockedMap.set(order.productionOrderId, order);
    }

    const liveMap = new Map<string, HppSnapshotOrder>();
    for (const order of live.orders) {
        liveMap.set(order.productionOrderId, order);
    }

    const orderChanges: HppOrderDiff[] = [];

    for (const [id, lockedOrder] of lockedMap) {
        const liveOrder = liveMap.get(id);
        if (!liveOrder) {
            orderChanges.push({
                productionOrderId: id,
                orderNumber: lockedOrder.orderNumber ?? id,
                kind: 'REMOVED',
                lockedCost: lockedOrder.totalCost,
                currentCost: null,
                deltaCost: -lockedOrder.totalCost,
            });
            continue;
        }

        const deltaCost = liveOrder.totalCost - lockedOrder.totalCost;
        if (Math.abs(deltaCost) > HPP_SNAPSHOT_TOLERANCE_RUPIAH) {
            orderChanges.push({
                productionOrderId: id,
                orderNumber:
                    liveOrder.orderNumber ?? lockedOrder.orderNumber ?? id,
                kind: 'CHANGED',
                lockedCost: lockedOrder.totalCost,
                currentCost: liveOrder.totalCost,
                deltaCost,
            });
        }
    }

    for (const [id, liveOrder] of liveMap) {
        if (!lockedMap.has(id)) {
            orderChanges.push({
                productionOrderId: id,
                orderNumber: liveOrder.orderNumber ?? id,
                kind: 'ADDED',
                lockedCost: null,
                currentCost: liveOrder.totalCost,
                deltaCost: liveOrder.totalCost,
            });
        }
    }

    orderChanges.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));

    const deltaCogm = live.totalCogm - snapshot.totalCogm;
    const changed =
        Math.abs(deltaCogm) > HPP_SNAPSHOT_TOLERANCE_RUPIAH ||
        orderChanges.length > 0;

    return {
        status: changed ? 'CHANGED' : 'UNCHANGED',
        changed,
        lockedTotalCogm: snapshot.totalCogm,
        currentTotalCogm: live.totalCogm,
        deltaCogm,
        lockedQuantity: snapshot.totalQuantity,
        currentQuantity: live.totalQuantity,
        lockedOrderCount: snapshot.orderCount,
        currentOrderCount: live.orderCount,
        orderChanges,
    };
}

export function enrichHppProductionCosts(
    costs: ReadonlyArray<ProductionCost>,
    ordersWithBom: ReadonlyArray<HppOrderWithBom>,
): EnrichedProductionCost[] {
    const bomLookup = new Map<string, HppOrderWithBom>();
    for (const o of ordersWithBom) {
        bomLookup.set(o.id, o);
    }

    const enriched: EnrichedProductionCost[] = [];
    for (const cost of costs) {
        const orderData = bomLookup.get(cost.productionOrderId);
        if (!orderData?.bom) continue;

        const bom = orderData.bom;
        const variant = bom.productVariant;

        enriched.push({
            ...cost,
            bomId: bom.id,
            bomName: bom.name,
            productName: variant?.product?.name ?? bom.name,
            productSku: variant?.skuCode ?? null,
            category: bom.category ?? null,
            standardCost: Number(variant?.standardCost ?? 0),
        });
    }

    return enriched;
}
