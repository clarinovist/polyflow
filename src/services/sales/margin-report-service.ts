import { prisma } from '@/lib/core/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { startOfMonth, endOfMonth } from 'date-fns';
import { CostingService } from '@/services/accounting/costing-service';
import { UNATTRIBUTED_SALES_KEY } from '@/lib/sales/revenue-basis';

// ── Types ───────────────────────────────────────────────────────

export type HppCoverage = 'FULL' | 'PARTIAL' | 'NONE';

export type VariantHppEntry = {
    hppPerUnit: Decimal;
    totalQuantity: Decimal;
};

export type MarginItemRow = {
    productVariantId: string;
    skuCode: string | null;
    productName: string;
    quantity: Decimal;
    revenue: Decimal;
    hppPerUnit: Decimal | null;
    cost: Decimal | null;
    margin: Decimal | null;
    hppMissing: boolean;
};

export type MarginOrderRow = {
    id: string;
    orderNumber: string;
    orderDate: Date;
    customerId: string;
    customerName: string;
    salesRepId: string | null;
    salesRepName: string | null;
    items: MarginItemRow[];
    revenue: Decimal;
    cost: Decimal | null;
    costPartial: Decimal;
    margin: Decimal | null;
    marginPartial: Decimal | null;
    marginPercent: Decimal | null;
    hppCoverage: HppCoverage;
    hasIncompleteHpp: boolean;
};

export type MarginCustomerRow = {
    customerId: string;
    customerName: string;
    revenue: Decimal;
    cost: Decimal;
    margin: Decimal;
    marginPercent: Decimal | null;
    isNegativeMargin: boolean;
    orderCount: number;
    hppCoverage: HppCoverage;
    ordersWithIncompleteHpp: number;
};

export type MarginProductRow = {
    productVariantId: string;
    skuCode: string | null;
    productName: string;
    quantity: Decimal;
    revenue: Decimal;
    cost: Decimal | null;
    margin: Decimal | null;
    marginPercent: Decimal | null;
    isNegativeMargin: boolean;
    hasMissingHpp: boolean;
    orderCount: number;
};

export type MarginSalesRow = {
    salesRepId: string;
    salesRepName: string;
    revenue: Decimal;
    cost: Decimal;
    margin: Decimal;
    marginPercent: Decimal | null;
    isNegativeMargin: boolean;
    orderCount: number;
    hppCoverage: HppCoverage;
    ordersWithIncompleteHpp: number;
};

export type MarginReportData = {
    startDate: Date;
    endDate: Date;
    summary: {
        totalRevenue: Decimal;
        /** Revenue of items whose HPP is actually known — the marginPercent denominator. */
        totalRevenueForKnownCost: Decimal;
        totalCost: Decimal;
        totalMargin: Decimal;
        marginPercent: Decimal | null;
        totalOrders: number;
        totalCustomerCount: number;
        ordersWithIncompleteHpp: number;
        ordersWithNoHpp: number;
        variantWithoutHppCount: number;
    };
    orders: MarginOrderRow[];
    byCustomer: MarginCustomerRow[];
    byProduct: MarginProductRow[];
    bySales: MarginSalesRow[];
    // Variant HPP map present for debugging / transparency — variantId -> hppPerUnit
    hppMap: Map<string, VariantHppEntry>;
    variantWithoutHpp: string[];
};

// ── Constants ───────────────────────────────────────────────────

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);
export { UNATTRIBUTED_SALES_KEY };

// ── Helpers ─────────────────────────────────────────────────────

function toDecimal(value: unknown): Decimal {
    if (value == null) return ZERO;
    if (value instanceof Decimal) return value;
    if (typeof value === 'number') return new Decimal(value.toString());
    if (typeof value === 'string') {
        const n = Number(value);
        if (!Number.isFinite(n)) return ZERO;
        return new Decimal(value);
    }
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

// ── Core: weighted HPP per variant for period ───────────────────

/**
 * Build weighted-average HPP per variant for period.
 * - Calls CostingService.getPeriodCosts(startDate, endDate)
 * - Joins productionOrder -> bom.productVariantId manually
 * - Weighted average: sum(totalCost) / sum(quantityProduced) per variant
 * - No fallback to standardCost/buyPrice — variant without production in period = not in map
 */
export async function getVariantHppForPeriod(
    startDate: Date,
    endDate: Date,
): Promise<Map<string, VariantHppEntry>> {
    const periodCosts = await CostingService.getPeriodCosts(startDate, endDate);

    if (periodCosts.length === 0) {
        return new Map<string, VariantHppEntry>();
    }

    const orderIds = periodCosts.map((c) => c.productionOrderId);

    // Manual join: productionOrder -> bom.productVariantId
    const ordersMeta = await prisma.productionOrder.findMany({
        where: { id: { in: orderIds } },
        select: {
            id: true,
            bom: { select: { productVariantId: true } },
        },
    });

    const orderToVariant = new Map<string, string | null>();
    for (const o of ordersMeta) {
        const variantId = o.bom?.productVariantId ?? null;
        orderToVariant.set(o.id, variantId);
    }

    // Group per variant: { totalCostSum: Decimal, qtySum: Decimal }
    type Acc = { totalCost: Decimal; totalQty: Decimal };
    const accByVariant = new Map<string, Acc>();

    for (const c of periodCosts) {
        const variantId = orderToVariant.get(c.productionOrderId);
        if (!variantId) continue; // SKIP order tanpa bom atau bom.productVariantId null

        const qtyProduced = toDecimal(c.quantityProduced);
        // Skip orders with zero quantity (no output yet — division by zero)
        if (qtyProduced.isZero() || qtyProduced.isNegative()) continue;

        const totalCost = toDecimal(c.totalCost);
        const existing = accByVariant.get(variantId);
        if (existing) {
            existing.totalCost = existing.totalCost.add(totalCost);
            existing.totalQty = existing.totalQty.add(qtyProduced);
        } else {
            accByVariant.set(variantId, {
                totalCost,
                totalQty: qtyProduced,
            });
        }
    }

    // Weighted avg per variant
    const result = new Map<string, VariantHppEntry>();
    for (const [variantId, acc] of accByVariant) {
        if (acc.totalQty.isZero()) continue;
        const hppPerUnit = acc.totalCost.div(acc.totalQty);
        result.set(variantId, {
            hppPerUnit,
            totalQuantity: acc.totalQty,
        });
    }

    return result;
}

// ── Main: margin report ─────────────────────────────────────────

export async function getMarginReport(
    rawStartDate?: Date,
    rawEndDate?: Date,
): Promise<MarginReportData> {
    const now = new Date();
    const startDate = rawStartDate ?? startOfMonth(now);
    const endDate = rawEndDate ?? endOfMonth(now);

    // 1. Weighted HPP per variant for same period
    const hppMap = await getVariantHppForPeriod(startDate, endDate);

    // 2. SalesOrders: status != CANCELLED, orderDate in range, customerId not null
    const salesOrders = await prisma.salesOrder.findMany({
        where: {
            status: { not: 'CANCELLED' },
            orderDate: { gte: startDate, lte: endDate },
            customerId: { not: null },
        },
        select: {
            id: true,
            orderNumber: true,
            orderDate: true,
            customerId: true,
            salesRepId: true,
            customer: { select: { id: true, name: true } },
            salesRep: { select: { id: true, name: true } },
            items: {
                select: {
                    id: true,
                    productVariantId: true,
                    quantity: true,
                    subtotal: true,
                    productVariant: {
                        select: {
                            skuCode: true,
                            product: { select: { name: true } },
                        },
                    },
                },
            },
        },
        orderBy: { orderDate: 'desc' },
    });

    // 3. Per SO & per item calculations
    const orderRows: MarginOrderRow[] = [];
    let totalRevenue = ZERO;
    // Revenue of items whose cost IS known — the correct denominator for
    // marginPercent, so it's not diluted by revenue whose cost is unknown
    // (that would silently understate the margin %).
    let totalRevenueForKnownCost = ZERO;
    let totalCostPartial = ZERO;
    let totalMarginPartial = ZERO;
    let ordersWithIncompleteHpp = 0;
    let ordersWithNoHpp = 0;
    const variantWithoutHppSet = new Set<string>();

    for (const so of salesOrders) {
        const customerName = so.customer?.name ?? '-';
        const salesRepName = so.salesRep?.name ?? null;

        const itemRows: MarginItemRow[] = [];
        let soRevenue = ZERO;
        let soRevenueForKnownCost = ZERO;
        let soCostFull = ZERO;
        let soCostPartial = ZERO;
        let soMarginPartial = ZERO;
        let fullCostPossible = true;
        let hasAtLeastOneWithHpp = false;
        let hasAtLeastOneMissing = false;

        for (const item of so.items) {
            const qty = toDecimal(item.quantity);
            const revenue = toDecimal(item.subtotal);
            const hppEntry = hppMap.get(item.productVariantId);

            soRevenue = soRevenue.add(revenue);

            if (hppEntry) {
                const hppPerUnit = hppEntry.hppPerUnit;
                const cost = hppPerUnit.mul(qty);
                const margin = revenue.sub(cost);

                itemRows.push({
                    productVariantId: item.productVariantId,
                    skuCode: item.productVariant?.skuCode ?? null,
                    productName:
                        item.productVariant?.product?.name ??
                        item.productVariant?.skuCode ??
                        item.productVariantId,
                    quantity: qty,
                    revenue,
                    hppPerUnit,
                    cost,
                    margin,
                    hppMissing: false,
                });

                soCostFull = soCostFull.add(cost);
                soCostPartial = soCostPartial.add(cost);
                soMarginPartial = soMarginPartial.add(margin);
                soRevenueForKnownCost = soRevenueForKnownCost.add(revenue);
                hasAtLeastOneWithHpp = true;
            } else {
                // HPP tidak tersedia — JANGAN fallback, tandai eksplisit
                variantWithoutHppSet.add(item.productVariantId);

                itemRows.push({
                    productVariantId: item.productVariantId,
                    skuCode: item.productVariant?.skuCode ?? null,
                    productName:
                        item.productVariant?.product?.name ??
                        item.productVariant?.skuCode ??
                        item.productVariantId,
                    quantity: qty,
                    revenue,
                    hppPerUnit: null,
                    cost: null,
                    margin: null,
                    hppMissing: true,
                });

                fullCostPossible = false;
                hasAtLeastOneMissing = true;
            }
        }

        let hppCoverage: HppCoverage;
        if (!hasAtLeastOneWithHpp) {
            hppCoverage = 'NONE';
        } else if (hasAtLeastOneMissing) {
            hppCoverage = 'PARTIAL';
        } else {
            hppCoverage = 'FULL';
        }

        // SO-level margin only if all items have HPP
        let soMarginFull: Decimal | null = null;
        if (fullCostPossible && hasAtLeastOneWithHpp) {
            soMarginFull = soRevenue.sub(soCostFull);
        } else if (!hasAtLeastOneWithHpp) {
            // All missing — no margin
            soMarginFull = null;
        } else {
            // Partial — full margin null, partial exists
            soMarginFull = null;
        }

        // soMarginPartial is null if NOTHING had HPP, else sum of items with HPP
        const marginPartialOrNull =
            hasAtLeastOneWithHpp && hasAtLeastOneMissing
                ? soMarginPartial
                : null;

        // Final SO margin:
        // - FULL: soMarginFull (revenue - cost semua item)
        // - PARTIAL: partial margin (hanya item dengan HPP) + flag hasIncompleteHpp
        // - NONE: null
        // Ini sesuai spec: "null jika SEMUA item hppMissing, ATAU partial margin + flag"
        let finalSoMargin: Decimal | null;
        if (fullCostPossible && hasAtLeastOneWithHpp) {
            finalSoMargin = soMarginFull;
        } else if (!hasAtLeastOneWithHpp) {
            finalSoMargin = null;
        } else {
            // PARTIAL: partial margin
            finalSoMargin = marginPartialOrNull;
        }

        // marginPercent only for FULL coverage (revenue dari semua item, bukan parsial)
        // PARTIAL/NONE -> null, UI harus tampilkan badge, jangan persen yang menyesatkan
        let marginPercent: Decimal | null = null;
        if (
            hppCoverage === 'FULL' &&
            finalSoMargin !== null &&
            !soRevenue.isZero()
        ) {
            marginPercent = finalSoMargin.div(soRevenue).mul(HUNDRED);
        }

        if (hppCoverage === 'PARTIAL') ordersWithIncompleteHpp++;
        if (hppCoverage === 'NONE') ordersWithNoHpp++;

        // For grand totals: accumulate from items with HPP only (never assume cost 0)
        totalRevenue = totalRevenue.add(soRevenue);
        totalRevenueForKnownCost = totalRevenueForKnownCost.add(
            soRevenueForKnownCost,
        );
        totalCostPartial = totalCostPartial.add(soCostPartial);
        if (finalSoMargin !== null && fullCostPossible) {
            totalMarginPartial = totalMarginPartial.add(finalSoMargin);
        } else if (marginPartialOrNull !== null) {
            totalMarginPartial = totalMarginPartial.add(marginPartialOrNull);
        }

        orderRows.push({
            id: so.id,
            orderNumber: so.orderNumber,
            orderDate: so.orderDate ?? new Date(),
            customerId: so.customerId as string,
            customerName,
            salesRepId: so.salesRepId ?? null,
            salesRepName,
            items: itemRows,
            revenue: soRevenue,
            cost: fullCostPossible && hasAtLeastOneWithHpp ? soCostFull : null,
            costPartial: soCostPartial,
            margin: finalSoMargin,
            marginPartial:
                hppCoverage === 'PARTIAL' ? marginPartialOrNull : finalSoMargin,
            marginPercent: hppCoverage === 'FULL' ? marginPercent : null,
            hppCoverage,
            hasIncompleteHpp: hppCoverage !== 'FULL',
        });
    }

    // 4. Breakdowns

    // By customer
    const customerAgg = new Map<
        string,
        {
            customerName: string;
            revenue: Decimal;
            cost: Decimal;
            margin: Decimal;
            orderCount: number;
            coverageFull: number;
            coveragePartial: number;
            coverageNone: number;
            ordersWithIncompleteHpp: number;
        }
    >();

    for (const o of orderRows) {
        const existing = customerAgg.get(o.customerId);
        const revAdd = o.revenue;
        // For by-customer rollup, use partial cost/margin (items with HPP) to avoid hiding data
        // But track coverage for UI badge
        // Cost for customer = sum of o.costPartial (never null); if o has at least some HPP
        // Actually costPartial can be 0 when NONE — handle
        const costAdd = o.costPartial;
        // margin for customer = sum of o.marginPartial when FULL/ PARTIAL? For NONE margin null → 0 contribution
        const marginAdd = o.marginPartial ?? o.margin ?? ZERO;

        if (existing) {
            existing.revenue = existing.revenue.add(revAdd);
            existing.cost = existing.cost.add(costAdd);
            existing.margin = existing.margin.add(marginAdd);
            existing.orderCount += 1;
            if (o.hppCoverage === 'FULL') existing.coverageFull++;
            else if (o.hppCoverage === 'PARTIAL') existing.coveragePartial++;
            else existing.coverageNone++;
            if (o.hasIncompleteHpp) existing.ordersWithIncompleteHpp++;
        } else {
            customerAgg.set(o.customerId, {
                customerName: o.customerName,
                revenue: revAdd,
                cost: costAdd,
                margin: marginAdd,
                orderCount: 1,
                coverageFull: o.hppCoverage === 'FULL' ? 1 : 0,
                coveragePartial: o.hppCoverage === 'PARTIAL' ? 1 : 0,
                coverageNone: o.hppCoverage === 'NONE' ? 1 : 0,
                ordersWithIncompleteHpp: o.hasIncompleteHpp ? 1 : 0,
            });
        }
    }

    const byCustomer: MarginCustomerRow[] = Array.from(customerAgg.entries())
        .map(([customerId, agg]) => {
            const marginPercent = agg.revenue.isZero()
                ? null
                : agg.margin.div(agg.revenue).mul(HUNDRED);
            const coverage: HppCoverage =
                agg.coverageNone === agg.orderCount
                    ? 'NONE'
                    : agg.coverageFull === agg.orderCount
                      ? 'FULL'
                      : 'PARTIAL';
            return {
                customerId,
                customerName: agg.customerName,
                revenue: agg.revenue,
                cost: agg.cost,
                margin: agg.margin,
                marginPercent,
                isNegativeMargin: agg.margin.isNegative(),
                orderCount: agg.orderCount,
                hppCoverage: coverage,
                ordersWithIncompleteHpp: agg.ordersWithIncompleteHpp,
            };
        })
        .sort((a, b) => {
            // Desc by revenue
            if (b.revenue.comparedTo(a.revenue) !== 0)
                return b.revenue.comparedTo(a.revenue);
            return 0;
        });

    // By product — group items, not SOs
    type ProductAcc = {
        skuCode: string | null;
        productName: string;
        quantity: Decimal;
        revenue: Decimal;
        cost: Decimal;
        margin: Decimal;
        hasMissingHpp: boolean;
        orderCountSet: Set<string>;
        hasAtLeastOneWithHpp: boolean;
    };
    const productAgg = new Map<string, ProductAcc>();

    for (const o of orderRows) {
        for (const item of o.items) {
            const existing = productAgg.get(item.productVariantId);
            if (existing) {
                existing.quantity = existing.quantity.add(item.quantity);
                existing.revenue = existing.revenue.add(item.revenue);
                if (item.cost !== null) {
                    existing.cost = existing.cost.add(item.cost);
                    if (item.margin !== null)
                        existing.margin = existing.margin.add(item.margin);
                    existing.hasAtLeastOneWithHpp = true;
                }
                if (item.hppMissing) existing.hasMissingHpp = true;
                existing.orderCountSet.add(o.id);
            } else {
                const costVal = item.cost ?? ZERO;
                const marginVal = item.margin ?? ZERO;
                productAgg.set(item.productVariantId, {
                    skuCode: item.skuCode,
                    productName: item.productName,
                    quantity: item.quantity,
                    revenue: item.revenue,
                    cost: costVal,
                    margin: item.cost !== null ? marginVal : ZERO,
                    hasMissingHpp: item.hppMissing,
                    orderCountSet: new Set([o.id]),
                    hasAtLeastOneWithHpp: !item.hppMissing,
                });
            }
        }
    }

    const byProduct: MarginProductRow[] = Array.from(productAgg.entries()).map(
        ([productVariantId, agg]) => {
            const marginPercent = agg.revenue.isZero()
                ? null
                : agg.hasAtLeastOneWithHpp
                  ? agg.margin.div(agg.revenue).mul(HUNDRED)
                  : null;
            return {
                productVariantId,
                skuCode: agg.skuCode,
                productName: agg.productName,
                quantity: agg.quantity,
                revenue: agg.revenue,
                cost: agg.hasAtLeastOneWithHpp ? agg.cost : null,
                margin: agg.hasAtLeastOneWithHpp ? agg.margin : null,
                marginPercent,
                isNegativeMargin: agg.hasAtLeastOneWithHpp
                    ? agg.margin.isNegative()
                    : false,
                hasMissingHpp: agg.hasMissingHpp,
                orderCount: agg.orderCountSet.size,
            };
        },
    );

    byProduct.sort((a, b) => {
        if (b.revenue.comparedTo(a.revenue) !== 0)
            return b.revenue.comparedTo(a.revenue);
        return 0;
    });

    // By salesRep (plus unattributed bucket)
    const salesAgg = new Map<
        string,
        {
            salesRepName: string;
            revenue: Decimal;
            cost: Decimal;
            margin: Decimal;
            orderCount: number;
            coverageFull: number;
            coveragePartial: number;
            coverageNone: number;
            ordersWithIncompleteHpp: number;
        }
    >();

    for (const o of orderRows) {
        const key = o.salesRepId ?? UNATTRIBUTED_SALES_KEY;
        const nameForKey =
            o.salesRepName ??
            (key === UNATTRIBUTED_SALES_KEY ? 'Tanpa Sales' : '-');
        const existing = salesAgg.get(key);
        const costAdd = o.costPartial;
        const marginAdd = o.marginPartial ?? o.margin ?? ZERO;

        if (existing) {
            existing.revenue = existing.revenue.add(o.revenue);
            existing.cost = existing.cost.add(costAdd);
            existing.margin = existing.margin.add(marginAdd);
            existing.orderCount += 1;
            if (o.hppCoverage === 'FULL') existing.coverageFull++;
            else if (o.hppCoverage === 'PARTIAL') existing.coveragePartial++;
            else existing.coverageNone++;
            if (o.hasIncompleteHpp) existing.ordersWithIncompleteHpp++;
        } else {
            salesAgg.set(key, {
                salesRepName: nameForKey,
                revenue: o.revenue,
                cost: costAdd,
                margin: marginAdd,
                orderCount: 1,
                coverageFull: o.hppCoverage === 'FULL' ? 1 : 0,
                coveragePartial: o.hppCoverage === 'PARTIAL' ? 1 : 0,
                coverageNone: o.hppCoverage === 'NONE' ? 1 : 0,
                ordersWithIncompleteHpp: o.hasIncompleteHpp ? 1 : 0,
            });
        }
    }

    const bySales: MarginSalesRow[] = Array.from(salesAgg.entries())
        .map(([salesRepId, agg]) => {
            const marginPercent = agg.revenue.isZero()
                ? null
                : agg.margin.div(agg.revenue).mul(HUNDRED);
            const coverage: HppCoverage =
                agg.coverageNone === agg.orderCount
                    ? 'NONE'
                    : agg.coverageFull === agg.orderCount
                      ? 'FULL'
                      : 'PARTIAL';
            return {
                salesRepId,
                salesRepName: agg.salesRepName,
                revenue: agg.revenue,
                cost: agg.cost,
                margin: agg.margin,
                marginPercent,
                isNegativeMargin: agg.margin.isNegative(),
                orderCount: agg.orderCount,
                hppCoverage: coverage,
                ordersWithIncompleteHpp: agg.ordersWithIncompleteHpp,
            };
        })
        .sort((a, b) => {
            if (b.revenue.comparedTo(a.revenue) !== 0)
                return b.revenue.comparedTo(a.revenue);
            return 0;
        });

    // Grand totals recomputed to be consistent with what UI counts:
    // Use totalCostPartial / totalMarginPartial which never assumes cost 0 for missing HPP.
    // marginPercent denominator MUST be totalRevenueForKnownCost (revenue of items
    // whose cost is actually known), NOT totalRevenue (all orders) — dividing margin
    // known-cost-only by all-orders revenue would silently understate the margin %
    // whenever some orders/items have no HPP data for the period.
    const grandMarginPercent = totalRevenueForKnownCost.isZero()
        ? null
        : totalMarginPartial.div(totalRevenueForKnownCost).mul(HUNDRED);

    return {
        startDate,
        endDate,
        summary: {
            totalRevenue,
            totalRevenueForKnownCost,
            totalCost: totalCostPartial,
            totalMargin: totalMarginPartial,
            marginPercent: grandMarginPercent,
            totalOrders: orderRows.length,
            totalCustomerCount: customerAgg.size,
            ordersWithIncompleteHpp,
            ordersWithNoHpp,
            variantWithoutHppCount: variantWithoutHppSet.size,
        },
        orders: orderRows,
        byCustomer,
        byProduct,
        bySales,
        hppMap,
        variantWithoutHpp: Array.from(variantWithoutHppSet),
    };
}
