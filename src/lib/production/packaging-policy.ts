import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';

type StockOwner = { locationType: string; packagingOwnerCustomerId?: string | null };

export function assertPackagingSourceOwner(source: StockOwner, ownerCustomerId: string | null) {
    if (source.locationType === 'CUSTOMER_OWNED') {
        if (!source.packagingOwnerCustomerId || source.packagingOwnerCustomerId !== ownerCustomerId) {
            throw new BusinessRuleError('Pemilik stok titipan tidak cocok atau belum ditetapkan.');
        }
        return false;
    }
    if (source.locationType !== 'INTERNAL' || ownerCustomerId !== null || source.packagingOwnerCustomerId) {
        throw new BusinessRuleError('Kemasan milik perusahaan harus berasal dari stok internal.');
    }
    return true;
}

export function assertPackagingOwnerTransfer(source: StockOwner, target: StockOwner) {
    if (!source.packagingOwnerCustomerId && !target.packagingOwnerCustomerId) return;
    if (source.locationType !== 'CUSTOMER_OWNED' || target.locationType !== 'CUSTOMER_OWNED' ||
        !source.packagingOwnerCustomerId || source.packagingOwnerCustomerId !== target.packagingOwnerCustomerId) {
        throw new BusinessRuleError('Transfer tidak boleh mengubah pemilik stok titipan.');
    }
}

export function assertPackagingGroupTotal(groups: { quantity: number }[], total: number) {
    const sum = groups.reduce((value, group) => value.plus(group.quantity), new Prisma.Decimal(0));
    if (!sum.equals(new Prisma.Decimal(total))) {
        throw new BusinessRuleError('Jumlah kelompok merek harus sama dengan total hasil produksi.');
    }
}

/** Allocate only this posting's process costs; packaging belongs to its actual group. */
export function packagingGroupCosts(
    processCost: Prisma.Decimal,
    groups: { quantity: number; packagingCost: Prisma.Decimal }[],
) {
    const total = groups.reduce((sum, group) => sum.plus(group.quantity), new Prisma.Decimal(0));
    if (total.lte(0) || processCost.lt(0)) throw new BusinessRuleError('Alokasi biaya hasil tidak valid.');
    let allocated = new Prisma.Decimal(0);
    return groups.map((group, index) => {
        const share = index === groups.length - 1
            ? processCost.minus(allocated)
            : processCost.mul(group.quantity).div(total).toDecimalPlaces(4);
        allocated = allocated.plus(share);
        const amount = share.plus(group.packagingCost);
        return { amount, unitCost: amount.div(group.quantity).toDecimalPlaces(4) };
    });
}
