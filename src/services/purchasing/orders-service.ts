import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/audit';
import { PurchaseOrderStatus, Prisma } from '@prisma/client';
import { CreatePurchaseOrderValues, UpdatePurchaseOrderValues } from '@/lib/schemas/purchasing';

export async function createOrder(data: CreatePurchaseOrderValues, userId: string) {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;

    const lastOrder = await prisma.purchaseOrder.findFirst({
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
    const totalAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    return await prisma.purchaseOrder.create({
        data: {
            orderNumber,
            supplierId: data.supplierId,
            orderDate: data.orderDate,
            expectedDate: data.expectedDate,
            notes: data.notes,
            totalAmount,
            status: PurchaseOrderStatus.DRAFT,
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
        include: { items: true, supplier: true }
    });
}

export async function updateOrder(data: UpdatePurchaseOrderValues) {
    const totalAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    return await prisma.$transaction(async (tx) => {
        await tx.purchaseOrderItem.deleteMany({
            where: { purchaseOrderId: data.id }
        });

        return await tx.purchaseOrder.update({
            where: { id: data.id },
            data: {
                supplierId: data.supplierId,
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
            include: { items: true, supplier: true }
        });
    });
}

export async function updateOrderStatus(id: string, status: PurchaseOrderStatus, userId: string) {
    const order = await prisma.purchaseOrder.update({
        where: { id },
        data: { status }
    });

    await logActivity({
        userId,
        action: 'UPDATE_STATUS_PURCHASE',
        entityType: 'PurchaseOrder',
        entityId: id,
        details: `Updated PO ${order.orderNumber} status to ${status}`
    });

    return order;
}

export async function deleteOrder(id: string, userId: string) {
    const order = await prisma.purchaseOrder.findUnique({
        where: { id },
        include: { goodsReceipts: true, invoices: true }
    });

    if (!order) {
        throw new Error('Purchase Order not found');
    }

    if (order.status !== 'DRAFT' && order.status !== 'CANCELLED') {
        throw new Error('Only DRAFT or CANCELLED orders can be deleted');
    }

    if (order.goodsReceipts.length > 0) {
        throw new Error('Cannot delete order with existing goods receipts');
    }

    if (order.invoices.length > 0) {
        throw new Error('Cannot delete order with existing invoices');
    }

    return await prisma.$transaction(async (tx) => {
        await tx.purchaseOrderItem.deleteMany({
            where: { purchaseOrderId: id }
        });

        await tx.purchaseOrder.delete({
            where: { id }
        });

        await logActivity({
            userId,
            action: 'DELETE_PURCHASE',
            entityType: 'PurchaseOrder',
            entityId: id,
            details: `Deleted PO ${order.orderNumber}`,
            tx
        });

        return { success: true, orderNumber: order.orderNumber };
    });
}

export async function getPurchaseOrders(filters?: { supplierId?: string, status?: PurchaseOrderStatus }) {
    const where: Prisma.PurchaseOrderWhereInput = {};
    if (filters?.supplierId) where.supplierId = filters.supplierId;
    if (filters?.status) where.status = filters.status;

    return await prisma.purchaseOrder.findMany({
        where,
        include: {
            supplier: true,
            _count: { select: { items: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
}

export async function getPurchaseOrderById(id: string) {
    return await prisma.purchaseOrder.findUnique({
        where: { id },
        include: {
            supplier: true,
            items: {
                include: {
                    productVariant: {
                        select: {
                            id: true,
                            name: true,
                            skuCode: true,
                            primaryUnit: true,
                            standardCost: true
                        }
                    }
                }
            },
            goodsReceipts: {
                include: {
                    createdBy: { select: { name: true } },
                    location: { select: { name: true } }
                }
            },
            invoices: true,
            createdBy: { select: { name: true } }
        }
    });
}
