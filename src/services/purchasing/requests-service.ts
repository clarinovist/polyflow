import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/audit';
import { PurchaseOrderStatus, PurchaseRequestStatus, Prisma } from '@prisma/client';
import { CreatePurchaseRequestValues } from '@/lib/schemas/purchasing';

export async function createPurchaseRequest(data: CreatePurchaseRequestValues, userId: string, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;

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

export async function convertRequestToOrder(requestId: string, supplierId: string, userId: string) {
    return await prisma.$transaction(async (tx) => {
        const pr = await tx.purchaseRequest.findUnique({
            where: { id: requestId },
            include: { items: { include: { productVariant: true } } }
        });

        if (!pr) throw new Error("Purchase Request not found");
        if (pr.status === PurchaseRequestStatus.CONVERTED) throw new Error("Request already converted");

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

export async function consolidateRequestsToOrder(requestIds: string[], supplierId: string, userId: string) {
    if (requestIds.length === 0) throw new Error("No requests selected for consolidation");

    return await prisma.$transaction(async (tx) => {
        const prs = await tx.purchaseRequest.findMany({
            where: { id: { in: requestIds } },
            include: { items: { include: { productVariant: true } } }
        });

        if (prs.length !== requestIds.length) throw new Error("Some requests could not be found");
        const alreadyConverted = prs.find(pr => pr.status === PurchaseRequestStatus.CONVERTED);
        if (alreadyConverted) throw new Error(`Request ${alreadyConverted.requestNumber} is already converted`);

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
