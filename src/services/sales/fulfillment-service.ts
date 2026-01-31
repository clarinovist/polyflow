import { prisma } from '@/lib/prisma';
import { SalesOrderStatus, MovementType, ReservationStatus } from '@prisma/client';
import { logActivity } from '@/lib/audit';
import { InventoryService } from '@/services/inventory-service';
import { InvoiceService } from '@/services/invoice-service';

export async function markReadyToShip(id: string, userId: string) {
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Order not found");

    if (order.status !== SalesOrderStatus.IN_PRODUCTION && order.status !== SalesOrderStatus.CONFIRMED) {
        throw new Error(`Order must be IN_PRODUCTION or CONFIRMED. Got: ${order.status}`);
    }

    await prisma.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.READY_TO_SHIP }
    });

    await logActivity({
        userId,
        action: 'UPDATE_SALES_STATUS',
        entityType: 'SalesOrder',
        entityId: id,
        details: `Sales Order ${order.orderNumber} marked as Ready to Ship`
    });
}

export async function shipOrder(id: string, userId: string, trackingInfo?: { trackingNumber?: string, carrier?: string }) {
    const order = await prisma.salesOrder.findUnique({
        where: { id },
        include: { items: true }
    });

    if (!order) throw new Error("Order not found");
    if (order.status !== SalesOrderStatus.CONFIRMED && order.status !== SalesOrderStatus.READY_TO_SHIP) {
        throw new Error("Order must be CONFIRMED or READY_TO_SHIP to be shipped");
    }
    if (!order.sourceLocationId) throw new Error("Source location is missing");

    await prisma.$transaction(async (tx) => {
        for (const item of order.items) {
            const qty = item.quantity.toNumber();
            const locationId = order.sourceLocationId!;

            const reservations = await tx.stockReservation.findMany({
                where: {
                    referenceId: order.id,
                    productVariantId: item.productVariantId,
                    status: ReservationStatus.ACTIVE
                }
            });

            let needed = qty;
            for (const res of reservations) {
                if (needed <= 0) break;
                const resQty = res.quantity.toNumber();
                const consume = Math.min(resQty, needed);

                if (consume >= resQty) {
                    await tx.stockReservation.update({ where: { id: res.id }, data: { status: ReservationStatus.FULFILLED } });
                } else {
                    await tx.stockReservation.update({ where: { id: res.id }, data: { quantity: { decrement: consume } } });
                }

                needed -= consume;
            }

            await InventoryService.validateAndLockStock(tx, locationId, item.productVariantId, qty);
            await InventoryService.deductStock(tx, locationId, item.productVariantId, qty);

            await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId: item.productVariantId,
                    fromLocationId: locationId,
                    quantity: qty,
                    salesOrderId: order.id,
                    createdById: userId,
                    reference: `Shipment for ${order.orderNumber}`,
                    createdAt: new Date()
                }
            });
        }

        const lastDo = await tx.deliveryOrder.findFirst({
            orderBy: { createdAt: 'desc' }
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

        await tx.deliveryOrder.create({
            data: {
                orderNumber: doNumber,
                salesOrderId: order.id,
                sourceLocationId: order.sourceLocationId!,
                status: 'SHIPPED',
                deliveryDate: new Date(),
                trackingNumber: trackingInfo?.trackingNumber,
                carrier: trackingInfo?.carrier,
                createdById: userId,
                items: {
                    create: order.items.map(item => ({
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        notes: item.id
                    }))
                }
            }
        });

        await tx.salesOrder.update({
            where: { id },
            data: { status: SalesOrderStatus.SHIPPED }
        });

        await InvoiceService.createDraftInvoiceFromOrder(id, userId);

        await logActivity({
            userId,
            action: 'SHIP_SALES',
            entityType: 'SalesOrder',
            entityId: id,
            details: `Sales Order ${order.orderNumber} shipped. Created Delivery Order ${doNumber}`,
            tx
        });
    });
}

export async function deliverOrder(orderId: string, _userId: string) {
    await prisma.salesOrder.update({
        where: { id: orderId },
        data: { status: SalesOrderStatus.DELIVERED }
    });
}
