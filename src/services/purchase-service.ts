import { prisma } from '@/lib/prisma';
import {
    PurchaseOrderStatus,
    PurchaseInvoiceStatus,
    MovementType,
    Prisma
} from '@prisma/client';
import {
    CreatePurchaseOrderValues,
    UpdatePurchaseOrderValues,
    CreateGoodsReceiptValues,
    CreatePurchaseInvoiceValues
} from '@/lib/schemas/purchasing';
import { logActivity } from '@/lib/audit';

export class PurchaseService {

    static async createOrder(data: CreatePurchaseOrderValues, userId: string) {
        // Generate Order Number: PO-YYYY-XXXX
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

        // Calculate total amount
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

    static async updateOrder(data: UpdatePurchaseOrderValues) {
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

    static async updateOrderStatus(id: string, status: PurchaseOrderStatus, userId: string) {
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

    static async deleteOrder(id: string, userId: string) {
        const order = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: { goodsReceipts: true, invoices: true }
        });

        if (!order) {
            throw new Error('Purchase Order not found');
        }

        // Only allow deletion for DRAFT or CANCELLED orders
        if (order.status !== 'DRAFT' && order.status !== 'CANCELLED') {
            throw new Error('Only DRAFT or CANCELLED orders can be deleted');
        }

        // Safety check: ensure no goods receipts or invoices exist
        if (order.goodsReceipts.length > 0) {
            throw new Error('Cannot delete order with existing goods receipts');
        }

        if (order.invoices.length > 0) {
            throw new Error('Cannot delete order with existing invoices');
        }

        return await prisma.$transaction(async (tx) => {
            // Delete order items first
            await tx.purchaseOrderItem.deleteMany({
                where: { purchaseOrderId: id }
            });

            // Delete the order
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

    static async createGoodsReceipt(data: CreateGoodsReceiptValues, userId: string) {
        // 1. Generate Receipt Number: GR-YYYY-XXXX
        const year = new Date().getFullYear();
        const prefix = `GR-${year}-`;

        const lastReceipt = await prisma.goodsReceipt.findFirst({
            where: { receiptNumber: { startsWith: prefix } },
            orderBy: { receiptNumber: 'desc' },
            select: { receiptNumber: true }
        });

        let nextNumber = 1;
        if (lastReceipt?.receiptNumber) {
            const numPart = parseInt(lastReceipt.receiptNumber.replace(prefix, ''));
            if (!isNaN(numPart)) nextNumber = numPart + 1;
        }
        const receiptNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;

        return await prisma.$transaction(async (tx) => {
            // 2. Create Goods Receipt
            const receipt = await tx.goodsReceipt.create({
                data: {
                    receiptNumber,
                    purchaseOrderId: data.purchaseOrderId,
                    receivedDate: data.receivedDate,
                    locationId: data.locationId,
                    notes: data.notes,
                    createdById: userId,
                    items: {
                        create: data.items.map(item => ({
                            productVariantId: item.productVariantId,
                            receivedQty: item.receivedQty,
                            unitCost: item.unitCost
                        }))
                    }
                },
                include: { items: true }
            });

            // 3. Process each item (Update Inventory & WAC)
            for (const item of data.items) {
                // a. Find or create inventory
                await tx.inventory.upsert({
                    where: {
                        locationId_productVariantId: {
                            locationId: data.locationId,
                            productVariantId: item.productVariantId
                        }
                    },
                    update: {
                        quantity: { increment: item.receivedQty }
                    },
                    create: {
                        locationId: data.locationId,
                        productVariantId: item.productVariantId,
                        quantity: item.receivedQty
                    }
                });

                // b. Update WAC (Weighted Average Cost) on ProductVariant
                const variant = await tx.productVariant.findUnique({
                    where: { id: item.productVariantId },
                    select: { standardCost: true, id: true, name: true }
                });

                if (variant) {
                    // Get total existing quantity across all locations
                    const totalInventory = await tx.inventory.aggregate({
                        where: { productVariantId: item.productVariantId },
                        _sum: { quantity: true }
                    });

                    // New Weighted Average: ((Old Qty * Old WAC) + (New Qty * New Price)) / (Old Qty + New Qty)
                    // Note: totalInventory._sum.quantity already includes the new incremented qty from step 3a
                    const currentTotalQty = totalInventory._sum.quantity?.toNumber() || 0;
                    const oldQty = currentTotalQty - item.receivedQty;
                    const oldWAC = variant.standardCost?.toNumber() || 0;
                    const newQty = item.receivedQty;
                    const newPrice = item.unitCost;

                    const newWAC = ((oldQty * oldWAC) + (newQty * newPrice)) / currentTotalQty;

                    await tx.productVariant.update({
                        where: { id: variant.id },
                        data: { standardCost: newWAC }
                    });
                }

                // c. Record Stock Movement
                await tx.stockMovement.create({
                    data: {
                        type: MovementType.PURCHASE,
                        productVariantId: item.productVariantId,
                        toLocationId: data.locationId,
                        quantity: item.receivedQty,
                        cost: item.unitCost,
                        goodsReceiptId: receipt.id,
                        createdById: userId,
                        reference: `GR: ${receiptNumber} for PO`
                    }
                });

                // d. Update PO Item received quantity
                const poItem = await tx.purchaseOrderItem.findFirst({
                    where: {
                        purchaseOrderId: data.purchaseOrderId,
                        productVariantId: item.productVariantId
                    }
                });

                if (poItem) {
                    await tx.purchaseOrderItem.update({
                        where: { id: poItem.id },
                        data: { receivedQty: { increment: item.receivedQty } }
                    });
                }
            }

            // 4. Update PO Status
            // Fetch fresh PO Items data after the increment updates to avoid stale read
            const updatedItems = await tx.purchaseOrderItem.findMany({
                where: { purchaseOrderId: data.purchaseOrderId }
            });

            const po = await tx.purchaseOrder.findUnique({
                where: { id: data.purchaseOrderId }
            });

            if (po && updatedItems.length > 0) {
                const allReceived = updatedItems.every(item => item.receivedQty.toNumber() >= item.quantity.toNumber());
                const partialReceived = updatedItems.some(item => item.receivedQty.toNumber() > 0);

                let status: PurchaseOrderStatus = PurchaseOrderStatus.SENT;
                if (allReceived) {
                    status = PurchaseOrderStatus.RECEIVED;
                } else if (partialReceived) {
                    status = PurchaseOrderStatus.PARTIAL_RECEIVED;
                }

                await tx.purchaseOrder.update({
                    where: { id: po.id },
                    data: { status }
                });
            }

            await logActivity({
                userId,
                action: 'RECEIVE_PURCHASE',
                entityType: 'GoodsReceipt',
                entityId: receipt.id,
                details: `Received items for PO ${po?.orderNumber || ''} via GR ${receiptNumber}`,
                tx
            });

            return receipt;
        });
    }

    static async createInvoice(data: CreatePurchaseInvoiceValues) {
        const po = await prisma.purchaseOrder.findUnique({
            where: { id: data.purchaseOrderId },
            select: { totalAmount: true }
        });

        if (!po) throw new Error("Purchase Order not found");

        return await prisma.purchaseInvoice.create({
            data: {
                invoiceNumber: data.invoiceNumber,
                purchaseOrderId: data.purchaseOrderId,
                invoiceDate: data.invoiceDate,
                dueDate: data.dueDate,
                totalAmount: po.totalAmount || 0,
                status: PurchaseInvoiceStatus.UNPAID,
            }
        });
    }

    static async recordPayment(id: string, amount: number, userId: string) {
        return await prisma.$transaction(async (tx) => {
            const invoice = await tx.purchaseInvoice.findUnique({ where: { id } });
            if (!invoice) throw new Error("Invoice not found");

            const newPaidAmount = invoice.paidAmount.toNumber() + amount;
            let status: PurchaseInvoiceStatus = PurchaseInvoiceStatus.PARTIAL;

            if (newPaidAmount >= invoice.totalAmount.toNumber()) {
                status = PurchaseInvoiceStatus.PAID;
            }

            // Create payment record
            await tx.purchasePayment.create({
                data: {
                    purchaseInvoiceId: id,
                    amount,
                    paymentDate: new Date(),
                    createdById: userId
                }
            });

            const updated = await tx.purchaseInvoice.update({
                where: { id },
                data: {
                    paidAmount: newPaidAmount,
                    status
                }
            });

            await logActivity({
                userId,
                action: 'PAYMENT_PURCHASE',
                entityType: 'PurchaseInvoice',
                entityId: id,
                details: `Recorded payment of ${amount} for Invoice ${invoice.invoiceNumber}. New Status: ${status}`,
                tx
            });

            return updated;
        });
    }

    static async getPurchaseOrders(filters?: { supplierId?: string, status?: PurchaseOrderStatus }) {
        const where: Prisma.PurchaseOrderWhereInput = {};
        if (filters?.supplierId) where.supplierId = filters.supplierId;
        if (filters?.status) where.status = filters.status;

        return await prisma.purchaseOrder.findMany({
            where,
            include: {
                supplier: { select: { name: true, code: true } },
                _count: { select: { items: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    static async getPurchaseOrderById(id: string) {
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

    static async getGoodsReceiptById(id: string) {
        return await prisma.goodsReceipt.findUnique({
            where: { id },
            include: {
                purchaseOrder: {
                    select: {
                        orderNumber: true,
                        supplier: { select: { name: true, code: true } }
                    }
                },
                location: { select: { name: true } },
                createdBy: { select: { name: true } },
                items: {
                    include: {
                        productVariant: {
                            select: {
                                id: true,
                                name: true,
                                skuCode: true,
                                primaryUnit: true
                            }
                        }
                    }
                }
            }
        });
    }

    static async getGoodsReceipts() {
        return await prisma.goodsReceipt.findMany({
            include: {
                purchaseOrder: {
                    select: {
                        orderNumber: true,
                        status: true,
                        supplier: { select: { name: true } }
                    }
                },
                location: { select: { name: true } },
                createdBy: { select: { name: true } },
                items: {
                    select: {
                        id: true,
                        receivedQty: true,
                        productVariant: {
                            select: { name: true, skuCode: true, primaryUnit: true }
                        }
                    }
                },
                _count: { select: { items: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    static async getPurchaseInvoiceById(id: string) {
        return await prisma.purchaseInvoice.findUnique({
            where: { id },
            include: {
                purchaseOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        totalAmount: true,
                        supplier: { select: { name: true, code: true } }
                    }
                },
                payments: {
                    include: {
                        createdBy: { select: { name: true } }
                    },
                    orderBy: { paymentDate: 'desc' }
                }
            }
        });
    }

    static async getPurchaseInvoices() {
        return await prisma.purchaseInvoice.findMany({
            include: {
                purchaseOrder: {
                    select: {
                        orderNumber: true,
                        supplier: { select: { name: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }
}
