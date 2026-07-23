import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { MovementType, NotificationType, PurchaseOrderStatus, Prisma } from '@prisma/client';
import { CreateGoodsReceiptValues } from '@/lib/schemas/purchasing';
import { createDraftBillFromPo } from '@/services/purchasing/invoices-service';
import { logger } from '@/lib/config/logger';
import { BusinessRuleError } from '@/lib/errors/errors';
import { FixedAssetService } from '@/services/finance/fixed-asset-service';

async function notifyFinanceOfGoodsReceipt(
    receiptId: string,
    purchaseOrderId: string,
    items: CreateGoodsReceiptValues['items'],
) {
    const [{ NotificationService }, purchaseOrder, financeUsers] = await Promise.all([
        import('@/services/core/notification-service'),
        prisma.purchaseOrder.findUnique({
            where: { id: purchaseOrderId },
            select: { orderNumber: true, supplier: { select: { name: true } } },
        }),
        prisma.user.findMany({
            where: { role: 'FINANCE', isActive: true },
            select: { id: true },
        }),
    ]);

    if (!purchaseOrder || financeUsers.length === 0) return;

    const totalAmount = items.reduce((total, item) => total + item.receivedQty * item.unitCost, 0);
    await NotificationService.createBulkNotifications(financeUsers.map(user => ({
        userId: user.id,
        type: NotificationType.GOODS_RECEIPT_POSTED,
        title: 'Penerimaan Barang Baru',
        message: `GR untuk ${purchaseOrder.orderNumber} dari ${purchaseOrder.supplier.name} sudah dicatat. Nilai: Rp ${totalAmount.toLocaleString('id-ID')}. Silakan cek jurnal dan invoice.`,
        link: `/warehouse/incoming/${receiptId}`,
        entityType: 'GoodsReceipt',
        entityId: receiptId,
    })));
}

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

    if (data.purchaseOrderId && !data.isMaklon) {
        const recentReceipts = await prisma.goodsReceipt.findMany({
            where: {
                purchaseOrderId: data.purchaseOrderId,
                createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
            },
            include: { items: true },
        });
        const isDuplicate = recentReceipts.some(receipt =>
            receipt.items.length === data.items.length &&
            data.items.every(item => receipt.items.some(receiptItem =>
                receiptItem.productVariantId === item.productVariantId &&
                Number(receiptItem.receivedQty) === item.receivedQty &&
                Number(receiptItem.unitCost) === item.unitCost
            ))
        );

        if (isDuplicate) {
            throw new BusinessRuleError(
                'GR yang sama sudah dibuat dalam 5 menit terakhir. Pastikan bukan input ganda.',
                undefined,
                'DUPLICATE_RECEIPT'
            );
        }
    }

    const receipt = await prisma.$transaction(async (tx) => {
        // ponytail: over-receiving allowed — PO qty treated as estimate. If stricter control needed, add tolerance check here.
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
            // Load product to check type
            const variant = await tx.productVariant.findUnique({
                where: { id: item.productVariantId },
                include: { product: true },
            });
            const productType = variant?.product?.productType;

            if (productType === 'FIXED_ASSET') {
                // ===== FIXED ASSET PATH: no stock, create FixedAsset register + journal =====
                // Find PO item ID for traceability
                let poItemId: string | null = null;
                if (data.purchaseOrderId) {
                    const poItem = await tx.purchaseOrderItem.findFirst({
                        where: {
                            purchaseOrderId: data.purchaseOrderId,
                            productVariantId: item.productVariantId,
                        },
                    });
                    poItemId = poItem?.id ?? null;
                }

                await FixedAssetService.createFromGoodsReceipt({
                    tx: tx as never,
                    productVariantId: item.productVariantId,
                    purchaseOrderId: data.purchaseOrderId || null,
                    goodsReceiptId: receiptTx.id,
                    purchaseOrderItemId: poItemId,
                    receivedQty: item.receivedQty,
                    unitCost: data.isMaklon ? 0 : item.unitCost,
                    receivedDate: data.receivedDate,
                    locationId: data.locationId,
                    userId,
                });
            } else {
                // ===== INVENTORY PATH: existing logic (stock + movement + journal) =====
                await InventoryCoreService.incrementStockWithCost(
                    tx,
                    data.locationId,
                    item.productVariantId,
                    item.receivedQty,
                    data.isMaklon ? 0 : item.unitCost
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
            }

            // Update PO item receivedQty (both paths)
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

    // Auto-generate draft bill and notify Finance after the GR transaction commits.
    if (data.purchaseOrderId) {
        await createDraftBillFromPo(data.purchaseOrderId, userId).catch(err => {
            logger.error("Failed to auto-generate draft bill after GR", { error: err, module: 'ReceiptsService' });
        });

        await notifyFinanceOfGoodsReceipt(receipt.id, data.purchaseOrderId, data.items).catch(err => {
            logger.error("Failed to notify Finance after goods receipt", { error: err, module: 'ReceiptsService' });
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

export async function getGoodsReceipts(filter?: { startDate?: Date, endDate?: Date, isMaklon?: boolean }) {
    const where: Prisma.GoodsReceiptWhereInput = {};

    if (filter?.startDate || filter?.endDate) {
        where.receivedDate = {};
        if (filter.startDate) where.receivedDate.gte = filter.startDate;
        if (filter.endDate) where.receivedDate.lte = filter.endDate;
    }

    if (filter?.isMaklon !== undefined) {
        where.isMaklon = filter.isMaklon;
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

/**
 * Reverse a GoodsReceipt: decrement inventory, delete stock movements + journal entries,
 * reset PO items receivedQty, and recalculate PO status.
 *
 * Called when a Purchase Invoice is deleted (cascading revert).
 * Must be called within a transaction or will create its own.
 */
export async function reverseGoodsReceipt(
    goodsReceiptId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
) {
    const run = async (db: Prisma.TransactionClient) => {
        const gr = await db.goodsReceipt.findUnique({
            where: { id: goodsReceiptId },
            include: {
                items: true,
                movements: true,
                purchaseOrder: {
                    include: { items: true },
                },
            },
        });

        if (!gr) {
            throw new BusinessRuleError(`Penerimaan barang ${goodsReceiptId} tidak ditemukan`);
        }

        // 0. Reverse FIXED_ASSET path: delete FixedAsset cards + journal for this GR
        const linkedAssets = await db.fixedAsset.findMany({
            where: { goodsReceiptId },
            select: { id: true, assetCode: true, lastDepreciationDate: true },
        });
        if (linkedAssets.length > 0) {
            // Block if any asset already depreciated
            const depreciated = linkedAssets.find(a => a.lastDepreciationDate != null);
            if (depreciated) {
                throw new BusinessRuleError(`Tidak bisa reverse GR ${gr.receiptNumber}: aset ${depreciated.assetCode} sudah pernah didepresiasi`);
            }
            // Delete asset journal entries (referenceId = GR id, referenceType GOODS_RECEIPT)
            const assetJournals = await db.journalEntry.findMany({
                where: { referenceId: goodsReceiptId, referenceType: 'GOODS_RECEIPT' },
                select: { id: true },
            });
            for (const j of assetJournals) {
                await db.journalLine.deleteMany({ where: { journalEntryId: j.id } });
                await db.journalEntry.delete({ where: { id: j.id } });
            }
            // Fallback: also check journals by asset id? Our GR path journals use referenceId=goodsReceiptId, so above enough.
            // Extra safety: delete any journal referencing the asset itself (if ever created via other path)
            for (const asset of linkedAssets) {
                const aj = await db.journalEntry.findMany({
                    where: { referenceId: asset.id },
                    select: { id: true },
                });
                for (const j of aj) {
                    await db.journalLine.deleteMany({ where: { journalEntryId: j.id } });
                    await db.journalEntry.delete({ where: { id: j.id } });
                }
            }
            await db.fixedAsset.deleteMany({ where: { goodsReceiptId } });
        }

        // 1. Reverse inventory + delete stock movements + journal entries
        for (const movement of gr.movements) {
            // Find and delete the journal entry created by recordInventoryMovement
            // (referenceType: 'GOODS_RECEIPT', referenceId: movement.id)
            const journalEntry = await db.journalEntry.findFirst({
                where: {
                    referenceId: movement.id,
                    referenceType: 'GOODS_RECEIPT',
                },
            });

            if (journalEntry) {
                // Delete journal lines first (cascade should handle this, but be explicit)
                await db.journalLine.deleteMany({
                    where: { journalEntryId: journalEntry.id },
                });
                await db.journalEntry.delete({
                    where: { id: journalEntry.id },
                });
            }

            // Delete CostHistory entries linked to this GR
            await db.costHistory.deleteMany({
                where: { referenceId: goodsReceiptId },
            });

            // Decrement inventory
            if (movement.toLocationId) {
                const qty = Number(movement.quantity);
                if (qty > 0) {
                    const inv = await db.inventory.findUnique({
                        where: {
                            locationId_productVariantId: {
                                locationId: movement.toLocationId,
                                productVariantId: movement.productVariantId,
                            },
                        },
                    });

                    if (inv) {
                        const currentQty = Number(inv.quantity);
                        if (currentQty < qty) {
                            logger.warn(
                                `Cannot fully reverse stock movement: current qty ${currentQty} < reversal qty ${qty}`,
                                { movementId: movement.id, module: 'ReverseGR' },
                            );
                            // Set to 0 instead of going negative
                            await db.inventory.update({
                                where: {
                                    locationId_productVariantId: {
                                        locationId: movement.toLocationId,
                                        productVariantId: movement.productVariantId,
                                    },
                                },
                                data: { quantity: 0 },
                            });
                        } else {
                            await db.inventory.update({
                                where: {
                                    locationId_productVariantId: {
                                        locationId: movement.toLocationId,
                                        productVariantId: movement.productVariantId,
                                    },
                                },
                                data: { quantity: { decrement: qty } },
                            });
                        }
                    }
                }
            }

            // Delete the stock movement
            await db.stockMovement.delete({
                where: { id: movement.id },
            });
        }

        // 2. Reset PO items receivedQty
        if (gr.purchaseOrderId && gr.purchaseOrder) {
            for (const grItem of gr.items) {
                const poItem = gr.purchaseOrder.items.find(
                    (pi) => pi.productVariantId === grItem.productVariantId,
                );
                if (poItem) {
                    const newReceivedQty = Math.max(
                        0,
                        Number(poItem.receivedQty) - Number(grItem.receivedQty),
                    );
                    await db.purchaseOrderItem.update({
                        where: { id: poItem.id },
                        data: { receivedQty: newReceivedQty },
                    });
                }
            }

            // 3. Recalculate PO status
            const updatedItems = await db.purchaseOrderItem.findMany({
                where: { purchaseOrderId: gr.purchaseOrderId },
            });
            const allReceived = updatedItems.every(
                (item) => Number(item.receivedQty) >= Number(item.quantity),
            );
            const partialReceived = updatedItems.some(
                (item) => Number(item.receivedQty) > 0,
            );

            let status: PurchaseOrderStatus;
            if (allReceived) {
                status = PurchaseOrderStatus.RECEIVED;
            } else if (partialReceived) {
                status = PurchaseOrderStatus.PARTIAL_RECEIVED;
            } else {
                // No items received — revert to SENT (the state before GR was created)
                status = PurchaseOrderStatus.SENT;
            }

            await db.purchaseOrder.update({
                where: { id: gr.purchaseOrderId },
                data: { status },
            });
        }

        // 4. Delete GR items (cascade should handle this, but be explicit)
        await db.goodsReceiptItem.deleteMany({
            where: { goodsReceiptId },
        });

        // 5. Delete the GoodsReceipt
        await db.goodsReceipt.delete({
            where: { id: goodsReceiptId },
        });

        await logActivity({
            userId,
            action: 'REVERSE_GOODS_RECEIPT',
            entityType: 'GoodsReceipt',
            entityId: goodsReceiptId,
            details: `Reversed GR ${gr.receiptNumber}${gr.purchaseOrder ? ` for PO ${gr.purchaseOrder.orderNumber}` : ''}`,
            tx: db,
        });

        return { success: true, receiptNumber: gr.receiptNumber };
    };

    if (tx) {
        return run(tx);
    }
    return prisma.$transaction(run);
}

/**
 * Reverse ALL GoodsReceipts for a PurchaseOrder.
 * Used when a Purchase Invoice is deleted to cascade-revert PO state.
 */
export async function reverseAllGoodsReceiptsForPO(
    purchaseOrderId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
) {
    const run = async (db: Prisma.TransactionClient) => {
        const receipts = await db.goodsReceipt.findMany({
            where: { purchaseOrderId },
            select: { id: true, receiptNumber: true },
        });

        for (const receipt of receipts) {
            await reverseGoodsReceipt(receipt.id, userId, db);
        }

        return { reversedCount: receipts.length };
    };

    if (tx) {
        return run(tx);
    }
    return prisma.$transaction(run);
}
