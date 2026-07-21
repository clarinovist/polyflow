'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';

export const getProduct360Overview = withTenant(async function getProduct360Overview(productVariantId: string) {
  return safeAction(async () => {
    await requireAuth();
    const variant = await prisma.productVariant.findUnique({
      where: { id: productVariantId },
      include: {
        product: true,
        preferredSupplier: { select: { id: true, name: true, code: true } },
      },
    });
    if (!variant) return null;

    const [inventories, batches, bomAsProduct, bomAsIngredient, costHistory, reservations] = await Promise.all([
      prisma.inventory.findMany({
        where: { productVariantId },
        include: { location: { select: { id: true, name: true, slug: true } } },
      }),
      prisma.batch.findMany({
        where: { productVariantId },
        orderBy: { expiryDate: 'asc' },
        include: { location: { select: { name: true } } },
      }),
      prisma.bom.findMany({
        where: { productVariantId, isActive: true },
        select: { id: true, name: true, outputQuantity: true, isDefault: true },
      }),
      prisma.bomItem.findMany({
        where: { productVariantId },
        include: {
          bom: { select: { id: true, name: true, productVariant: { select: { name: true, skuCode: true } } } },
        },
      }),
      prisma.costHistory.findMany({
        where: { productVariantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.stockReservation.findMany({
        where: { productVariantId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalQty = inventories.reduce((s, inv) => s + Number(inv.quantity), 0);
    const totalValue = inventories.reduce((s, inv) => s + Number(inv.quantity) * Number(inv.averageCost ?? variant.standardCost ?? 0), 0);

    return {
      variant,
      totalQty,
      totalValue,
      inventories,
      batches,
      bomAsProduct,
      bomAsIngredient,
      costHistory,
      reservations,
    };
  });
});

export const listStockByLocation = withTenant(async function listStockByLocation(productVariantId: string) {
  return safeAction(async () => {
    await requireAuth();
    return prisma.inventory.findMany({
      where: { productVariantId },
      include: {
        location: { select: { id: true, name: true, slug: true, locationType: true } },
      },
      orderBy: { quantity: 'desc' },
    });
  });
});

export const listBatchesByProductVariant = withTenant(async function listBatchesByProductVariant(productVariantId: string) {
  return safeAction(async () => {
    await requireAuth();
    return prisma.batch.findMany({
      where: { productVariantId },
      include: { location: { select: { name: true } } },
      orderBy: { expiryDate: 'asc' },
    });
  });
});

export const listCostHistoryByProductVariant = withTenant(async function listCostHistoryByProductVariant(productVariantId: string) {
  return safeAction(async () => {
    await requireAuth();
    return prisma.costHistory.findMany({
      where: { productVariantId },
      orderBy: { createdAt: 'desc' },
    });
  });
});

export const listRecentMovementsByProductVariant = withTenant(async function listRecentMovementsByProductVariant(productVariantId: string) {
  return safeAction(async () => {
    await requireAuth();
    return prisma.stockMovement.findMany({
      where: { productVariantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
    });
  });
});
