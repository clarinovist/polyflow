'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { Prisma, RateType, DeliveryStatus } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { createManualDeliveryOrderSchema } from '@/lib/schemas/sales';
import { logActivity } from '@/lib/tools/audit';
import { canTransition } from '@/lib/sales/delivery-status';
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
  totalCost?: number;
  totalCharge?: number;
  estimatedWeightKg?: number;
  destinationAddress?: string;
}) {
  return safeAction(async () => {
    const session = await requireAuth();
    const validatedData = createManualDeliveryOrderSchema.parse(data);

    // Verify sales order exists
    const salesOrder = await prisma.salesOrder.findUnique({
      where: { id: validatedData.salesOrderId },
      include: { items: true },
    });

    if (!salesOrder) throw new Error("Sales Order not found");

    // Generate DO number
    const lastDo = await prisma.deliveryOrder.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const year = new Date().getFullYear();
    let nextDoNumber = 1;
    if (lastDo?.orderNumber?.startsWith(`DO-${year}-`)) {
      const parts = lastDo.orderNumber.split('-');
      if (parts.length === 3) {
        nextDoNumber = parseInt(parts[2]) + 1;
      }
    }
    const doNumber = `DO-${year}-${nextDoNumber.toString().padStart(4, '0')}`;

    // Create DO with items from SO
    const deliveryOrder = await prisma.deliveryOrder.create({
      data: {
        orderNumber: doNumber,
        salesOrderId: validatedData.salesOrderId,
        sourceLocationId: validatedData.sourceLocationId,
        status: 'PENDING',
        deliveryDate: new Date(),
        trackingNumber: validatedData.trackingNumber,
        carrier: validatedData.carrier,
        notes: validatedData.notes,
        createdById: session.user.id,
        vehicleId: validatedData.vehicleId || null,
        appliedRateType: validatedData.appliedRateType as RateType || null,
        appliedCostRate: validatedData.appliedCostRate ?? null,
        appliedChargeRate: validatedData.appliedChargeRate ?? null,
        totalCost: validatedData.totalCost ?? null,
        totalCharge: validatedData.totalCharge ?? null,
        estimatedWeightKg: validatedData.estimatedWeightKg ?? null,
        destinationAddress: validatedData.destinationAddress || null,
        items: {
          create: salesOrder.items.map((item) => ({
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            enteredQuantity: item.enteredQuantity,
            enteredUnit: item.enteredUnit,
            conversionFactorSnapshot: item.conversionFactorSnapshot,
          })),
        },
      },
    });

    await logActivity({
      userId: session.user.id,
      action: 'CREATE_DELIVERY_ORDER',
      entityType: 'DeliveryOrder',
      entityId: deliveryOrder.id,
      details: `Manual Delivery Order ${doNumber} created for SO ${salesOrder.orderNumber}`,
    });

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
    if (!doRecord) throw new Error("Delivery Order tidak ditemukan.");

    if (!canTransition(doRecord.status, newStatus)) {
      throw new Error(
        `Tidak bisa ubah status dari ${doRecord.status} ke ${newStatus}.`,
      );
    }

    await prisma.deliveryOrder.update({
      where: { id: deliveryOrderId },
      data: { status: newStatus as DeliveryStatus },
    });

    // If target is DELIVERED, also sync the SalesOrder
    if (newStatus === 'DELIVERED') {
      const { SalesService } = await import('@/services/sales/sales-service');
      await SalesService.deliverOrder(doRecord.salesOrderId, session.user.id);
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
