import { Prisma, type StockMovement } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { skuInventoryBasis } from '@/services/inventory/internal-usage-accounting';

export const OPERATIONAL_ADJUSTMENT_MISSING_SOURCE_BASIS =
    'OPERATIONAL_ADJUSTMENT_MISSING_SOURCE_BASIS';
const rupiah = (value: Prisma.Decimal) =>
    new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(
        value.toNumber(),
    );

/** Stock count / adjustment losses of office & operational supplies. */
export function isOperationalLoss(
    movement: StockMovement,
    productType: string | null | undefined,
) {
    return (
        movement.type === 'ADJUSTMENT' &&
        movement.toLocationId === null &&
        productType === 'OPERATIONAL'
    );
}

/**
 * A loss removes value at the location's WAC. Persist it on the movement so the
 * journal, reports and reversals agree, and so a master standard/sale price is
 * never used as the cost. Unknown or zero WAC is recorded as an explicit zero.
 */
export async function withOperationalLossCost(
    db: Prisma.TransactionClient,
    movement: StockMovement,
): Promise<StockMovement> {
    if (movement.cost?.gt(0)) return movement;
    if (!movement.fromLocationId)
        throw new BusinessRuleError(
            'Penyesuaian stok keluar tidak memiliki lokasi asal.',
        );
    const stock = await db.inventory.findUnique({
        where: {
            locationId_productVariantId: {
                locationId: movement.fromLocationId,
                productVariantId: movement.productVariantId,
            },
        },
        select: { averageCost: true },
    });
    const cost = new Prisma.Decimal(stock?.averageCost ?? 0);
    await db.stockMovement.update({
        where: { id: movement.id },
        data: { cost },
    });
    return { ...movement, cost };
}

/**
 * Credit only accounts that hold this SKU's posted receipt value: the resolved
 * account first (unchanged behaviour when it is funded), then the others in a
 * stable order. Never credit an unrelated account to force a stock count through.
 */
export async function allocateOperationalLossCredit(
    db: Prisma.TransactionClient,
    productVariantId: string,
    resolvedAccountId: string,
    amount: Prisma.Decimal,
    productName: string,
) {
    const basis = await skuInventoryBasis(db, productVariantId);
    const pools = [...basis]
        .filter(([, value]) => value.gt(0))
        .sort(([a], [b]) =>
            a === resolvedAccountId
                ? -1
                : b === resolvedAccountId
                  ? 1
                  : a.localeCompare(b),
        );
    const credits: Array<{ accountId: string; credit: Prisma.Decimal }> = [];
    let remaining = amount;
    for (const [accountId, value] of pools) {
        if (remaining.lte(0)) break;
        const credit = Prisma.Decimal.min(value, remaining);
        credits.push({ accountId, credit });
        remaining = remaining.minus(credit);
    }
    if (remaining.gt(0)) {
        throw new BusinessRuleError(
            `Nilai ${productName} yang tertaut ke jurnal persediaan kurang Rp${rupiah(remaining)} untuk penyesuaian ini. Minta Finance menautkan saldo awal atau penerimaannya sebelum menyimpan; jangan ubah jumlah opname untuk melewati pemeriksaan ini.`,
            undefined,
            OPERATIONAL_ADJUSTMENT_MISSING_SOURCE_BASIS,
        );
    }
    return credits;
}
