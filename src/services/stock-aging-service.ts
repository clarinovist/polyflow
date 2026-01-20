
import { prisma } from '@/lib/prisma';
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
    /**
     * Calculates stock aging for all active batches with positive quantity.
     * Uses `manufacturingDate` (or `createdAt` fallback) to determine age.
     */
    static async calculateStockAging(): Promise<StockAgingResult[]> {
        // Fetch all batches with positive quantity
        const batches = await prisma.batch.findMany({
            where: {
                quantity: { gt: 0 },
                status: 'ACTIVE'
            },
            include: {
                productVariant: {
                    select: {
                        id: true,
                        name: true,
                        skuCode: true,
                        buyPrice: true,
                        inventories: {
                            select: { averageCost: true },
                            take: 1 // Just to get a cost reference
                        }
                    }
                }
            }
        });

        // Group by Variant
        const agingMap = new Map<string, StockAgingResult>();

        for (const batch of batches) {
            const variantId = batch.productVariantId;

            if (!agingMap.has(variantId)) {
                agingMap.set(variantId, {
                    productVariantId: variantId,
                    name: batch.productVariant.name,
                    skuCode: batch.productVariant.skuCode,
                    totalStock: 0,
                    buckets: {
                        '0-30': { range: '0-30', count: 0, quantity: 0, value: 0 },
                        '31-60': { range: '31-60', count: 0, quantity: 0, value: 0 },
                        '61-90': { range: '61-90', count: 0, quantity: 0, value: 0 },
                        '90+': { range: '90+', count: 0, quantity: 0, value: 0 },
                    }
                });
            }

            const result = agingMap.get(variantId)!;
            const quantity = batch.quantity.toNumber();

            // Determine Unit Cost (Priority: WAC -> BuyPrice -> 0)
            let unitCost = 0;
            const inv = batch.productVariant.inventories[0];
            if (inv && inv.averageCost) {
                unitCost = inv.averageCost.toNumber();
            } else {
                unitCost = batch.productVariant.buyPrice?.toNumber() || 0;
            }

            const value = quantity * unitCost;

            // Calculate Age
            const refDate = batch.manufacturingDate || batch.createdAt;
            const ageDays = differenceInDays(new Date(), refDate);

            // Assign to Bucket
            let bucketKey: keyof StockAgingResult['buckets'];
            if (ageDays <= 30) bucketKey = '0-30';
            else if (ageDays <= 60) bucketKey = '31-60';
            else if (ageDays <= 90) bucketKey = '61-90';
            else bucketKey = '90+';

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
            agedPercentage: 0
        };

        results.forEach(res => {
            Object.values(res.buckets).forEach(b => {
                summary.totalValue += b.value;
                if (b.range === '90+') {
                    summary.agedValue += b.value;
                }
            });
        });

        if (summary.totalValue > 0) {
            summary.agedPercentage = (summary.agedValue / summary.totalValue) * 100;
        }

        return summary;
    }
}
