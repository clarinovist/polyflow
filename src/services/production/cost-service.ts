import { prisma } from '@/lib/core/prisma';
import { MovementType, Prisma } from '@prisma/client';

export class ProductionCostService {
    /**
     * Calculate Batch Cost of Goods Manufactured (COGM)
     * Formula: (Total Material Cost + Conversion Cost) / Total Yield
     */
    static async calculateBatchCOGM(productionOrderId: string, tx?: Prisma.TransactionClient) {
        const client = tx || prisma;
        const order = await client.productionOrder.findUnique({ 
            where: { id: productionOrderId },
            include: { bom: { select: { productVariantId: true } } }
        });
        if (!order) return 0;

        const fgVariantId = order.bom?.productVariantId;

        // 1. Total Material Cost
        // Query ALL StockMovements (IN and OUT) associated with this PO
        // Optimized: Use structured relation with fallback for legacy data
        const movements = await client.stockMovement.findMany({
            where: {
                OR: [
                    { productionOrderId: order.id },
                    { reference: { contains: `PO-${order.orderNumber}` } }
                ]
            }
        });

        let totalMaterialCost = 0;
        movements.forEach(m => {
            // Exclude movements of the finished good itself (e.g. FG output IN, or voided FG OUT)
            if (fgVariantId && m.productVariantId === fgVariantId) return;

            const c = Number(m.cost || 0);
            const q = Number(m.quantity);
            
            if (m.type === MovementType.OUT) {
                totalMaterialCost += c * q;
            } else if (m.type === MovementType.IN) {
                totalMaterialCost -= c * q;
            }
        });

        // 2. Conversion Cost
        let conversionCost = Number(order.estimatedConversionCost || 0);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((order as any).isMaklon) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const maklonCosts = await (client as any).maklonCostItem.findMany({
                where: { productionOrderId: order.id }
            });
            conversionCost = maklonCosts.reduce(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (sum: number, item: any) => sum + Number(item.amount), 0
            );
        }

        // 3. Total Cost
        const totalCost = totalMaterialCost + conversionCost;

        // 4. Net Yield
        const actualQty = Number(order.actualQuantity || 0);

        if (actualQty <= 0) return 0;

        return totalCost / actualQty;
    }
}
