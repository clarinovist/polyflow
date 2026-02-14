import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/audit';
import { InventoryService } from '@/services/inventory-service';
import { AccountingService } from '@/services/accounting-service';
import { MovementType, PurchaseOrderStatus, Prisma } from '@prisma/client';
import { CreateGoodsReceiptValues } from '@/lib/schemas/purchasing';
import { createDraftBillFromPo } from '@/services/purchasing/invoices-service';

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

    return await prisma.$transaction(async (tx) => {
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

            await InventoryService.incrementStock(
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
                    goodsReceiptId: receipt.id,
                    createdById: userId,
                    reference: `GR: ${receiptNumber} for PO`
                }
            });

            await AccountingService.recordInventoryMovement(movement, tx).catch(console.error);

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

        const updatedItems = await tx.purchaseOrderItem.findMany({
            where: { purchaseOrderId: data.purchaseOrderId }
        });

        const po = await tx.purchaseOrder.findUnique({
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
                // No items received yet, keep current status or set to SENT if DRAFT
                status = po.status === PurchaseOrderStatus.DRAFT
                    ? PurchaseOrderStatus.SENT
                    : po.status;
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

        await createDraftBillFromPo(data.purchaseOrderId, userId);

        return receipt;
    });
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
