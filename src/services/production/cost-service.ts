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
    static async calculateBatchOutputValuation(
        productionOrderId: string,
        quantity: number,
        tx: Prisma.TransactionClient,
        materialRoundingAdjustment = 0,
    ) {
        const basis = await this.calculateBatchCostBasis(productionOrderId, tx);
        const persistedQuantity = new Prisma.Decimal(quantity).toDecimalPlaces(4);
        // First output also covers manually issued materials. Later results only
        // carry THIS backflush's rounding, never average old cents into new costs.
        const adjustment = basis.actualQty.eq(persistedQuantity)
            ? basis.roundedMaterial.minus(basis.rawMaterial.toDecimalPlaces(2))
            : new Prisma.Decimal(materialRoundingAdjustment);
        const total = basis.unitCost.mul(persistedQuantity).toDecimalPlaces(2).plus(adjustment);
        return {
            unitCost: persistedQuantity.gt(0) ? total.div(persistedQuantity).toNumber() : 0,
            journalTotal: total.toNumber(),
        };
    }

    static async calculateBatchCOGM(
        productionOrderId: string,
        tx?: Prisma.TransactionClient,
    ) {
        return (await this.calculateBatchCostBasis(productionOrderId, tx)).unitCost.toNumber();
    }

    private static async calculateBatchCostBasis(
        productionOrderId: string,
        tx?: Prisma.TransactionClient,
    ) {
        const client = tx || prisma;
        const order = await client.productionOrder.findUnique({
            where: { id: productionOrderId },
            include: { bom: { select: { productVariantId: true } } },
        });
        const zero = new Prisma.Decimal(0);
        if (!order) return { unitCost: zero, actualQty: zero, rawMaterial: zero, roundedMaterial: zero };

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

        const amounts = movements.map(movement => {
            if (outputIds.has(movement.productVariantId)) return zero;
            const amount = new Prisma.Decimal(movement.cost ?? 0).mul(movement.quantity);
            if (movement.type === MovementType.OUT) return amount;
            if (movement.type === MovementType.IN &&
                (movement.reference?.startsWith('VOID:') ||
                 movement.reference?.startsWith('CORRECTION: PACKING_SCRAP_UNIT_'))) return amount.negated();
            return zero;
        });
        const rawMaterial = amounts.reduce((sum, amount) => sum.plus(amount), zero);
        const roundedMaterial = amounts.reduce((sum, amount) => sum.plus(amount.toDecimalPlaces(2)), zero);

        const conversionCost = order.isMaklon
            ? (await client.maklonCostItem.findMany({ where: { productionOrderId: order.id } }))
                .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))
            : new Prisma.Decimal(order.estimatedConversionCost ?? 0);
        const actualQty = new Prisma.Decimal(order.actualQuantity ?? 0);
        return { rawMaterial, roundedMaterial, actualQty,
            unitCost: actualQty.gt(0) ? rawMaterial.plus(conversionCost).div(actualQty) : zero,
        };
    }
}
