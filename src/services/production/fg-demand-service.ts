import { prisma } from "@/lib/core/prisma";
import {
  ProductType,
  SalesOrderStatus,
  ProductionStatus,
} from "@prisma/client";

export interface FgDemandRow {
  productVariantId: string;
  productName: string;
  variantName: string;
  skuCode: string;
  unit: string;
  /** Σ max(0, soItem.qty − soItem.deliveredQty) across open SOs */
  openDemand: number;
  /** Stock FG across non-scrap locations */
  availableFg: number;
  /** max(0, openDemand − availableFg) */
  needToMake: number;
  /** Σ plannedQuantity of open SPK (BOM.productVariantId = v) */
  openSpkPlanned: number;
  /** max(0, needToMake − openSpkPlanned) */
  uncoveredNeed: number;
  /** Earliest expectedDate from open SOs with residual > 0 */
  earliestDue: Date | null;
  /** Urgency signal based on days to due */
  urgencyHint: "URGENT" | "NORMAL" | "LOW";
  /** Number of open SPKs for this variant */
  openSpkCount: number;
  /** Total planned qty across open SPKs */
  openSpkTotalQty: number;
}

export interface FgDemandFilters {
  search?: string;
  onlyUncovered?: boolean;
}

/**
 * FG Demand Board — aggregates open SO demand per product variant,
 * subtracts available FG stock and open SPK coverage.
 *
 * Formula per variant:
 *   openDemand(v)    = Σ max(0, soItem.qty − soItem.deliveredQty) for open SOs
 *   availableFg(v)   = sum of Inventory.quantity across non-scrap locations
 *   needToMake(v)    = max(0, openDemand − availableFg)
 *   openSpkPlanned(v)= Σ plannedQuantity for open SPKs whose BOM produces v
 *   uncoveredNeed(v) = max(0, needToMake − openSpkPlanned)
 */
export async function listFgDemandBoard(
  filters?: FgDemandFilters,
): Promise<FgDemandRow[]> {
  // 1. Fetch open SO items with residual > 0, excluding SERVICE
  const openStatuses: SalesOrderStatus[] = [
    SalesOrderStatus.CONFIRMED,
    SalesOrderStatus.IN_PRODUCTION,
    SalesOrderStatus.READY_TO_SHIP,
  ];

  const soItems = await prisma.salesOrderItem.findMany({
    where: {
      salesOrder: { status: { in: openStatuses } },
      productVariant: {
        product: { productType: { not: ProductType.SERVICE } },
      },
    },
    select: {
      productVariantId: true,
      quantity: true,
      deliveredQty: true,
      salesOrder: {
        select: {
          expectedDate: true,
        },
      },
      productVariant: {
        select: {
          id: true,
          name: true,
          skuCode: true,
          primaryUnit: true,
          product: {
            select: { name: true },
          },
        },
      },
    },
  });

  // 2. Group by productVariantId: sum residual, track earliest due
  const demandMap = new Map<
    string,
    {
      variant: (typeof soItems)[0]["productVariant"];
      totalResidual: number;
      earliestDue: Date | null;
    }
  >();

  for (const item of soItems) {
    const residual = Math.max(
      0,
      Number(item.quantity) - Number(item.deliveredQty),
    );
    if (residual <= 0) continue;

    const vid = item.productVariantId;
    const existing = demandMap.get(vid);
    if (existing) {
      existing.totalResidual += residual;
      const due = item.salesOrder.expectedDate;
      if (
        due &&
        (!existing.earliestDue || due < existing.earliestDue)
      ) {
        existing.earliestDue = due;
      }
    } else {
      demandMap.set(vid, {
        variant: item.productVariant,
        totalResidual: residual,
        earliestDue: item.salesOrder.expectedDate,
      });
    }
  }

  if (demandMap.size === 0) return [];

  const variantIds = [...demandMap.keys()];

  // 3. Batch inventory — sum quantity across all non-scrap locations
  const inventoryRows = await prisma.inventory.findMany({
    where: {
      productVariantId: { in: variantIds },
      quantity: { gt: 0 },
      location: {
        locationPurpose: { not: "SCRAP" },
      },
    },
    select: {
      productVariantId: true,
      quantity: true,
    },
  });

  const inventoryMap = new Map<string, number>();
  for (const row of inventoryRows) {
    const vid = row.productVariantId;
    inventoryMap.set(
      vid,
      (inventoryMap.get(vid) || 0) + Number(row.quantity),
    );
  }

  // 4. Batch open SPK planned via BOM.productVariantId
  const openSpkStatuses: ProductionStatus[] = [
    ProductionStatus.DRAFT,
    ProductionStatus.RELEASED,
    ProductionStatus.IN_PROGRESS,
    ProductionStatus.WAITING_MATERIAL,
  ];

  const openSpks = await prisma.productionOrder.findMany({
    where: {
      status: { in: openSpkStatuses },
      bom: { productVariantId: { in: variantIds } },
    },
    select: {
      plannedQuantity: true,
      bom: {
        select: { productVariantId: true },
      },
    },
  });

  const spkMap = new Map<
    string,
    { count: number; totalPlanned: number }
  >();
  for (const spk of openSpks) {
    const vid = spk.bom.productVariantId;
    const existing = spkMap.get(vid);
    if (existing) {
      existing.count++;
      existing.totalPlanned += Number(spk.plannedQuantity);
    } else {
      spkMap.set(vid, {
        count: 1,
        totalPlanned: Number(spk.plannedQuantity),
      });
    }
  }

  // 5. Compute urgency hint
  const now = new Date();
  const computeUrgency = (
    due: Date | null,
  ): "URGENT" | "NORMAL" | "LOW" => {
    if (!due) return "NORMAL";
    const daysToDue = Math.ceil(
      (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysToDue <= 2) return "URGENT";
    if (daysToDue <= 7) return "NORMAL";
    return "LOW";
  };

  // 6. Build rows
  const rows: FgDemandRow[] = [];

  for (const [vid, data] of demandMap) {
    const availableFg = inventoryMap.get(vid) || 0;
    const needToMake = Math.max(0, data.totalResidual - availableFg);
    const spk = spkMap.get(vid);
    const openSpkPlanned = spk?.totalPlanned || 0;
    const uncoveredNeed = Math.max(0, needToMake - openSpkPlanned);

    // Skip if nothing to make
    if (needToMake <= 0) continue;

    // Apply filter: onlyUncovered
    if (filters?.onlyUncovered && uncoveredNeed <= 0) continue;

    // Apply filter: search
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      const match =
        data.variant.product.name.toLowerCase().includes(q) ||
        data.variant.name.toLowerCase().includes(q) ||
        data.variant.skuCode.toLowerCase().includes(q);
      if (!match) continue;
    }

    rows.push({
      productVariantId: vid,
      productName: data.variant.product.name,
      variantName: data.variant.name,
      skuCode: data.variant.skuCode,
      unit: data.variant.primaryUnit,
      openDemand: data.totalResidual,
      availableFg,
      needToMake,
      openSpkPlanned,
      uncoveredNeed,
      earliestDue: data.earliestDue,
      urgencyHint: computeUrgency(data.earliestDue),
      openSpkCount: spk?.count || 0,
      openSpkTotalQty: openSpkPlanned,
    });
  }

  // 7. Sort: URGENT first, then by earliest due (nulls last), then need desc
  const urgencyOrder = { URGENT: 0, NORMAL: 1, LOW: 2 };
  rows.sort((a, b) => {
    const uDiff =
      urgencyOrder[a.urgencyHint] - urgencyOrder[b.urgencyHint];
    if (uDiff !== 0) return uDiff;

    const aTime = a.earliestDue?.getTime() ?? Infinity;
    const bTime = b.earliestDue?.getTime() ?? Infinity;
    if (aTime !== bTime) return aTime - bTime;

    return b.needToMake - a.needToMake;
  });

  return rows;
}

/**
 * Lightweight count of FG variants with uncovered demand.
 * Used by the production home board work strip.
 * ponytail: currently delegates to full list scan — small N (FG variants open)
 * for Melindo scale. When N grows (e.g. > 200 variants), push the uncovered filter
 * into SQL (demand residual − fg inventory − open SPK) to avoid O(M) fetches.
 */
export async function countUncoveredFgVariants(): Promise<number> {
  // Thin projection: prisma findMany still pulls full rows, but list helper is already
  // scoped to open SO items + non-scrap inventory + open SPK counts. For small variant count
  // (< ~200) this single scan is fast; workloads here are tenant-scoped small.
  const rows = await listFgDemandBoard({ onlyUncovered: true });
  return rows.length;
}
