import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { MovementType, PurchaseOrderStatus, Prisma } from '@prisma/client';
import { CreateGoodsReceiptValues } from '@/lib/schemas/purchasing';
import { createDraftBillFromPo } from '@/services/purchasing/invoices-service';
import { logger } from '@/lib/config/logger';

export async function createGoodsReceipt(data: CreateGoodsReceiptValues, userId: string) {
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

    const receipt = await prisma.$transaction(async (tx) => {
        const receiptTx = await tx.goodsReceipt.create({
            data: {
                receiptNumber,
                ...(data.purchaseOrderId ? { purchaseOrderId: data.purchaseOrderId } : {}),
                isMaklon: data.isMaklon ?? false,
                ...(data.customerId ? { customerId: data.customerId } : {}),
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

        for (const item of data.items) {
            const totalInventory = await tx.inventory.aggregate({
                where: { productVariantId: item.productVariantId },
                _sum: { quantity: true }
            });

            const variant = await tx.productVariant.findUnique({
                where: { id: item.productVariantId },
                select: { standardCost: true, id: true, name: true }
            });

            if (variant) {
                const currentTotalQty = totalInventory._sum.quantity?.toNumber() || 0;
                const oldWAC = variant.standardCost?.toNumber() || 0;
                const newQty = item.receivedQty;
                const newPrice = item.unitCost;
                const newTotalQty = currentTotalQty + newQty;

                const newWAC = newTotalQty > 0
                    ? ((currentTotalQty * oldWAC) + (newQty * newPrice)) / newTotalQty
                    : oldWAC;

                await tx.productVariant.update({
                    where: { id: variant.id },
                    data: { standardCost: newWAC }
                });
            }

            await InventoryCoreService.incrementStock(
                tx,
                data.locationId,
                item.productVariantId,
                item.receivedQty
            );

            const movement = await tx.stockMovement.create({
                data: {
                    type: MovementType.PURCHASE,
                    productVariantId: item.productVariantId,
                    toLocationId: data.locationId,
                    quantity: item.receivedQty,
                    cost: item.unitCost,
                    goodsReceiptId: receiptTx.id,
                    createdById: userId,
                    reference: data.isMaklon ? `GR: ${receiptNumber} for Maklon Customer` : `GR: ${receiptNumber} for PO`
                }
            });

            await AccountingService.recordInventoryMovement(movement, tx);

            if (data.purchaseOrderId) {
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
        }

        let po = null;
        if (data.purchaseOrderId) {
            const updatedItems = await tx.purchaseOrderItem.findMany({
                where: { purchaseOrderId: data.purchaseOrderId }
            });

            po = await tx.purchaseOrder.findUnique({
                where: { id: data.purchaseOrderId }
            });

            if (po && updatedItems.length > 0) {
                const allReceived = updatedItems.every(item => item.receivedQty.toNumber() >= item.quantity.toNumber());
                const partialReceived = updatedItems.some(item => item.receivedQty.toNumber() > 0);

                let status: PurchaseOrderStatus;
                if (allReceived) {
                    status = PurchaseOrderStatus.RECEIVED;
                } else if (partialReceived) {
                    status = PurchaseOrderStatus.PARTIAL_RECEIVED;
                } else {
                    status = po.status === PurchaseOrderStatus.DRAFT
                        ? PurchaseOrderStatus.SENT
                        : po.status;
                }

                await tx.purchaseOrder.update({
                    where: { id: po.id },
                    data: { status }
                });
            }
        }

        await logActivity({
            userId,
            action: 'RECEIVE_PURCHASE',
            entityType: 'GoodsReceipt',
            entityId: receiptTx.id,
            details: data.isMaklon 
                ? `Received maklon materials via GR ${receiptNumber}` 
                : `Received items for PO ${po?.orderNumber || ''} via GR ${receiptNumber}`,
            tx
        });

        return receiptTx;
    });

    // Auto-generate draft bill after GR transaction commits (Only for non-maklon)
    if (data.purchaseOrderId) {
        await createDraftBillFromPo(data.purchaseOrderId, userId).catch(err => {
            logger.error("Failed to auto-generate draft bill after GR", { error: err, module: 'ReceiptsService' });
        });
    }

    return receipt;
}

export async function getGoodsReceiptById(id: string) {
    return await prisma.goodsReceipt.findUnique({
        where: { id },
        include: {
            purchaseOrder: {
                include: {
                    supplier: true
                }
            },
            customer: true,
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

export async function getGoodsReceipts(dateRange?: { startDate?: Date, endDate?: Date }) {
    const where: Prisma.GoodsReceiptWhereInput = {};

    if (dateRange?.startDate || dateRange?.endDate) {
        where.receivedDate = {};
        if (dateRange.startDate) where.receivedDate.gte = dateRange.startDate;
        if (dateRange.endDate) where.receivedDate.lte = dateRange.endDate;
    }

    return await prisma.goodsReceipt.findMany({
        where,
        include: {
            purchaseOrder: {
                include: {
                    supplier: true
                }
            },
            customer: true,
            location: true,
            createdBy: { select: { name: true } },
            items: {
                include: {
                    productVariant: true
                }
            },
            _count: { select: { items: true } }
        },
        orderBy: { receivedDate: 'desc' } // Changed to receivedDate for better filtering context
    });
}
