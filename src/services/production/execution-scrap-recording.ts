import { Prisma } from '@prisma/client';

import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';

import { ProductionMaterialService } from './material-service';

type ScrapKind = 'prongkol' | 'daun';

const SCRAP_VARIANT_LOOKUP: Record<
    ScrapKind,
    { skuCodes: string[]; nameContains: string; reason: string }
> = {
    prongkol: {
        skuCodes: ['AP000000', 'SCRAP-PRONGKOL'],
        nameContains: 'Prongkol',
        reason: 'Production Process Waste (Lumps)',
    },
    daun: {
        skuCodes: ['AD000000', 'SCRAP-DAUN'],
        nameContains: 'Daun',
        reason: 'Production Process Waste (Trim)',
    },
};

async function findExecutionScrapVariant(
    tx: Prisma.TransactionClient,
    kind: ScrapKind,
) {
    const lookup = SCRAP_VARIANT_LOOKUP[kind];
    for (const skuCode of lookup.skuCodes) {
        const variant = await tx.productVariant.findUnique({
            where: { skuCode },
        });
        if (variant) {
            return variant;
        }
    }

    return tx.productVariant.findFirst({
        where: {
            name: { contains: lookup.nameContains, mode: 'insensitive' },
            product: { productType: 'SCRAP' },
        },
        orderBy: { skuCode: 'asc' },
    });
}

export async function recordExecutionScrap(params: {
    tx: Prisma.TransactionClient;
    productionOrderId: string;
    executionId: string;
    scrapQuantity: number;
    scrapProngkolQty?: number;
    scrapDaunQty?: number;
    userId?: string;
}) {
    const {
        tx,
        productionOrderId,
        executionId,
        scrapQuantity,
        scrapProngkolQty = 0,
        scrapDaunQty = 0,
        userId,
    } = params;

    if (scrapProngkolQty <= 0 && scrapDaunQty <= 0 && scrapQuantity <= 0) {
        return;
    }

    const scrapLocation = await tx.location.findUnique({
        where: { slug: WAREHOUSE_SLUGS.SCRAP },
    });

    if (!scrapLocation) {
        return;
    }

    if (scrapProngkolQty > 0) {
        const variant = await findExecutionScrapVariant(tx, 'prongkol');
        if (variant) {
            await ProductionMaterialService.recordScrap(
                {
                    productionOrderId,
                    productVariantId: variant.id,
                    locationId: scrapLocation.id,
                    quantity: scrapProngkolQty,
                    reason: SCRAP_VARIANT_LOOKUP.prongkol.reason,
                    userId,
                },
                tx,
            );
            await tx.scrapRecord.updateMany({
                where: {
                    productionOrderId,
                    productVariantId: variant.id,
                    locationId: scrapLocation.id,
                    quantity: scrapProngkolQty,
                },
                data: { productionExecutionId: executionId },
            });
        } else {
            console.warn(
                'Scrap variant for prongkol not found. Scrap tracking for this run will be recorded as execution data only.',
            );
        }
    }

    if (scrapDaunQty > 0) {
        const variant = await findExecutionScrapVariant(tx, 'daun');
        if (variant) {
            await ProductionMaterialService.recordScrap(
                {
                    productionOrderId,
                    productVariantId: variant.id,
                    locationId: scrapLocation.id,
                    quantity: scrapDaunQty,
                    reason: SCRAP_VARIANT_LOOKUP.daun.reason,
                    userId,
                },
                tx,
            );
            await tx.scrapRecord.updateMany({
                where: {
                    productionOrderId,
                    productVariantId: variant.id,
                    locationId: scrapLocation.id,
                    quantity: scrapDaunQty,
                },
                data: { productionExecutionId: executionId },
            });
        } else {
            console.warn(
                'Scrap variant for daun not found. Scrap tracking for this run will be recorded as execution data only.',
            );
        }
    }
}
