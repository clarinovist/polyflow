
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export type ABCClass = 'A' | 'B' | 'C';

export interface ABCAnalysisResult {
    productVariantId: string;
    name: string;
    skuCode: string;
    currentStock: number;
    annualConsumptionQty: number;
    unitCost: number;
    annualConsumptionValue: number;
    percentage: number;
    cumulativePercentage: number;
    class: ABCClass;
}

type VariantWithInventory = Prisma.ProductVariantGetPayload<{
    select: {
        id: true;
        name: true;
        skuCode: true;
        buyPrice: true;
        costingMethod: true;
        standardCost: true;
        inventories: {
            select: {
                averageCost: true;
                quantity: true;
            }
        }
    }
}>;

export class ABCAnalysisService {
    /**
     * Calculates ABC classification for all product variants based on consumption value.
     * Period defaults to 12 months (365 days).
     * 
     * Classification Rules (by Consumption Value):
     * A: Top 80% coverage
     * B: Next 15% (80-95%)
     * C: Bottom 5% (95-100%)
     */
    static async calculateABCClassification(periodDays = 365): Promise<ABCAnalysisResult[]> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // 1. Aggregated Consumption (Outgoing Quantity) per Variant
        // We consider 'OUT' movements and 'ADJUSTMENT' where it was outgoing (fromLocationId != null)
        const consumption = await prisma.stockMovement.groupBy({
            by: ['productVariantId'],
            where: {
                createdAt: { gte: startDate },
                fromLocationId: { not: null }, // Outgoing
                toLocationId: { equals: null }, // Ensure it's not a transfer
            },
            _sum: {
                quantity: true
            }
        });

        // 2. Get Product Details (Current Cost and Name)
        const variants = await prisma.productVariant.findMany({
            select: {
                id: true,
                name: true,
                skuCode: true,
                buyPrice: true,
                costingMethod: true,
                standardCost: true,
                inventories: {
                    select: {
                        averageCost: true,
                        quantity: true
                    }
                }
            }
        });

        // 3. Map Consumption to Variants and Calculate Value
        const analysisData = (variants as VariantWithInventory[]).map(variant => {
            const consumedItem = consumption.find(c => c.productVariantId === variant.id);
            const annualQty = consumedItem?._sum.quantity?.toNumber() || 0;

            // Determine Unit Cost for Analysis
            let unitCost = 0;
            const validInv = variant.inventories.find(i => i.averageCost && i.averageCost.toNumber() > 0);
            if (validInv) {
                unitCost = validInv.averageCost?.toNumber() || 0;
            } else {
                unitCost = variant.standardCost?.toNumber() || variant.buyPrice?.toNumber() || 0;
            }

            // Current Stock (Total across locations)
            const currentStock = variant.inventories.reduce((sum, i) => sum + i.quantity.toNumber(), 0);

            return {
                productVariantId: variant.id,
                name: variant.name,
                skuCode: variant.skuCode,
                currentStock,
                annualConsumptionQty: annualQty,
                unitCost,
                annualConsumptionValue: annualQty * unitCost
            };
        });

        // 4. Sort by Consumption Value Descending
        analysisData.sort((a, b) => b.annualConsumptionValue - a.annualConsumptionValue);

        // 5. Compute Cumulative Percentage and Class
        const totalValue = analysisData.reduce((sum, item) => sum + item.annualConsumptionValue, 0);
        let cumulative = 0;

        return analysisData.map(item => {
            cumulative += item.annualConsumptionValue;
            const cumulativePercentage = totalValue > 0 ? (cumulative / totalValue) : 0; // 0 to 1
            const itemPercentage = totalValue > 0 ? (item.annualConsumptionValue / totalValue) : 0;

            let abcClass: ABCClass = 'C';
            if (cumulativePercentage <= 0.80) {
                abcClass = 'A';
            } else if (cumulativePercentage <= 0.95) {
                abcClass = 'B';
            } else {
                abcClass = 'C';
            }

            if (totalValue === 0) abcClass = 'C';

            return {
                ...item,
                percentage: itemPercentage * 100,
                cumulativePercentage: cumulativePercentage * 100,
                class: abcClass
            };
        });
    }
}
