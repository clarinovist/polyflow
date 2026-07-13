'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { Prisma, RateType, DeliveryStatus } from '@prisma/client';
import { safeAction, NotFoundError, BusinessRuleError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { createManualDeliveryOrderSchema, updateDeliveryPricingSchema } from '@/lib/schemas/sales';
import { logActivity } from '@/lib/tools/audit';
import { canTransition } from '@/lib/sales/delivery-status';
import { computeDeliveryTotals } from '@/lib/sales/delivery-pricing';
import { getActiveTariff } from '@/actions/sales/vehicle-tariffs';
import { revalidatePath } from 'next/cache';

export const getDeliveryOrders = withTenant(
async function getDeliveryOrders(dateRange?: { startDate?: Date, endDate?: Date }) {
    return safeAction(async () => {
        const where: Prisma.DeliveryOrderWhereInput = {};
        if (dateRange?.startDate && dateRange?.endDate) {
            where.deliveryDate = {
                gte: dateRange.startDate,
                lte: dateRange.endDate
            };
        }

        const deliveryOrders = await prisma.deliveryOrder.findMany({
            where,
            orderBy: {
                createdAt: 'desc',
            },
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

        return deliveryOrders;
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
        `Cannot change status from ${doRecord.status} to ${newStatus}.`,
        { from: doRecord.status, to: newStatus, deliveryOrderId },
        "INVALID_DELIVERY_STATUS",
      );
    }

    // When transitioning to SHIPPED → commit stock (all-in-one)
    if (newStatus === 'SHIPPED') {
      const { commitDeliveryShipment } = await import('@/services/sales/delivery-fulfillment-service');
      await commitDeliveryShipment(deliveryOrderId, session.user.id);
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
