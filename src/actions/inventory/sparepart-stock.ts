'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { sparePartStockInSchema } from '@/lib/schemas/sparepart-stock';
import { SparePartStockService } from '@/services/inventory/sparepart-stock-service';

export const getSparePartStock = withTenant(async function getSparePartStock(locationId?: string) {
  return safeAction(async () => {
    await requireAuth();
    const [rows, locations] = await Promise.all([
      SparePartStockService.getStock(locationId),
      prisma.location.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' }, take: 100 }).catch(() => []),
    ]);
    return serializeData({ rows, locations });
  });
});

export const getOperationalVariants = withTenant(async function getOperationalVariants() {
  return safeAction(async () => {
    await requireAuth();
    const rows = await prisma.productVariant.findMany({
      where: { archivedAt: null, product: { productType: 'OPERATIONAL' } },
      select: { id: true, name: true, skuCode: true },
      orderBy: { name: 'asc' },
      take: 300,
    }).catch(() => []);
    return serializeData(rows);
  });
});

export const stockInSparePart = withTenant(async function stockInSparePart(input: unknown) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    const parsed = sparePartStockInSchema.parse(input);
    await SparePartStockService.stockIn(parsed, userId);
    return serializeData({ ok: true });
  });
});
