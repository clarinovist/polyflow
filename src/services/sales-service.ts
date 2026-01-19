import { prisma } from '@/lib/prisma';
import { SalesOrderStatus, MovementType, SalesOrderType } from '@prisma/client';
import { CreateSalesOrderValues, UpdateSalesOrderValues } from '@/lib/schemas/sales';
import { logActivity } from '@/lib/audit';

export class SalesService {

    static async createOrder(data: CreateSalesOrderValues, userId: string) {
        // Generate Order Number: SO-YYYY-XXXX
        const year = new Date().getFullYear();
        const prefix = `SO-${year}-`;

        const lastOrder = await prisma.salesOrder.findFirst({
            where: { orderNumber: { startsWith: prefix } },
            orderBy: { orderNumber: 'desc' },
            select: { orderNumber: true }
        });

        let nextNumber = 1;
        if (lastOrder?.orderNumber) {
            const numPart = parseInt(lastOrder.orderNumber.replace(prefix, ''));
            if (!isNaN(numPart)) nextNumber = numPart + 1;
        }

        const orderNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;

        // Calculate total amount
        const totalAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

        return await prisma.salesOrder.create({
            data: {
                orderNumber,
                customerId: data.customerId ? data.customerId : undefined,
                sourceLocationId: data.sourceLocationId,
                orderDate: data.orderDate,
                expectedDate: data.expectedDate,
                orderType: data.orderType,
                notes: data.notes,
                totalAmount,
                status: SalesOrderStatus.DRAFT,
                createdById: userId,
                items: {
                    create: data.items.map(item => ({
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        subtotal: item.quantity * item.unitPrice
                    }))
                }
            },
            include: { items: true }
        });
    }

    static async updateOrder(data: UpdateSalesOrderValues, _userId: string) {
        // Recalculate total amount
        const totalAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

        // Transaction to update order and replace items
        return await prisma.$transaction(async (tx) => {
            // 1. Delete existing items
            await tx.salesOrderItem.deleteMany({
                where: { salesOrderId: data.id }
            });

            // 2. Update order and recreate items
            return await tx.salesOrder.update({
                where: { id: data.id },
                data: {
                    customerId: data.customerId,
                    sourceLocationId: data.sourceLocationId,
                    orderDate: data.orderDate,
                    expectedDate: data.expectedDate,
                    notes: data.notes,
                    totalAmount,
                    items: {
                        create: data.items.map(item => ({
                            productVariantId: item.productVariantId,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            subtotal: item.quantity * item.unitPrice
                        }))
                    }
                },
                include: { items: true }
            });
        });
    }

    static async confirmOrder(id: string, userId: string) {
        const order = await prisma.salesOrder.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!order) throw new Error("Order not found");
        if (order.status !== SalesOrderStatus.DRAFT) throw new Error("Only draft orders can be confirmed");

        // Handle MTO vs MTS status
        const nextStatus = order.orderType === SalesOrderType.MAKE_TO_ORDER
            ? SalesOrderStatus.IN_PRODUCTION
            : SalesOrderStatus.CONFIRMED;

        await prisma.salesOrder.update({
            where: { id },
            data: { status: nextStatus }
        });

        await logActivity({
            userId,
            action: 'CONFIRM_SALES',
            entityType: 'SalesOrder',
            entityId: id,
            details: `Sales Order ${order.orderNumber} confirmed. Status: ${nextStatus}`
        });
    }

    static async markReadyToShip(id: string, userId: string) {
        const order = await prisma.salesOrder.findUnique({ where: { id } });
        if (!order) throw new Error("Order not found");

        // Allow transition from IN_PRODUCTION or CONFIRMED
        if (order.status !== SalesOrderStatus.IN_PRODUCTION && order.status !== SalesOrderStatus.CONFIRMED) {
            throw new Error("Order must be IN_PRODUCTION or CONFIRMED");
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
            details: `Sales Order ${order.orderNumber} marked as Ready to Ship (Production Complete)`
        });
    }

    static async shipOrder(id: string, userId: string) {
        const order = await prisma.salesOrder.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!order) throw new Error("Order not found");
        if (order.status !== SalesOrderStatus.CONFIRMED && order.status !== SalesOrderStatus.READY_TO_SHIP) {
            throw new Error("Order must be CONFIRMED or READY_TO_SHIP to be shipped");
        }

        if (!order.sourceLocationId) throw new Error("Source location is missing");

        // Execute Stock Deduction (Goods Issue) Transaction
        await prisma.$transaction(async (tx) => {
            for (const item of order.items) {
                // 1. Check stock
                const stock = await tx.inventory.findUnique({
                    where: {
                        locationId_productVariantId: {
                            locationId: order.sourceLocationId!,
                            productVariantId: item.productVariantId
                        }
                    }
                });

                if (!stock || stock.quantity.toNumber() < item.quantity.toNumber()) {
                    throw new Error(`Insufficient stock for item ${item.productVariantId}. Requested: ${item.quantity}, Available: ${stock?.quantity || 0}`);
                }

                // 2. Deduct Inventory
                await tx.inventory.update({
                    where: { id: stock.id },
                    data: { quantity: { decrement: item.quantity } }
                });

                // 3. Create Stock Movement
                await tx.stockMovement.create({
                    data: {
                        type: MovementType.OUT,
                        productVariantId: item.productVariantId,
                        fromLocationId: order.sourceLocationId,
                        quantity: item.quantity,
                        salesOrderId: order.id,
                        createdById: userId,
                        reference: `Shipment for ${order.orderNumber}`,
                        createdAt: new Date()
                    }
                });

                // 4. Update Delivered Qty on Item (assuming full shipment for now)
                await tx.salesOrderItem.update({
                    where: { id: item.id },
                    data: { deliveredQty: item.quantity }
                });
            }

            // 5. Update Order Status
            await tx.salesOrder.update({
                where: { id },
                data: { status: SalesOrderStatus.SHIPPED }
            });

            await logActivity({
                userId,
                action: 'SHIP_SALES',
                entityType: 'SalesOrder',
                entityId: id,
                details: `Sales Order ${order.orderNumber} shipped`,
                tx
            });
        });
    }

    static async deliverOrder(orderId: string, userId: string) {
        const order = await prisma.salesOrder.update({
            where: { id: orderId },
            data: { status: SalesOrderStatus.DELIVERED }
        });

        await logActivity({
            userId,
            action: 'DELIVER_SALES',
            entityType: 'SalesOrder',
            entityId: orderId,
            details: `Sales Order ${order.orderNumber} marked as delivered`
        });

        // TODO: Auto-generate invoice hook here if not already generated
    }

    static async cancelOrder(id: string, userId: string) {
        const order = await prisma.salesOrder.findUnique({ where: { id } });
        if (!order) throw new Error("Order not found");

        if (order.status === SalesOrderStatus.SHIPPED || order.status === SalesOrderStatus.DELIVERED) {
            throw new Error("Cannot cancel shipped or delivered orders");
        }

        await prisma.salesOrder.update({
            where: { id },
            data: { status: SalesOrderStatus.CANCELLED }
        });

        await logActivity({
            userId,
            action: 'CANCEL_SALES',
            entityType: 'SalesOrder',
            entityId: id,
            details: `Sales Order ${order.orderNumber} cancelled`
        });
    }
}
