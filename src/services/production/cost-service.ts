import { prisma } from '@/lib/core/prisma';
import { MovementType, Prisma } from '@prisma/client';

export class ProductionCostService {
    static async calculateBatchTotalCost(productionOrderId: string, tx: Prisma.TransactionClient) {
        const order = await tx.productionOrder.findUniqueOrThrow({ where: { id: productionOrderId } });
        const movements = await tx.stockMovement.findMany({ where: { productionOrderId } });
        const groups = await tx.productionOutputGroup.findMany({ where: { execution: { productionOrderId } }, select: { productVariantId: true } });
        const outputIds = new Set(groups.map((group) => group.productVariantId));
        let amount = new Prisma.Decimal(0);
        for (const movement of movements) {
            if (outputIds.has(movement.productVariantId)) continue;
            const cost = new Prisma.Decimal(movement.cost ?? 0).mul(movement.quantity);
            if (movement.type === 'OUT') amount = amount.plus(cost);
            else if (movement.type === 'IN' && movement.reversalOfId) amount = amount.minus(cost);
        }
        const conversion = order.isMaklon
            ? (await tx.maklonCostItem.findMany({ where: { productionOrderId } })).reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))
            : new Prisma.Decimal(order.estimatedConversionCost ?? 0);
        return amount.plus(conversion);
    }

    /**
     * Calculate Batch Cost of Goods Manufactured (COGM)
     * Formula: (Total Material Cost + Conversion Cost) / Total Yield
     */
    static async calculateBatchCOGM(
        productionOrderId: string,
        tx?: Prisma.TransactionClient,
    ) {
        const client = tx || prisma;
        const order = await client.productionOrder.findUnique({
            where: { id: productionOrderId },
            include: { bom: { select: { productVariantId: true } } },
        });
        if (!order) return 0;

        const fgVariantId = order.bom?.productVariantId;
        const packagedOutputs = order.actualPackagingEnabled ? await client.productionOutputGroup.findMany({
            where: { execution: { productionOrderId } },
            select: { productVariantId: true },
        }) : [];
        const outputIds = new Set([fgVariantId, ...packagedOutputs.map((group) => group.productVariantId)].filter((id): id is string => Boolean(id)));

        // 1. Total Material Cost
        // Query ALL StockMovements (IN and OUT) associated with this PO
        // Optimized: Use structured relation with fallback for legacy data
        const movements = await client.stockMovement.findMany({
            where: {
                OR: [
                    { productionOrderId: order.id },
                    { reference: { contains: `PO-${order.orderNumber}` } },
                ],
            },
        });

        let totalMaterialCost = 0;
        movements.forEach((m) => {
            // Exclude movements of the finished good itself (e.g. FG output IN, or voided FG OUT)
            if (outputIds.has(m.productVariantId)) return;

            const c = Number(m.cost || 0);
            const q = Number(m.quantity);

            if (m.type === MovementType.OUT) {
                totalMaterialCost += c * q;
            } else if (
                m.type === MovementType.IN &&
                (m.reference?.startsWith('VOID:') ||
                    m.reference?.startsWith(
                        'CORRECTION: PACKING_SCRAP_UNIT_',
                    ))
            ) {
                // Only IN rows that explicitly reverse/correct a production
                // issue reduce COGM. Ordinary production IN rows for scrap or
                // by-products must not offset consumed material.
                totalMaterialCost -= c * q;
            }
        });

        // 2. Conversion Cost
        let conversionCost = Number(order.estimatedConversionCost || 0);

        if (order.isMaklon) {
            const maklonCosts = await client.maklonCostItem.findMany({
                where: { productionOrderId: order.id },
            });
            conversionCost = maklonCosts.reduce(
                (sum, item) => sum + Number(item.amount),
                0,
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
