import { prisma } from '@/lib/prisma';
import { MovementType, Prisma } from '@prisma/client';

export class ProductionCostService {
    /**
     * Calculate Batch Cost of Goods Manufactured (COGM)
     * Formula: (Total Material Cost + Conversion Cost) / Total Yield
     */
    static async calculateBatchCOGM(productionOrderId: string, tx?: Prisma.TransactionClient) {
        const client = tx || prisma;
        const order = await client.productionOrder.findUnique({ where: { id: productionOrderId } });
        if (!order) return 0;

        // 1. Total Material Cost
        // Query StockMovements 'OUT' associated with this PO
        // We use reference matching as established: "PO-{prefix}"
        const prefix = productionOrderId.slice(0, 8);
        const movements = await client.stockMovement.findMany({
            where: {
                reference: { contains: `PO-${prefix}` },
                type: MovementType.OUT
            }
        });

        let totalMaterialCost = 0;
        movements.forEach(m => {
            const c = Number(m.cost || 0);
            const q = Number(m.quantity);
            totalMaterialCost += c * q;
        });

        // 2. Conversion Cost
        const conversionCost = Number(order.estimatedConversionCost || 0);

        // 3. Total Cost
        const totalCost = totalMaterialCost + conversionCost;

        // 4. Net Yield
        const actualQty = Number(order.actualQuantity || 0);

        if (actualQty <= 0) return 0;

        return totalCost / actualQty;
    }
}
