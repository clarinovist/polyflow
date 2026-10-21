import type { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { assertPackagingOwnerTransfer } from '@/lib/production/packaging-policy';

export async function validatePackagingTransfer(tx: Prisma.TransactionClient, sourceId: string, targetId: string) {
    const locations = await tx.location.findMany({ where: { id: { in: [sourceId, targetId] } } });
    const source = locations.find((location) => location.id === sourceId);
    const target = locations.find((location) => location.id === targetId);
    if (!source || !target) throw new BusinessRuleError('Lokasi transfer tidak ditemukan.');
    assertPackagingOwnerTransfer(source, target);
    return source.packagingOwnerCustomerId;
}
