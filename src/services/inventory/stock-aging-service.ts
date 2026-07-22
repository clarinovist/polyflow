
import { prisma } from '@/lib/core/prisma';
import { differenceInDays } from 'date-fns';

export interface AgingBucket {
    range: '0-30' | '31-60' | '61-90' | '90+';
    count: number;
    quantity: number;
    value: number;
}

export interface StockAgingResult {
    productVariantId: string;
    name: string;
    skuCode: string;
    totalStock: number;
    buckets: {
        '0-30': AgingBucket;
        '31-60': AgingBucket;
        '61-90': AgingBucket;
        '90+': AgingBucket;
    };
}

export class StockAgingService {
    private static getBucketKey(ageDays: number): keyof StockAgingResult['buckets'] {
        if (ageDays <= 30) return '0-30';
        if (ageDays <= 60) return '31-60';
        if (ageDays <= 90) return '61-90';
        return '90+';
    }

    private static ensureResult(
        map: Map<string, StockAgingResult>,
        variantId: string,
        name: string,
        skuCode: string
    ): StockAgingResult {
        if (!map.has(variantId)) {
            map.set(variantId, {
                productVariantId: variantId,
                name,
                skuCode,
                totalStock: 0,
                buckets: {
                    '0-30': { range: '0-30', count: 0, quantity: 0, value: 0 },
                    '31-60': { range: '31-60', count: 0, quantity: 0, value: 0 },
                    '61-90': { range: '61-90', count: 0, quantity: 0, value: 0 },
                    '90+': { range: '90+', count: 0, quantity: 0, value: 0 },
                }
            });
        }
        return map.get(variantId)!;
    }

    /**
     * Calculates stock aging.
     * Primary: batches (manufacturingDate) if exists.
     * Fallback: Inventory (updatedAt/createdAt) so aging works even when Batch table empty — e.g. melindo_rafia, kiyowo.
     */
    static async calculateStockAging(): Promise<StockAgingResult[]> {
        const agingMap = new Map<string, StockAgingResult>();

        // 1. Batch-based aging (when Batch table populated)
        const batches = await prisma.batch.findMany({
            where: { quantity: { gt: 0 }, status: 'ACTIVE' },
            include: {
                productVariant: {
                    select: {
                        id: true, name: true, skuCode: true, buyPrice: true,
                        inventories: { select: { averageCost: true }, take: 1 }
                    }
                }
            }
        });

        for (const batch of batches) {
            const result = this.ensureResult(agingMap, batch.productVariantId, batch.productVariant.name, batch.productVariant.skuCode);
            const quantity = batch.quantity.toNumber();
            const inv = batch.productVariant.inventories[0];
            const unitCost = inv?.averageCost?.toNumber() || batch.productVariant.buyPrice?.toNumber() || 0;
            const value = quantity * unitCost;
            const refDate = batch.manufacturingDate || batch.createdAt;
            const bucketKey = this.getBucketKey(differenceInDays(new Date(), refDate));
            result.buckets[bucketKey].count++;
            result.buckets[bucketKey].quantity += quantity;
            result.buckets[bucketKey].value += value;
            result.totalStock += quantity;
        }

        // If batches exist, return batch-based aging (authoritative for FIFO)
        if (agingMap.size > 0) {
            return Array.from(agingMap.values());
        }

        // 2. Fallback: Inventory-based aging
        // Uses last inbound movement or inventory.updatedAt to estimate age.
        // This fixes melindo_rafia where Batch=0 but Inventory=186 qty>0 rows.
        const inventories = await prisma.inventory.findMany({
            where: { quantity: { gt: 0 } },
            include: {
                productVariant: {
                    select: {
                        id: true, name: true, skuCode: true, buyPrice: true, standardCost: true,
                    }
                }
            }
        });

        if (inventories.length === 0) return [];

        // Fetch last inbound movement per variant for better age estimate (groupBy fallback, distinct needs Postgres unique trick)
        const variantIds = [...new Set(inventories.map(i => i.productVariantId))];
        let lastMovementMap = new Map<string, Date>();
        try {
            const grouped = await prisma.stockMovement.groupBy({
                by: ['productVariantId'],
                where: {
                    productVariantId: { in: variantIds },
                    toLocationId: { not: null },
                },
                _max: { createdAt: true },
            });
            for (const g of grouped) {
                if (g._max.createdAt) lastMovementMap.set(g.productVariantId, g._max.createdAt);
            }
        } catch {
            // fallback: no grouping
            lastMovementMap = new Map();
        }

        for (const inv of inventories) {
            const variantId = inv.productVariantId;
            const result = this.ensureResult(agingMap, variantId, inv.productVariant.name, inv.productVariant.skuCode);
            const quantity = inv.quantity.toNumber();
            const rawInv = inv as unknown as { averageCost?: { toNumber: () => number } | null; updatedAt?: Date };
            const unitCost = rawInv.averageCost?.toNumber() || inv.productVariant.standardCost?.toNumber() || inv.productVariant.buyPrice?.toNumber() || 0;
            const value = quantity * unitCost;

            // Age reference: last inbound movement > updatedAt > now
            const refDate = lastMovementMap.get(variantId) || rawInv.updatedAt || new Date();
            const bucketKey = this.getBucketKey(differenceInDays(new Date(), refDate));

            result.buckets[bucketKey].count++;
            result.buckets[bucketKey].quantity += quantity;
            result.buckets[bucketKey].value += value;
            result.totalStock += quantity;
        }

        return Array.from(agingMap.values());
    }

    /**
     * Get summary stats for dashboard widgets
     */
    static async getAgingSummary() {
        const results = await this.calculateStockAging();

        const summary = {
            totalValue: 0,
            agedValue: 0, // > 90 days
            agedPercentage: 0,
            totalItems: 0,
            slowMovingCount: 0,
            avgDays: 0,
        };

        let totalDays = 0;
        let itemCount = 0;

        results.forEach(res => {
            Object.values(res.buckets).forEach(b => {
                summary.totalValue += b.value;
                summary.totalItems += b.quantity;
                if (b.range === '90+') {
                    summary.agedValue += b.value;
                    summary.slowMovingCount += b.quantity;
                }
            });
            // Estimate average days from bucket distribution
            const buckets = Object.values(res.buckets);
            let weightedDays = 0;
            let totalQty = 0;
            buckets.forEach(b => {
                const midPoint = b.range === '90+' ? 105 : b.range === '61-90' ? 75 : b.range === '31-60' ? 45 : 15;
                weightedDays += midPoint * b.quantity;
                totalQty += b.quantity;
            });
            if (totalQty > 0) {
                totalDays += weightedDays / totalQty;
            }
            itemCount++;
        });

        if (itemCount > 0) {
            summary.avgDays = totalDays / itemCount;
        }

        if (summary.totalValue > 0) {
            summary.agedPercentage = (summary.agedValue / summary.totalValue) * 100;
        }

        return summary;
    }
}
