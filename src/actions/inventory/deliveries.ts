'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { createManualDeliveryOrderSchema } from '@/lib/schemas/sales';
import { logActivity } from '@/lib/tools/audit';

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
