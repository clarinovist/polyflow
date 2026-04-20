import { Prisma } from '@prisma/client';

import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';

import { ProductionMaterialService } from './material-service';

export async function recordExecutionScrap(params: {
    tx: Prisma.TransactionClient;
    productionOrderId: string;
    executionId: string;
    scrapQuantity: number;
    scrapProngkolQty?: number;
    scrapDaunQty?: number;
    userId?: string;
}) {
    const { tx, productionOrderId, executionId, scrapQuantity, scrapProngkolQty = 0, scrapDaunQty = 0, userId } = params;

    if (scrapProngkolQty <= 0 && scrapDaunQty <= 0 && scrapQuantity <= 0) {
        return;
    }

    const scrapLocation = await tx.location.findUnique({
        where: { slug: WAREHOUSE_SLUGS.SCRAP }
    });

    if (!scrapLocation) {
        return;
    }

    if (scrapProngkolQty > 0) {
        const variant = await tx.productVariant.findUnique({ where: { skuCode: 'SCRAP-PRONGKOL' } });
        if (variant) {
            await ProductionMaterialService.recordScrap({
                productionOrderId,
                productVariantId: variant.id,
                locationId: scrapLocation.id,
                quantity: scrapProngkolQty,
                reason: 'Production Process Waste (Lumps)',
                userId
            }, tx);
            await tx.scrapRecord.updateMany({
                where: { productionOrderId, productVariantId: variant.id, locationId: scrapLocation.id, quantity: scrapProngkolQty },
                data: { productionExecutionId: executionId }
            });
        } else {
            console.warn('Scrap variant SCRAP-PRONGKOL not found. Scrap tracking for this run will be recorded as execution data only.');
        }
    }

    if (scrapDaunQty > 0) {
        const variant = await tx.productVariant.findUnique({ where: { skuCode: 'SCRAP-DAUN' } });
        if (variant) {
            await ProductionMaterialService.recordScrap({
                productionOrderId,
                productVariantId: variant.id,
                locationId: scrapLocation.id,
                quantity: scrapDaunQty,
                reason: 'Production Process Waste (Trim)',
                userId
            }, tx);
            await tx.scrapRecord.updateMany({
                where: { productionOrderId, productVariantId: variant.id, locationId: scrapLocation.id, quantity: scrapDaunQty },
                data: { productionExecutionId: executionId }
            });
        } else {
            console.warn('Scrap variant SCRAP-DAUN not found. Scrap tracking for this run will be recorded as execution data only.');
        }
    }
}