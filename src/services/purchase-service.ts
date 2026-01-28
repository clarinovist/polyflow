import { prisma } from '@/lib/prisma';
import { InventoryService } from './inventory-service';
import { AccountingService } from './accounting-service';
import {
    PurchaseOrderStatus,
    PurchaseInvoiceStatus,
    MovementType,
    Prisma
} from '@prisma/client';
import { addDays } from 'date-fns';
import {
    CreatePurchaseOrderValues,
    UpdatePurchaseOrderValues,
    CreateGoodsReceiptValues,
    CreatePurchaseInvoiceValues,
    CreatePurchaseRequestValues
} from '@/lib/schemas/purchasing';
import { logActivity } from '@/lib/audit';
import { PurchaseRequestStatus } from '@prisma/client';

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
                // a. Calculate New Global WAC (Before Incrementing Quantity)
                // Get total existing quantity across all locations
                const totalInventory = await tx.inventory.aggregate({
                    where: { productVariantId: item.productVariantId },
                    _sum: { quantity: true }
                });

                const variant = await tx.productVariant.findUnique({
                    where: { id: item.productVariantId },
                    select: { standardCost: true, id: true, name: true }
                });

                if (variant) {
                    // New Weighted Average: ((Old Qty * Old WAC) + (New Qty * New Price)) / (Old Qty + New Qty)
                    const currentTotalQty = totalInventory._sum.quantity?.toNumber() || 0;
                    const oldWAC = variant.standardCost?.toNumber() || 0;
                    const newQty = item.receivedQty;
                    const newPrice = item.unitCost;
                    const newTotalQty = currentTotalQty + newQty; // Total after this receipt

                    const newWAC = newTotalQty > 0
                        ? ((currentTotalQty * oldWAC) + (newQty * newPrice)) / newTotalQty
                        : oldWAC;

                    await tx.productVariant.update({
                        where: { id: variant.id },
                        data: { standardCost: newWAC }
                    });
                }

                // b. Increment Stock (Using InventoryService)
                // Note: InventoryService.incrementStock takes tx as first arg if we updated it, 
                // but checking definition: static async incrementStock(tx, locationId, variantId, qty)
                await InventoryService.incrementStock(
                    tx,
                    data.locationId,
                    item.productVariantId,
                    item.receivedQty
                );

                // c. Record Stock Movement
                const movement = await tx.stockMovement.create({
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

                // Auto Journal
                // Need to inject productVariant into movement or let service fetch it (but service fetch uses db=tx so it works)
                await AccountingService.recordInventoryMovement(movement, tx).catch(console.error);

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

            // Trigger automated draft bill
            await this.createDraftBillFromPo(data.purchaseOrderId, userId);

            return receipt;
        });
    }

    static async createInvoice(data: CreatePurchaseInvoiceValues) {
        const finalDueDate = data.dueDate || addDays(data.invoiceDate, data.termOfPaymentDays || 0);

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
                dueDate: finalDueDate,
                termOfPaymentDays: data.termOfPaymentDays || 0,
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
                supplier: true,
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
                    include: {
                        supplier: true
                    }
                },
                location: true,
                createdBy: { select: { name: true } },
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true
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
                    include: {
                        supplier: true
                    }
                },
                location: true,
                createdBy: { select: { name: true } },
                items: {
                    include: {
                        productVariant: true
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

    static async generateBillNumber(): Promise<string> {
        const dateStr = new Date().getFullYear().toString();
        const prefix = `BILL-${dateStr}-`;

        const lastBill = await prisma.purchaseInvoice.findFirst({
            where: { invoiceNumber: { startsWith: prefix } },
            orderBy: { invoiceNumber: 'desc' },
        });

        let nextSequence = 1;
        if (lastBill) {
            const parts = lastBill.invoiceNumber.split('-');
            const lastSeq = parseInt(parts[2]);
            if (!isNaN(lastSeq)) {
                nextSequence = lastSeq + 1;
            }
        }

        return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
    }

    static async createDraftBillFromPo(purchaseOrderId: string, userId: string) {
        const po = await prisma.purchaseOrder.findUnique({
            where: { id: purchaseOrderId },
            select: { totalAmount: true, orderNumber: true }
        });

        if (!po || !po.totalAmount) return;

        // Check for duplicates
        const existing = await prisma.purchaseInvoice.findFirst({
            where: { purchaseOrderId }
        });
        if (existing) return;

        const invoiceNumber = await this.generateBillNumber();
        const invoiceDate = new Date();
        const dueDate = addDays(invoiceDate, 30);

        const invoice = await prisma.purchaseInvoice.create({
            data: {
                invoiceNumber,
                purchaseOrderId,
                invoiceDate,
                dueDate,
                termOfPaymentDays: 30,
                totalAmount: po.totalAmount,
                status: PurchaseInvoiceStatus.DRAFT,
                notes: `System generated draft bill for PO ${po.orderNumber}`
            }
        });

        await logActivity({
            userId,
            action: 'AUTO_GENERATE_BILL',
            entityType: 'PurchaseInvoice',
            entityId: invoice.id,
            details: `Automated draft bill ${invoiceNumber} generated for PO ${po.orderNumber}`,
        });

        return invoice;
    }
    static async getPurchaseStats() {
        const stats = await prisma.purchaseOrder.groupBy({
            by: ['status'],
            _count: { status: true },
            _sum: { totalAmount: true }
        });

        const totalOrders = stats.reduce((acc, curr) => acc + curr._count.status, 0);
        const openOrders = stats
            .filter(s => ['SENT', 'PARTIAL_RECEIVED'].includes(s.status))
            .reduce((acc, curr) => acc + curr._count.status, 0);

        const completedOrders = stats
            .filter(s => s.status === 'RECEIVED')
            .reduce((acc, curr) => acc + curr._count.status, 0);

        const totalSpend = stats.reduce((acc, curr) => acc + (curr._sum.totalAmount?.toNumber() || 0), 0);

        return {
            totalOrders,
            openOrders,
            completedOrders,
            totalSpend
        };
    }

    static async createPurchaseRequest(data: CreatePurchaseRequestValues, userId: string, tx?: Prisma.TransactionClient) {
        const client = tx || prisma;

        // Generate PR Number: PR-YYYY-XXXX
        const year = new Date().getFullYear();
        const prefix = `PR-${year}-`;

        const lastPr = await client.purchaseRequest.findFirst({
            where: { requestNumber: { startsWith: prefix } },
            orderBy: { requestNumber: 'desc' },
            select: { requestNumber: true }
        });

        let nextNumber = 1;
        if (lastPr?.requestNumber) {
            const numPart = parseInt(lastPr.requestNumber.replace(prefix, ''));
            if (!isNaN(numPart)) nextNumber = numPart + 1;
        }

        const requestNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;

        return await prisma.purchaseRequest.create({
            data: {
                requestNumber,
                salesOrderId: data.salesOrderId,
                priority: data.priority,
                notes: data.notes,
                status: PurchaseRequestStatus.OPEN,
                createdById: userId,
                items: {
                    create: data.items.map(item => ({
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        notes: item.notes
                    }))
                }
            },
            include: { items: true }
        });
    }

    static async convertRequestToOrder(requestId: string, supplierId: string, userId: string) {
        return await prisma.$transaction(async (tx) => {
            const pr = await tx.purchaseRequest.findUnique({
                where: { id: requestId },
                include: { items: { include: { productVariant: true } } }
            });

            if (!pr) throw new Error("Purchase Request not found");
            if (pr.status === PurchaseRequestStatus.CONVERTED) throw new Error("Request already converted");

            // Create PO
            // Generate Order Number: PO-YYYY-XXXX
            const year = new Date().getFullYear();
            const prefix = `PO-${year}-`;
            const lastOrder = await tx.purchaseOrder.findFirst({
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

            const itemsWithCost = pr.items.map(item => {
                const unitPrice = item.productVariant.standardCost?.toNumber() || 0;
                return {
                    productVariantId: item.productVariantId,
                    quantity: item.quantity.toNumber(),
                    unitPrice: unitPrice,
                    subtotal: item.quantity.toNumber() * unitPrice
                };
            });

            const totalAmount = itemsWithCost.reduce((sum, item) => sum + item.subtotal, 0);

            const po = await tx.purchaseOrder.create({
                data: {
                    orderNumber,
                    supplierId,
                    orderDate: new Date(),
                    status: PurchaseOrderStatus.DRAFT,
                    totalAmount,
                    notes: `Converted from PR ${pr.requestNumber}`,
                    createdById: userId,
                    items: {
                        create: itemsWithCost.map(item => ({
                            productVariantId: item.productVariantId,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            subtotal: item.subtotal
                        }))
                    },
                    purchaseRequests: {
                        connect: { id: requestId }
                    }
                }
            });

            // Update PR Status
            await tx.purchaseRequest.update({
                where: { id: requestId },
                data: {
                    status: PurchaseRequestStatus.CONVERTED,
                    convertedToPoId: po.id
                }
            });

            await logActivity({
                userId,
                action: 'CONVERT_PR_TO_PO',
                entityType: 'PurchaseOrder',
                entityId: po.id,
                details: `Converted PR ${pr.requestNumber} to PO ${po.orderNumber}`,
                tx
            });

            return po;
        });
    }

    static async consolidateRequestsToOrder(requestIds: string[], supplierId: string, userId: string) {
        if (requestIds.length === 0) throw new Error("No requests selected for consolidation");

        return await prisma.$transaction(async (tx) => {
            // 1. Fetch all PRs with their items
            const prs = await tx.purchaseRequest.findMany({
                where: { id: { in: requestIds } },
                include: { items: { include: { productVariant: true } } }
            });

            if (prs.length !== requestIds.length) throw new Error("Some requests could not be found");
            const alreadyConverted = prs.find(pr => pr.status === PurchaseRequestStatus.CONVERTED);
            if (alreadyConverted) throw new Error(`Request ${alreadyConverted.requestNumber} is already converted`);

            // 2. Aggregate Items
            const aggregatedItems = new Map<string, {
                productVariantId: string;
                quantity: number;
                unitPrice: number;
                notes: string[];
            }>();

            for (const pr of prs) {
                for (const item of pr.items) {
                    const existing = aggregatedItems.get(item.productVariantId);
                    const unitPrice = item.productVariant.standardCost?.toNumber() || 0;

                    if (existing) {
                        existing.quantity += item.quantity.toNumber();
                        if (item.notes) existing.notes.push(`${pr.requestNumber}: ${item.notes}`);
                    } else {
                        aggregatedItems.set(item.productVariantId, {
                            productVariantId: item.productVariantId,
                            quantity: item.quantity.toNumber(),
                            unitPrice,
                            notes: item.notes ? [`${pr.requestNumber}: ${item.notes}`] : [`From ${pr.requestNumber}`]
                        });
                    }
                }
            }

            // 3. Create PO
            const year = new Date().getFullYear();
            const prefix = `PO-${year}-`;
            const lastOrder = await tx.purchaseOrder.findFirst({
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

            // Calculate totals
            let totalAmount = 0;
            const poItemsData = [];

            for (const item of aggregatedItems.values()) {
                const subtotal = item.quantity * item.unitPrice;
                totalAmount += subtotal;
                poItemsData.push({
                    productVariantId: item.productVariantId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    subtotal
                });
            }

            const po = await tx.purchaseOrder.create({
                data: {
                    orderNumber,
                    supplierId,
                    orderDate: new Date(),
                    status: PurchaseOrderStatus.DRAFT,
                    totalAmount,
                    notes: `Consolidated from PRs: ${prs.map(pr => pr.requestNumber).join(', ')}`,
                    createdById: userId,
                    items: {
                        create: poItemsData
                    },
                    purchaseRequests: {
                        connect: requestIds.map(id => ({ id }))
                    }
                }
            });

            // 4. Update PR Statuses
            await tx.purchaseRequest.updateMany({
                where: { id: { in: requestIds } },
                data: {
                    status: PurchaseRequestStatus.CONVERTED,
                    convertedToPoId: po.id
                }
            });

            await logActivity({
                userId,
                action: 'CONSOLIDATE_PR_TO_PO',
                entityType: 'PurchaseOrder',
                entityId: po.id,
                details: `Consolidated ${prs.length} PRs into PO ${po.orderNumber}`,
                tx
            });

            return po;
        });
    }
}
