import { salesTransactionClient } from './transaction-client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';

/** Receive one SJ only; another partial/ongoing SJ must never be marked received implicitly. */
export async function receiveDelivery(deliveryOrderId: string, userId: string) {
    return salesTransactionClient().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT so.id FROM "SalesOrder" so
            JOIN "DeliveryOrder" d ON d."salesOrderId" = so.id
            WHERE d.id = ${deliveryOrderId} FOR UPDATE OF so`;
        await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE id = ${deliveryOrderId} FOR UPDATE`;
        const delivery = await tx.deliveryOrder.findUnique({
            where: { id: deliveryOrderId },
            include: {
                salesOrder: { include: { items: true, deliveryOrders: true } },
            },
        });
        if (!delivery)
            throw new NotFoundError('Delivery Order', deliveryOrderId);
        if (
            !['SHIPPED', 'IN_TRANSIT', 'ARRIVED'].includes(delivery.status) ||
            !delivery.stockCommittedAt
        ) {
            throw new BusinessRuleError(
                'Hanya Surat Jalan yang sudah dikirim yang dapat diterima.',
            );
        }
        const so = delivery.salesOrder;
        if (so.status === 'CANCELLED')
            throw new BusinessRuleError('SO sudah dibatalkan.');
        await tx.deliveryOrder.update({
            where: { id: deliveryOrderId },
            data: { status: 'DELIVERED' },
        });
        const residual = so.items.some(
            (item) => Number(item.quantity) > Number(item.deliveredQty),
        );
        const ongoing = so.deliveryOrders.some(
            (item) =>
                item.id !== deliveryOrderId &&
                !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(item.status),
        );
        const status = residual
            ? 'READY_TO_SHIP'
            : ongoing
              ? 'SHIPPED'
              : 'DELIVERED';
        await tx.salesOrder.update({ where: { id: so.id }, data: { status } });
        await logActivity({
            userId,
            action: 'RECEIVE_DELIVERY',
            entityType: 'DeliveryOrder',
            entityId: deliveryOrderId,
            details: `Surat Jalan diterima; SO ${so.orderNumber} → ${status}.`,
            fromStatus: delivery.status,
            toStatus: 'DELIVERED',
            tx,
        });
        return { salesOrderId: so.id };
    });
}
