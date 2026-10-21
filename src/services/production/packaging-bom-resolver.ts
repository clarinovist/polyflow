import type { Prisma } from '@prisma/client';

/** Brand SKU is stock identity; its recipe belongs to the mapped base product. */
export async function resolveProductionRecipeVariant(tx: Pick<Prisma.TransactionClient, 'productionPackagingOption'>, outputVariantId: string) {
    const option = await tx.productionPackagingOption.findUnique({ where: { outputVariantId }, select: { baseVariantId: true } });
    return option?.baseVariantId ?? outputVariantId;
}
