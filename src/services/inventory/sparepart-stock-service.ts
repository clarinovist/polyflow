import { MovementType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError } from '@/lib/errors/errors';
import type { SparePartStockInValues } from '@/lib/schemas/sparepart-stock';
import { logActivity } from '@/lib/tools/audit';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { isEligibleMaterialSourceLocation } from '@/lib/locations/resolve-location';

async function assertInternalLocation(tx: Prisma.TransactionClient, locationId: string) {
  const location = await tx.location.findUnique({ where: { id: locationId } });
  if (!location || !isEligibleMaterialSourceLocation(location)) {
    throw new BusinessRuleError('Lokasi tidak ditemukan atau bukan lokasi internal.', { locationId }, 'INVALID_SPAREPART_LOCATION');
  }
}

async function assertOperationalVariant(tx: Prisma.TransactionClient, productVariantId: string) {
  const variant = await tx.productVariant.findUnique({
    where: { id: productVariantId },
    select: { id: true, archivedAt: true, product: { select: { productType: true } } },
  });
  if (!variant || variant.archivedAt || variant.product.productType !== 'OPERATIONAL') {
    throw new BusinessRuleError('Hanya varian OPERATIONAL yang boleh jadi stok spare part.', { productVariantId }, 'INVALID_SPAREPART_VARIANT');
  }
}

export class SparePartStockService {
  static async getStock(locationId?: string) {
    return await prisma.inventory.findMany({
      where: {
        ...(locationId ? { locationId } : {}),
        productVariant: { archivedAt: null, product: { productType: 'OPERATIONAL' } },
      },
      select: {
        quantity: true,
        averageCost: true,
        location: { select: { id: true, name: true, slug: true } },
        productVariant: { select: { id: true, name: true, skuCode: true } },
      },
      orderBy: { productVariant: { name: 'asc' } },
      take: 300,
    });
  }

  static async stockIn(data: SparePartStockInValues, userId: string) {
    return await prisma.$transaction(async (tx) => {
      await assertInternalLocation(tx, data.locationId);
      await assertOperationalVariant(tx, data.productVariantId);
      await InventoryCoreService.incrementStockWithCost(tx, data.locationId, data.productVariantId, data.quantity, data.unitCost);
      const movement = await tx.stockMovement.create({
        data: {
          type: MovementType.IN,
          productVariantId: data.productVariantId,
          fromLocationId: null,
          toLocationId: data.locationId,
          quantity: data.quantity,
          cost: data.unitCost,
          reference: 'SPAREPART-IN ' + (data.note || ''),
          createdById: userId,
        },
      });
      await AccountingService.recordInventoryMovement(movement, tx);
      await logActivity({
        userId, action: 'SPAREPART_STOCK_IN', entityType: 'Inventory',
        entityId: data.locationId + ':' + data.productVariantId,
        details: 'Stok masuk spare part ' + data.quantity, tx,
      });
      return movement;
    });
  }
}
