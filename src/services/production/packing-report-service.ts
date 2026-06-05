import { prisma } from '@/lib/core/prisma';

export interface PackingReportItem {
    productVariantId: string;
    productName: string;
    skuCode: string;
    totalQuantity: number;
    primaryUnit: string;
    workOrderCount: number;
    averageHpp: number;
    totalCost: number;
}

export class PackingReportService {
    static async getMonthlyPackingReport(monthStr?: string): Promise<PackingReportItem[]> {
        let startDate: Date;
        let endDate: Date;

        if (monthStr) {
            const [year, month] = monthStr.split('-').map(Number);
            startDate = new Date(year, month - 1, 1);
            endDate = new Date(year, month, 0, 23, 59, 59, 999);
        } else {
            const now = new Date();
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        }

        const executions = await prisma.productionExecution.findMany({
            where: {
                status: { not: 'VOIDED' },
                endTime: {
                    gte: startDate,
                    lte: endDate
                },
                productionOrder: {
                    bom: {
                        category: 'PACKING'
                    },
                    location: {
                        slug: 'packing_area'
                    }
                }
            },
            include: {
                productionOrder: {
                    include: {
                        bom: {
                            include: {
                                productVariant: {
                                    include: { product: true }
                                }
                            }
                        },
                        stockMovements: {
                            where: {
                                type: 'IN',
                                createdAt: {
                                    gte: startDate,
                                    lte: endDate
                                }
                            }
                        }
                    }
                }
            }
        });

        const aggregate = new Map<string, {
            productName: string;
            skuCode: string;
            totalQty: number;
            primaryUnit: string;
            orderIds: Set<string>;
            totalCost: number;
        }>();

        for (const exec of executions) {
            const variant = exec.productionOrder.bom.productVariant;
            const variantId = variant.id;
            const qtyProduced = Number(exec.quantityProduced);

            const poInMovements = exec.productionOrder.stockMovements.filter(
                m => m.productVariantId === variantId && m.type === 'IN'
            );
            
            let poUnitCost = 0;
            if (poInMovements.length > 0) {
                const totalMovementsQty = poInMovements.reduce((sum, m) => sum + Number(m.quantity), 0);
                const totalMovementsCost = poInMovements.reduce((sum, m) => sum + (Number(m.quantity) * Number(m.cost || 0)), 0);
                if (totalMovementsQty > 0) {
                    poUnitCost = totalMovementsCost / totalMovementsQty;
                }
            }
            if (poUnitCost === 0) {
                poUnitCost = Number(variant.standardCost ?? 0) || Number(variant.buyPrice ?? 0);
            }

            const execCost = qtyProduced * poUnitCost;

            if (!aggregate.has(variantId)) {
                aggregate.set(variantId, {
                    productName: variant.product.name,
                    skuCode: variant.skuCode,
                    totalQty: 0,
                    primaryUnit: variant.primaryUnit,
                    orderIds: new Set<string>(),
                    totalCost: 0
                });
            }

            const current = aggregate.get(variantId)!;
            current.totalQty += qtyProduced;
            current.orderIds.add(exec.productionOrderId);
            current.totalCost += execCost;
        }

        const results: PackingReportItem[] = [];
        aggregate.forEach((data, variantId) => {
            const averageHpp = data.totalQty > 0 ? data.totalCost / data.totalQty : 0;
            results.push({
                productVariantId: variantId,
                productName: data.productName,
                skuCode: data.skuCode,
                totalQuantity: data.totalQty,
                primaryUnit: data.primaryUnit,
                workOrderCount: data.orderIds.size,
                averageHpp,
                totalCost: data.totalCost
            });
        });

        return results;
    }
}
