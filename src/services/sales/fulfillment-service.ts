import { prisma } from '@/lib/core/prisma';
import { SalesOrderStatus, ReservationStatus, ReservationType, ProductType } from '@prisma/client';
import { logActivity } from '@/lib/tools/audit';
import { InvoiceService } from '@/services/finance/invoice-service';

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
        details: order.orderType === 'MAKLON_JASA'
            ? `Sales Order ${order.orderNumber} marked as Ready for Service Closure`
            : `Sales Order ${order.orderNumber} marked as Ready to Ship`
    });
}

/**
 * Ship a Sales Order.
 *
 * Thin orchestrator:
 *   1. Find open DO (PENDING/LOADING) for this SO
 *   2. If 1 exists → commitDeliveryShipment(thatDoId)
 *   3. If none → create DO PENDING (full residual) then commit
 *   4. If >1 open DO → error (user must pick from detail DO)
 *
 * Maintains backward compat: existing UI calling shipSalesOrder still works.
 */
export async function shipOrder(id: string, userId: string, trackingInfo?: { trackingNumber?: string; carrier?: string }) {
    const { createDeliveryOrderFromSalesOrder, commitDeliveryShipment } = await import('./delivery-fulfillment-service');

    const order = await prisma.salesOrder.findUnique({
        where: { id },
        include: { items: { include: { productVariant: { include: { product: true } } } } }
    });

    if (!order) throw new Error("Order not found");
    if (order.status !== SalesOrderStatus.CONFIRMED && order.status !== SalesOrderStatus.IN_PRODUCTION && order.status !== SalesOrderStatus.READY_TO_SHIP) {
        throw new Error("Order must be CONFIRMED, IN_PRODUCTION, or READY_TO_SHIP to be shipped");
    }
    if (!order.sourceLocationId) throw new Error("Source location is missing");

    const isMaklonServiceOnly =
        order.orderType === 'MAKLON_JASA' &&
        order.items.every(
            (item) => item.productVariant.product.productType === ProductType.SERVICE
        );

    // Maklon jasa-only: no physical DO / stock — close SO + draft invoice (legacy behavior)
    if (isMaklonServiceOnly) {
        await prisma.salesOrder.update({
            where: { id },
            data: { status: SalesOrderStatus.SHIPPED },
        });
        await prisma.stockReservation.updateMany({
            where: {
                referenceId: id,
                reservedFor: ReservationType.SALES_ORDER,
                status: ReservationStatus.ACTIVE,
            },
            data: { status: ReservationStatus.FULFILLED },
        });
        await InvoiceService.createDraftInvoiceFromOrder(id, userId);
        await logActivity({
            userId,
            action: 'SHIP_SALES',
            entityType: 'SalesOrder',
            entityId: id,
            details: `Sales Order ${order.orderNumber} closed as Maklon service order (no physical DO)`,
        });
        return { doNumber: null, created: false, serviceOnly: true };
    }

    // Check for existing open DOs
    const openDos = await prisma.deliveryOrder.findMany({
        where: {
            salesOrderId: id,
            status: { in: ['PENDING', 'LOADING'] },
        },
        select: { id: true, orderNumber: true },
    });

    if (openDos.length > 1) {
        throw new Error(
            `Ada ${openDos.length} Surat Jalan aktif untuk SO ini: ${openDos.map(d => d.orderNumber).join(', ')}. ` +
            `Gunakan halaman detail DO untuk memilih DO yang akan dikirim.`
        );
    }

    if (openDos.length === 1) {
        // Commit existing DO
        await commitDeliveryShipment(openDos[0].id, userId, trackingInfo);
        return { doNumber: openDos[0].orderNumber, created: false };
    }

    // No open DO → create one then commit
    const doRecord = await createDeliveryOrderFromSalesOrder({
        salesOrderId: id,
        sourceLocationId: order.sourceLocationId,
        userId,
        carrier: trackingInfo?.carrier,
        trackingNumber: trackingInfo?.trackingNumber,
    });

    await commitDeliveryShipment(doRecord.id, userId, trackingInfo);
    return { doNumber: doRecord.orderNumber, created: true };
}

export async function deliverOrder(orderId: string, userId: string) {
    await prisma.$transaction(async (tx) => {
        const order = await tx.salesOrder.findUnique({ where: { id: orderId } });
        if (!order) throw new Error("Order not found");

        await tx.salesOrder.update({
            where: { id: orderId },
            data: { status: SalesOrderStatus.DELIVERED }
        });

        // Keep related Delivery Orders in sync (was previously only updating SalesOrder)
        const openDeliveryOrders = await tx.deliveryOrder.updateMany({
            where: {
                salesOrderId: orderId,
                status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED'] },
            },
            data: { status: 'DELIVERED' },
        });

        // Catch-all cleanup when delivered (in case it wasn't shipped but directly delivered somehow)
        await tx.stockReservation.updateMany({
            where: {
                referenceId: orderId,
                reservedFor: ReservationType.SALES_ORDER,
                status: ReservationStatus.ACTIVE
            },
            data: { status: ReservationStatus.FULFILLED }
        });

        await logActivity({
            userId,
            action: 'UPDATE_SALES_STATUS',
            entityType: 'SalesOrder',
            entityId: orderId,
            details: order.orderType === 'MAKLON_JASA'
                ? `Sales Order ${order.orderNumber} marked as Service Delivered`
                : `Sales Order ${order.orderNumber} marked as Delivered` +
                  (openDeliveryOrders.count > 0
                      ? ` (${openDeliveryOrders.count} delivery order(s) set to DELIVERED)`
                      : ''),
            tx
        });
    });
}
