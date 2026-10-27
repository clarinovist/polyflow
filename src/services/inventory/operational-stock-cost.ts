import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';

/**
 * Operational supplies (ATK) entering stock outside a priced goods receipt
 * must carry a real unit cost, so their journal is linked to this SKU and a
 * later internal usage can credit that basis. Never a sale price. Returns
 * null for other product types, whose behaviour is unchanged.
 */
export async function requireOperationalInboundCost(
    tx: Prisma.TransactionClient,
    productVariantId: string,
    locationId: string,
    unitCost?: Prisma.Decimal.Value | null,
): Promise<number | null> {
    const variant = await tx.productVariant.findUnique({
        where: { id: productVariantId },
        select: { skuCode: true, standardCost: true, buyPrice: true, product: { select: { productType: true } } },
    });
    if (variant?.product?.productType !== 'OPERATIONAL') return null;
    const stock = await tx.inventory.findUnique({
        where: { locationId_productVariantId: { locationId, productVariantId } },
        select: { averageCost: true },
    });
    const cost = [unitCost, stock?.averageCost, variant.standardCost, variant.buyPrice]
        .map((value) => new Prisma.Decimal(value ?? 0))
        .find((value) => value.isFinite() && value.gt(0));
    if (!cost) {
        throw new BusinessRuleError(
            `Barang operasional ${variant.skuCode} tidak boleh masuk stok tanpa nilai. Catat lewat Penerimaan Barang dengan harga, atau minta Finance mengisi harga pokok sebelum penyesuaian/opname.`,
            { productVariantId, locationId }, 'OPERATIONAL_STOCK_COST_REQUIRED',
        );
    }
    return cost.toDecimalPlaces(4).toNumber();
}
