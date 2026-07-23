'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { Prisma, RateType, DeliveryStatus } from '@prisma/client';
import { safeAction, NotFoundError, BusinessRuleError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import {
  createManualDeliveryOrderSchema,
  updateDeliveryPricingSchema,
  updateDeliveryItemQuantitiesSchema,
  saveDeliveryLoadVerificationSchema,
} from '@/lib/schemas/sales';
import { logActivity } from '@/lib/tools/audit';
import { canTransition } from '@/lib/sales/delivery-status';
import { computeDeliveryTotals } from '@/lib/sales/delivery-pricing';
import { getActiveTariff } from '@/actions/sales/vehicle-tariffs';
import { revalidatePath } from 'next/cache';

export const getDeliveryOrders = withTenant(
async function getDeliveryOrders(dateRange?: { startDate?: Date, endDate?: Date }) {
    return safeAction(async () => {
        // Always include open (PENDING/LOADING) DOs so drafts don't "disappear"
        // when outside the selected deliveryDate month filter.
        const where: Prisma.DeliveryOrderWhereInput = {};
        if (dateRange?.startDate && dateRange?.endDate) {
            where.OR = [
                {
                    deliveryDate: {
                        gte: dateRange.startDate,
                        lte: dateRange.endDate,
                    },
                },
                {
                    status: { in: [DeliveryStatus.PENDING, DeliveryStatus.LOADING] },
                },
            ];
        }

        const deliveryOrders = await prisma.deliveryOrder.findMany({
            where,
            orderBy: [
                { status: 'asc' }, // rough: open statuses tend to sort usefully with createdAt
                { createdAt: 'desc' },
            ],
            include: {
                salesOrder: {
                    select: {
                        orderNumber: true,
                        customer: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
                sourceLocation: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        // Surface open DOs first for operators
        const open = deliveryOrders.filter(
            (d) => d.status === DeliveryStatus.PENDING || d.status === DeliveryStatus.LOADING,
        );
        const rest = deliveryOrders.filter(
            (d) => d.status !== DeliveryStatus.PENDING && d.status !== DeliveryStatus.LOADING,
        );
        return [...open, ...rest];
    });
}
);
export const getDeliveryOrderById = withTenant(
async function getDeliveryOrderById(id: string) {
    return safeAction(async () => {
        const deliveryOrder = await prisma.deliveryOrder.findUnique({
            where: { id },
            include: {
                salesOrder: {
                    include: {
                        customer: true,
                    },
                },
                sourceLocation: true,
                vehicle: true,
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true,
                            },
                        },
                    },
                },
                createdBy: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        return deliveryOrder;
    });
}
);

export const createManualDeliveryOrder = withTenant(
async function createManualDeliveryOrder(data: {
  salesOrderId: string;
  sourceLocationId: string;
  carrier?: string;
  trackingNumber?: string;
  notes?: string;
  vehicleId?: string;
  appliedRateType?: string;
  appliedCostRate?: number;
  appliedChargeRate?: number;
  appliedRouteName?: string;
  totalCost?: number;
  totalCharge?: number;
  estimatedWeightKg?: number;
  destinationAddress?: string;
}) {
  return safeAction(async () => {
    const session = await requireAuth();
    const validatedData = createManualDeliveryOrderSchema.parse(data);

    // Single source of truth: hardened create (D1/D6/D7/D12) — no stock deduct
    const { createDeliveryOrderFromSalesOrder } = await import(
      '@/services/sales/delivery-fulfillment-service'
    );
    const deliveryOrder = await createDeliveryOrderFromSalesOrder({
      salesOrderId: validatedData.salesOrderId,
      sourceLocationId: validatedData.sourceLocationId,
      userId: session.user.id,
      carrier: validatedData.carrier,
      trackingNumber: validatedData.trackingNumber,
      notes: validatedData.notes,
      vehicleId: validatedData.vehicleId,
      appliedRateType: validatedData.appliedRateType,
      appliedCostRate: validatedData.appliedCostRate,
      appliedChargeRate: validatedData.appliedChargeRate,
      appliedRouteName: validatedData.appliedRouteName ?? undefined,
      totalCost: validatedData.totalCost,
      totalCharge: validatedData.totalCharge,
      estimatedWeightKg: validatedData.estimatedWeightKg,
      destinationAddress: validatedData.destinationAddress,
    });

    // Sync SO shipping cost from DO charges
    try {
      const { syncSalesOrderShippingFromDeliveries } = await import('@/services/sales/delivery-shipping-sync');
      await syncSalesOrderShippingFromDeliveries(validatedData.salesOrderId, {
        userId: session.user.id,
      });
    } catch (err) {
      console.warn('[delivery-shipping-sync] sync failed (non-blocking):', err);
    }

    revalidatePath('/sales/deliveries');
    revalidatePath(`/sales/orders/${validatedData.salesOrderId}`);
    revalidatePath('/warehouse/outgoing');

    return deliveryOrder;
  });
}
);

/**
 * Update delivery order status with transition validation.
 * When target = DELIVERED, also calls deliverOrder to sync SalesOrder.
 */
export const updateDeliveryStatus = withTenant(
async function updateDeliveryStatus(
  deliveryOrderId: string,
  newStatus: string,
) {
  return safeAction(async () => {
    const session = await requireAuth();

    const doRecord = await prisma.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      select: { id: true, status: true, salesOrderId: true, orderNumber: true },
    });
    if (!doRecord) throw new NotFoundError("Delivery Order", deliveryOrderId);

    if (!canTransition(doRecord.status, newStatus)) {
      throw new BusinessRuleError(
        `Tidak dapat mengubah status dari ${doRecord.status} ke ${newStatus}.`,
        { from: doRecord.status, to: newStatus, deliveryOrderId },
        "INVALID_DELIVERY_STATUS",
      );
    }

    // When transitioning to SHIPPED → commit stock (all-in-one)
    if (newStatus === 'SHIPPED') {
      const { commitDeliveryShipment } = await import('@/services/sales/delivery-fulfillment-service');
      await commitDeliveryShipment(deliveryOrderId, session.user.id);
    } else if (newStatus === 'LOADING') {
      // Set loadingStartedAt when transitioning to LOADING
      await prisma.deliveryOrder.update({
        where: { id: deliveryOrderId },
        data: {
          status: newStatus as DeliveryStatus,
          loadingStartedAt: new Date(),
          loadingStartedById: session.user.id,
        },
      });
    } else {
      // For all other transitions, just update status
      await prisma.deliveryOrder.update({
        where: { id: deliveryOrderId },
        data: { status: newStatus as DeliveryStatus },
      });
    }

    // If target is DELIVERED, also sync the SalesOrder
    if (newStatus === 'DELIVERED') {
      const { SalesService } = await import('@/services/sales/sales-service');
      await SalesService.deliverOrder(doRecord.salesOrderId, session.user.id);
    }

    // Sync SO shipping cost when DO status changes (CANCELLED/RETURNED affect sum)
    if (newStatus === 'CANCELLED' || newStatus === 'RETURNED') {
      try {
        const { syncSalesOrderShippingFromDeliveries } = await import('@/services/sales/delivery-shipping-sync');
        await syncSalesOrderShippingFromDeliveries(doRecord.salesOrderId, {
          userId: session.user.id,
        });
      } catch (err) {
        console.warn('[delivery-shipping-sync] sync failed (non-blocking):', err);
      }
    }

    await logActivity({
      userId: session.user.id,
      action: 'UPDATE_DELIVERY_STATUS',
      entityType: 'DeliveryOrder',
      entityId: deliveryOrderId,
      details: `DO ${doRecord.orderNumber}: ${doRecord.status} -> ${newStatus}`,
    });

    revalidatePath('/sales/deliveries');
    revalidatePath(`/sales/deliveries/${deliveryOrderId}`);
    revalidatePath(`/sales/orders/${doRecord.salesOrderId}`);
    revalidatePath('/warehouse/outgoing');
    revalidatePath(`/warehouse/outgoing/${deliveryOrderId}`);

    return { success: true };
  });
});

/**
 * Update delivery order pricing (vehicle, route, rates, weight, totals).
 * Auto-resolves tariff if vehicle changed and rates are empty.
 * Recomputes totals from rates when recomputeFromRates=true (default).
 * Calls syncSalesOrderShippingFromDeliveries after update.
 */
export const updateDeliveryPricing = withTenant(
async function updateDeliveryPricing(data: {
  deliveryOrderId: string;
  vehicleId?: string | null;
  appliedRouteName?: string | null;
  appliedRateType?: string | null;
  appliedCostRate?: number | null;
  appliedChargeRate?: number | null;
  estimatedWeightKg?: number | null;
  totalCost?: number | null;
  totalCharge?: number | null;
  recomputeFromRates?: boolean;
}) {
  return safeAction(async () => {
    const session = await requireAuth();
    const validated = updateDeliveryPricingSchema.parse(data);

    // Load DO
    const doRecord = await prisma.deliveryOrder.findUnique({
      where: { id: validated.deliveryOrderId },
      select: {
        id: true, status: true, salesOrderId: true, orderNumber: true,
        vehicleId: true, appliedRouteName: true,
        appliedRateType: true, appliedCostRate: true, appliedChargeRate: true,
        estimatedWeightKg: true, totalCost: true, totalCharge: true,
      },
    });
    if (!doRecord) throw new NotFoundError("Delivery Order", validated.deliveryOrderId);
    if (doRecord.status === 'CANCELLED') {
      throw new BusinessRuleError(
        "Cannot edit pricing for a cancelled Delivery Order.",
        { status: doRecord.status, deliveryOrderId: validated.deliveryOrderId },
        "INVALID_DELIVERY_STATUS",
      );
    }

    // Resolve fields — use provided values or keep existing
    const vehicleId = validated.vehicleId !== undefined ? validated.vehicleId : doRecord.vehicleId;
    const routeName = validated.appliedRouteName !== undefined ? validated.appliedRouteName : doRecord.appliedRouteName;
    const weightKg = validated.estimatedWeightKg !== undefined
      ? (validated.estimatedWeightKg != null ? Number(validated.estimatedWeightKg) : null)
      : (doRecord.estimatedWeightKg ? Number(doRecord.estimatedWeightKg) : null);

    let rateType = validated.appliedRateType ?? doRecord.appliedRateType;
    let costRate = validated.appliedCostRate ?? (doRecord.appliedCostRate ? Number(doRecord.appliedCostRate) : null);
    let chargeRate = validated.appliedChargeRate ?? (doRecord.appliedChargeRate ? Number(doRecord.appliedChargeRate) : null);
    let totalCost = validated.totalCost ?? (doRecord.totalCost ? Number(doRecord.totalCost) : null);
    let totalCharge = validated.totalCharge ?? (doRecord.totalCharge ? Number(doRecord.totalCharge) : null);

    // If vehicle changed and rates are empty → auto-resolve tariff
    if (vehicleId && (!rateType || costRate == null || chargeRate == null)) {
      const tariffResult = await getActiveTariff(vehicleId, routeName);
      const tariff = tariffResult?.success ? tariffResult.data : null;
      if (tariff) {
        rateType = tariff.rateType;
        costRate = Number(tariff.costRate);
        chargeRate = Number(tariff.chargeRate);
      }
    }

    // Recompute totals from rates if requested and rates are available
    if (validated.recomputeFromRates && rateType && costRate != null && chargeRate != null) {
      const computed = computeDeliveryTotals({
        rateType: rateType as 'PER_KG' | 'FLAT_RATE',
        costRate,
        chargeRate,
        weightKg,
        minKg: null, // minKg from tariff not stored on DO; use 0
      });
      totalCost = computed.totalCost;
      totalCharge = computed.totalCharge;
    }

    // Update DO
    const updated = await prisma.deliveryOrder.update({
      where: { id: validated.deliveryOrderId },
      data: {
        ...(vehicleId !== undefined && { vehicleId: vehicleId || null }),
        ...(routeName !== undefined && { appliedRouteName: routeName || null }),
        ...(rateType && { appliedRateType: rateType as RateType }),
        ...(costRate != null && { appliedCostRate: costRate }),
        ...(chargeRate != null && { appliedChargeRate: chargeRate }),
        ...(weightKg != null && { estimatedWeightKg: weightKg }),
        ...(totalCost != null && { totalCost }),
        ...(totalCharge != null && { totalCharge }),
      },
    });

    await logActivity({
      userId: session.user.id,
      action: 'UPDATE_DELIVERY_PRICING',
      entityType: 'DeliveryOrder',
      entityId: validated.deliveryOrderId,
      details: `DO ${doRecord.orderNumber}: pricing updated (charge=${totalCharge ?? 'n/a'})`,
    });

    // Sync SO shipping (Phase 3 service — stub for now)
    let shippingSync: { synced: boolean; reason: string; shippingCost: number } = {
      synced: false,
      reason: 'NOT_IMPLEMENTED',
      shippingCost: 0,
    };
    try {
      const { syncSalesOrderShippingFromDeliveries } = await import('@/services/sales/delivery-shipping-sync');
      const result = await syncSalesOrderShippingFromDeliveries(doRecord.salesOrderId, {
        userId: session.user.id,
      });
      shippingSync = {
        synced: result.synced,
        reason: result.reason,
        shippingCost: result.shippingCost,
      };
    } catch (err) {
      console.warn("[delivery-shipping-sync] sync failed (non-blocking):", err);
    }

    revalidatePath('/sales/deliveries');
    revalidatePath(`/sales/deliveries/${validated.deliveryOrderId}`);
    revalidatePath(`/sales/orders/${doRecord.salesOrderId}`);

    return { deliveryOrder: updated, shippingSync };
  });
});

/**
 * Server action: fetch stock readiness for a Delivery Order.
 * Used by DeliveryOrderDetail (client component) to show soft warning banner.
 * Client must never import the Prisma service directly.
 */
export const fetchDeliveryStockReadiness = withTenant(
async function fetchDeliveryStockReadiness(deliveryOrderId: string) {
  return safeAction(async () => {
    await requireAuth();
    const { getDeliveryStockReadiness } = await import(
      '@/services/sales/delivery-fulfillment-service'
    );
    return getDeliveryStockReadiness(deliveryOrderId);
  });
});

/**
 * Update DO line quantities while PENDING/LOADING (before stock is committed).
 * Max qty per line = SO residual for that variant + current DO line qty
 * (PENDING does not consume deliveredQty yet).
 */
export const updateDeliveryItemQuantities = withTenant(
  async function updateDeliveryItemQuantities(data: {
    deliveryOrderId: string;
    items: Array<{ id: string; quantity: number }>;
  }) {
    return safeAction(async () => {
      const session = await requireAuth();
      const validated = updateDeliveryItemQuantitiesSchema.parse(data);

      const doRecord = await prisma.deliveryOrder.findUnique({
        where: { id: validated.deliveryOrderId },
        include: {
          items: true,
          salesOrder: {
            include: {
              items: {
                include: {
                  productVariant: { include: { product: true } },
                },
              },
            },
          },
        },
      });

      if (!doRecord) {
        throw new NotFoundError('Delivery Order', validated.deliveryOrderId);
      }

      if (
        doRecord.status !== DeliveryStatus.PENDING &&
        doRecord.status !== DeliveryStatus.LOADING
      ) {
        throw new BusinessRuleError(
          'Qty hanya bisa diubah saat Surat Jalan masih PENDING atau LOADING (sebelum stok dipotong).',
          { status: doRecord.status },
          'INVALID_DELIVERY_STATUS',
        );
      }

      const doItemById = new Map(doRecord.items.map((i) => [i.id, i]));

      for (const patch of validated.items) {
        const doItem = doItemById.get(patch.id);
        if (!doItem) {
          throw new BusinessRuleError(
            `Item SJ tidak ditemukan: ${patch.id}`,
            { itemId: patch.id },
          );
        }

        const soItem = doRecord.salesOrder.items.find(
          (si) => si.productVariantId === doItem.productVariantId,
        );
        if (!soItem) {
          throw new BusinessRuleError(
            'Item SJ tidak cocok dengan Sales Order.',
            { productVariantId: doItem.productVariantId },
          );
        }

        const soQty = Number(soItem.quantity);
        const delivered = Number(soItem.deliveredQty);
        // PENDING DO does not consume deliveredQty — max = SO residual (qty - delivered)
        const maxAllowed = Math.max(
          0,
          Math.round((soQty - delivered) * 10000) / 10000,
        );

        if (patch.quantity > maxAllowed + 1e-9) {
          throw new BusinessRuleError(
            `Qty melebihi sisa SO yang belum terkirim (maks ${maxAllowed}).`,
            {
              requested: patch.quantity,
              maxAllowed,
              soQty,
              delivered,
            },
          );
        }
      }

      await prisma.$transaction(async (tx) => {
        for (const patch of validated.items) {
          const doItem = doItemById.get(patch.id)!;
          const factor = doItem.conversionFactorSnapshot
            ? Number(doItem.conversionFactorSnapshot)
            : null;
          const enteredQty =
            factor && factor > 0
              ? Math.round((patch.quantity / factor) * 10000) / 10000
              : patch.quantity;

          await tx.deliveryOrderItem.update({
            where: { id: patch.id },
            data: {
              quantity: patch.quantity,
              enteredQuantity: enteredQty,
              // Qty change invalidates physical load verification
              verifiedQuantity: null,
              verifiedAt: null,
              verifiedById: null,
            },
          });
        }

        await tx.deliveryOrder.update({
          where: { id: validated.deliveryOrderId },
          data: {
            loadVerifiedAt: null,
            loadVerifiedById: null,
          },
        });
      });

      await logActivity({
        userId: session.user.id,
        action: 'UPDATE_DELIVERY_QTY',
        entityType: 'DeliveryOrder',
        entityId: validated.deliveryOrderId,
        details: `DO ${doRecord.orderNumber}: line quantities updated (verification cleared)`,
      });

      revalidatePath('/sales/deliveries');
      revalidatePath(`/sales/deliveries/${validated.deliveryOrderId}`);
      revalidatePath(`/sales/orders/${doRecord.salesOrderId}`);
      revalidatePath('/warehouse/outgoing');
      revalidatePath(`/warehouse/outgoing/${validated.deliveryOrderId}`);

      return { success: true };
    });
  },
);

/**
 * Save per-line verified quantities (physical count at load).
 * Does not lock header verification — use confirmDeliveryLoadVerified after all match.
 */
export const saveDeliveryLoadVerification = withTenant(
  async function saveDeliveryLoadVerification(data: {
    deliveryOrderId: string;
    items: Array<{ id: string; verifiedQuantity: number }>;
  }) {
    return safeAction(async () => {
      const session = await requireAuth();
      const validated = saveDeliveryLoadVerificationSchema.parse(data);

      const doRecord = await prisma.deliveryOrder.findUnique({
        where: { id: validated.deliveryOrderId },
        include: { items: true },
      });
      if (!doRecord) {
        throw new NotFoundError('Delivery Order', validated.deliveryOrderId);
      }
      if (
        doRecord.status !== DeliveryStatus.PENDING &&
        doRecord.status !== DeliveryStatus.LOADING
      ) {
        throw new BusinessRuleError(
          'Verifikasi muat hanya saat SJ PENDING atau LOADING.',
          { status: doRecord.status },
          'INVALID_DELIVERY_STATUS',
        );
      }

      const itemIds = new Set(doRecord.items.map((i) => i.id));
      for (const patch of validated.items) {
        if (!itemIds.has(patch.id)) {
          throw new BusinessRuleError(`Item SJ tidak ditemukan: ${patch.id}`, {
            itemId: patch.id,
          });
        }
      }

      const now = new Date();
      await prisma.$transaction(async (tx) => {
        for (const patch of validated.items) {
          await tx.deliveryOrderItem.update({
            where: { id: patch.id },
            data: {
              verifiedQuantity: patch.verifiedQuantity,
              verifiedAt: now,
              verifiedById: session.user.id,
            },
          });
        }
        // Any re-save unlocks header until confirm again
        await tx.deliveryOrder.update({
          where: { id: validated.deliveryOrderId },
          data: {
            loadVerifiedAt: null,
            loadVerifiedById: null,
          },
        });
      });

      await logActivity({
        userId: session.user.id,
        action: 'SAVE_DELIVERY_LOAD_VERIFICATION',
        entityType: 'DeliveryOrder',
        entityId: validated.deliveryOrderId,
        details: `DO ${doRecord.orderNumber}: saved ${validated.items.length} line verification qty`,
      });

      revalidatePath('/sales/deliveries');
      revalidatePath(`/sales/deliveries/${validated.deliveryOrderId}`);
      revalidatePath('/warehouse/outgoing');
      revalidatePath(`/warehouse/outgoing/${validated.deliveryOrderId}`);

      return { success: true };
    });
  },
);

/**
 * Lock load verification when every line has verifiedQuantity matching planned quantity.
 */
export const confirmDeliveryLoadVerified = withTenant(
  async function confirmDeliveryLoadVerified(deliveryOrderId: string) {
    return safeAction(async () => {
      const session = await requireAuth();

      const doRecord = await prisma.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include: { items: true },
      });
      if (!doRecord) throw new NotFoundError('Delivery Order', deliveryOrderId);
      if (
        doRecord.status !== DeliveryStatus.PENDING &&
        doRecord.status !== DeliveryStatus.LOADING
      ) {
        throw new BusinessRuleError(
          'Verifikasi muat hanya saat SJ PENDING atau LOADING.',
          { status: doRecord.status },
          'INVALID_DELIVERY_STATUS',
        );
      }
      if (doRecord.items.length === 0) {
        throw new BusinessRuleError('Surat Jalan tidak punya item untuk diverifikasi.');
      }

      for (const item of doRecord.items) {
        if (item.verifiedQuantity == null) {
          throw new BusinessRuleError(
            'Semua baris harus punya qty dihitung sebelum dikunci.',
            { itemId: item.id },
            'LOAD_VERIFY_INCOMPLETE',
          );
        }
        const planned = Number(item.quantity);
        const verified = Number(item.verifiedQuantity);
        if (Math.abs(planned - verified) > 1e-6) {
          throw new BusinessRuleError(
            'Ada selisih qty fisik vs perintah. Koreksi qty SJ atau hitung ulang sampai sesuai, lalu kunci.',
            {
              itemId: item.id,
              planned,
              verified,
            },
            'LOAD_VERIFY_MISMATCH',
          );
        }
      }

      await prisma.deliveryOrder.update({
        where: { id: deliveryOrderId },
        data: {
          loadVerifiedAt: new Date(),
          loadVerifiedById: session.user.id,
        },
      });

      await logActivity({
        userId: session.user.id,
        action: 'CONFIRM_DELIVERY_LOAD_VERIFIED',
        entityType: 'DeliveryOrder',
        entityId: deliveryOrderId,
        details: `DO ${doRecord.orderNumber}: load verification locked`,
      });

      revalidatePath('/sales/deliveries');
      revalidatePath(`/sales/deliveries/${deliveryOrderId}`);
      revalidatePath('/warehouse/outgoing');
      revalidatePath(`/warehouse/outgoing/${deliveryOrderId}`);

      return { success: true };
    });
  },
);
