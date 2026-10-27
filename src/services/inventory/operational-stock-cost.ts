import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';

/**
 * Unit cost of stock entering through an adjustment or a stock-count gain.
 * The same value feeds the location average, the movement cost and the
 * journal, so the posted value always equals the SKU basis. Order: entered
 * cost, location average, standard cost, buy price; never the sale price.
 * Operational supplies (ATK) without any source are rejected, since a later
 * internal usage must credit a real basis; other stock enters at an explicit
 * zero rather than booking a gain priced from a fallback.
 */
export async function resolveInboundAdjustmentCost(
    tx: Prisma.TransactionClient,
    productVariantId: string,
    locationId: string,
    unitCost?: Prisma.Decimal.Value | null,
): Promise<number> {
    const variant = await tx.productVariant.findUnique({
        where: { id: productVariantId },
        select: { skuCode: true, standardCost: true, buyPrice: true, product: { select: { productType: true } } },
    });
    const stock = await tx.inventory.findUnique({
        where: { locationId_productVariantId: { locationId, productVariantId } },
        select: { averageCost: true },
    });
    const cost = [unitCost, stock?.averageCost, variant?.standardCost, variant?.buyPrice]
        .map((value) => new Prisma.Decimal(value ?? 0))
        .find((value) => value.isFinite() && value.gt(0));
    if (cost) return cost.toDecimalPlaces(4).toNumber();
    if (variant?.product?.productType === 'OPERATIONAL') {
        throw new BusinessRuleError(
            `Barang operasional ${variant.skuCode} tidak boleh masuk stok tanpa nilai. Catat lewat Penerimaan Barang dengan harga, atau minta Finance mengisi harga pokok sebelum penyesuaian/opname.`,
            { productVariantId, locationId }, 'OPERATIONAL_STOCK_COST_REQUIRED',
        );
    }
    return 0;
}
