import { prisma } from '@/lib/core/prisma';
import { MovementType, Prisma, BatchStatus, ReservationStatus } from '@prisma/client';
import { logActivity } from '@/lib/tools/audit';
import {
    TransferStockValues,
    BulkTransferStockValues,
    AdjustStockWithBatchValues,
    BulkAdjustStockValues
} from '@/lib/schemas/inventory';
import { AccountingService } from '@/services/accounting/accounting-service';
import { InventoryCoreService } from './core-service';

export class InventoryMovementService {
    static async transferStock(data: TransferStockValues, userId: string) {
        const { sourceLocationId, destinationLocationId, productVariantId, quantity, notes, date } = data;

        await prisma.$transaction(async (tx) => {
            const sourceStockRow = await tx.$queryRaw<Array<{ quantity: string }>>`
                SELECT "quantity"::text as quantity
                FROM "Inventory"
                WHERE "locationId" = ${sourceLocationId} AND "productVariantId" = ${productVariantId}
                FOR UPDATE
            `;
            const sourceStockQty = sourceStockRow[0] ? Number(sourceStockRow[0].quantity) : null;

            if (sourceStockQty === null || sourceStockQty < quantity) {
                throw new Error(`Stok di lokasi sumber tidak mencukupi. Saat ini: ${sourceStockQty || 0}`);
            }

            const activeReservations = await tx.stockReservation.aggregate({
                where: {
                    locationId: sourceLocationId,
                    productVariantId: productVariantId,
                    status: ReservationStatus.ACTIVE
                },
                _sum: { quantity: true }
            });

            const reservedQty = activeReservations._sum.quantity?.toNumber() || 0;
            const availableQty = (sourceStockQty || 0) - reservedQty;

            if (availableQty < quantity) {
                throw new Error(`Tidak dapat melakukan transfer. Barang terreservasi. Tersedia: ${availableQty}, Diminta: ${quantity}`);
            }

            await tx.inventory.update({
                where: {
                    locationId_productVariantId: {
                        locationId: sourceLocationId,
                        productVariantId: productVariantId,
                    },
                },
                data: { quantity: { decrement: quantity } },
            });

            await tx.inventory.upsert({
                where: {
                    locationId_productVariantId: {
                        locationId: destinationLocationId,
                        productVariantId: productVariantId,
                    },
                },
                update: { quantity: { increment: quantity } },
                create: {
                    locationId: destinationLocationId,
                    productVariantId: productVariantId,
                    quantity: quantity,
                },
            });

            await tx.stockMovement.create({
                data: {
                    type: MovementType.TRANSFER,
                    productVariantId,
                    fromLocationId: sourceLocationId,
                    toLocationId: destinationLocationId,
                    quantity,
                    reference: notes,
                    createdAt: date,
                    createdById: userId,
                },
            });

            await logActivity({
                userId: userId,
                action: 'TRANSFER_STOCK',
                entityType: 'ProductVariant',
                entityId: productVariantId,
                details: `Transferred ${quantity} from ${sourceLocationId} to ${destinationLocationId}`,
                tx
            });
        });
    }

    static async transferStockBulk(data: BulkTransferStockValues, userId: string) {
        const { sourceLocationId, destinationLocationId, items, notes, date } = data;

        await prisma.$transaction(async (tx) => {
            // 1. Fetch and Lock all Source Inventory
            const productVariantIds = items.map(i => i.productVariantId);

            if (productVariantIds.length === 0) return;

            const sourceStockRows = await tx.$queryRaw<Array<{ productVariantId: string, quantity: string }>>`
                SELECT "productVariantId", "quantity"::text as quantity
                FROM "Inventory"
                WHERE "locationId" = ${sourceLocationId}
                AND "productVariantId" IN (${Prisma.join(productVariantIds)})
                FOR UPDATE
            `;

            const stockMap = new Map<string, number>();
            sourceStockRows.forEach(row => {
                stockMap.set(row.productVariantId, Number(row.quantity));
            });

            // 2. Fetch Reservations
            const activeReservations = await tx.stockReservation.groupBy({
                by: ['productVariantId'],
                where: {
                    locationId: sourceLocationId,
                    productVariantId: { in: productVariantIds },
                    status: ReservationStatus.ACTIVE
                },
                _sum: { quantity: true }
            });

            const reservationMap = new Map<string, number>();
            activeReservations.forEach(r => {
                reservationMap.set(r.productVariantId, r._sum.quantity?.toNumber() || 0);
            });

            // 3. Process Transfers
            for (const item of items) {
                const { productVariantId, quantity } = item;

                const sourceStockQty = stockMap.get(productVariantId);

                if (sourceStockQty === undefined || sourceStockQty < quantity) {
                    throw new Error(`Stok tidak mencukupi untuk produk ${productVariantId} di lokasi sumber.`);
                }

                const reservedQty = reservationMap.get(productVariantId) || 0;
                const availableQty = sourceStockQty - reservedQty;

                if (availableQty < quantity) {
                    throw new Error(`Tidak dapat mentransfer produk ${productVariantId}. Barang terreservasi. Tersedia: ${availableQty}, Diminta: ${quantity}`);
                }

                // Update local map to reflect deduction for subsequent iterations
                stockMap.set(productVariantId, sourceStockQty - quantity);

                await tx.inventory.update({
                    where: {
                        locationId_productVariantId: {
                            locationId: sourceLocationId,
                            productVariantId: productVariantId,
                        },
                    },
                    data: { quantity: { decrement: quantity } },
                });

                await tx.inventory.upsert({
                    where: {
                        locationId_productVariantId: {
                            locationId: destinationLocationId,
                            productVariantId: productVariantId,
                        },
                    },
                    update: { quantity: { increment: quantity } },
                    create: {
                        locationId: destinationLocationId,
                        productVariantId: productVariantId,
                        quantity: quantity,
                    },
                });

                await tx.stockMovement.create({
                    data: {
                        type: MovementType.TRANSFER,
                        productVariantId,
                        fromLocationId: sourceLocationId,
                        toLocationId: destinationLocationId,
                        quantity,
                        reference: notes,
                        createdAt: date,
                        createdById: userId,
                    },
                });

                await logActivity({
                    userId: userId,
                    action: 'TRANSFER_STOCK_BULK',
                    entityType: 'ProductVariant',
                    entityId: productVariantId,
                    details: `Bulk Transferred ${quantity} from ${sourceLocationId} to ${destinationLocationId}`,
                    tx
                });
            }
        });
    }

    static async adjustStock(data: AdjustStockWithBatchValues, userId: string) {
        const { locationId, productVariantId, type, quantity, reason, batchData, unitCost } = data;

        await prisma.$transaction(async (tx) => {
            const isIncrement = type === 'ADJUSTMENT_IN';

            if (!isIncrement) {
                const currentStockRow = await tx.$queryRaw<Array<{ quantity: string }>>`
                    SELECT "quantity"::text as quantity
                    FROM "Inventory"
                    WHERE "locationId" = ${locationId} AND "productVariantId" = ${productVariantId}
                    FOR UPDATE
                `;
                const currentStockQty = currentStockRow[0] ? Number(currentStockRow[0].quantity) : null;
                if (currentStockQty === null || currentStockQty < quantity) {
                    throw new Error(`Stok tidak cukup untuk pengurangan (ADJUST OUT). Saat ini: ${currentStockQty || 0}`);
                }

                const activeReservations = await tx.stockReservation.aggregate({
                    where: {
                        locationId,
                        productVariantId,
                        status: ReservationStatus.ACTIVE
                    },
                    _sum: { quantity: true }
                });

                const reservedQty = activeReservations._sum.quantity?.toNumber() || 0;
                const availableQty = currentStockQty - reservedQty;

                if (availableQty < quantity) {
                    throw new Error(`Tidak dapat melakukan penyesuaian OUT. Barang terreservasi. Tersedia: ${availableQty}, Diminta: ${quantity}`);
                }
            } else {
                if (batchData) {
                    await tx.batch.create({
                        data: {
                            batchNumber: batchData.batchNumber,
                            productVariantId,
                            locationId,
                            quantity,
                            manufacturingDate: batchData.manufacturingDate,
                            expiryDate: batchData.expiryDate,
                            status: BatchStatus.ACTIVE
                        }
                    });
                }
            }

            if (isIncrement) {
                let cost = unitCost;
                if (!cost) {
                    const variant = await tx.productVariant.findUnique({
                        where: { id: productVariantId },
                        select: { buyPrice: true }
                    });
                    cost = variant?.buyPrice?.toNumber() || 0;
                }

                const newAvgCost = await InventoryCoreService.calculateWAC(
                    productVariantId,
                    locationId,
                    quantity,
                    cost
                );

                await tx.inventory.upsert({
                    where: {
                        locationId_productVariantId: { locationId, productVariantId },
                    },
                    update: {
                        quantity: { increment: quantity },
                        averageCost: newAvgCost
                    },
                    create: {
                        locationId,
                        productVariantId,
                        quantity,
                        averageCost: cost
                    }
                });
            } else {
                await tx.inventory.update({
                    where: {
                        locationId_productVariantId: { locationId, productVariantId },
                    },
                    data: { quantity: { decrement: quantity } }
                });
            }

            let batchId: string | null = null;
            if (isIncrement && batchData) {
                const newBatch = await tx.batch.findUnique({
                    where: { batchNumber: batchData.batchNumber }
                });
                batchId = newBatch?.id || null;
            }

            const movement = await tx.stockMovement.create({
                data: {
                    type: MovementType.ADJUSTMENT,
                    productVariantId,
                    fromLocationId: isIncrement ? null : locationId,
                    toLocationId: isIncrement ? locationId : null,
                    quantity,
                    cost: unitCost ? new Prisma.Decimal(unitCost) : undefined,
                    reference: reason,
                    batchId,
                    createdById: userId,
                },
            });

            await logActivity({
                userId: userId,
                action: 'ADJUST_STOCK',
                entityType: 'ProductVariant',
                entityId: productVariantId,
                details: `${type} ${quantity} at ${locationId}. Reason: ${reason}`,
                tx
            });

            await AccountingService.recordInventoryMovement(movement, tx);

            return movement;
        });
    }

    static async adjustStockBulk(data: BulkAdjustStockValues, userId: string) {
        const { locationId, items } = data;

        await prisma.$transaction(async (tx) => {
            const movements = [];
            for (const item of items) {
                const { productVariantId, type, quantity, reason, unitCost } = item;
                const isIncrement = type === 'ADJUSTMENT_IN';

                if (!isIncrement) {
                    const currentStockRow = await tx.$queryRaw<Array<{ quantity: string }>>`
                        SELECT "quantity"::text as quantity
                        FROM "Inventory"
                        WHERE "locationId" = ${locationId} AND "productVariantId" = ${productVariantId}
                        FOR UPDATE
                    `;
                    const currentStockQty = currentStockRow[0] ? Number(currentStockRow[0].quantity) : null;
                    if (currentStockQty === null || currentStockQty < quantity) {
                        throw new Error(`Insufficient stock to adjust OUT for product ${productVariantId}`);
                    }
                }

                if (isIncrement) {
                    let cost = unitCost;
                    if (!cost) {
                        const variant = await tx.productVariant.findUnique({
                            where: { id: productVariantId },
                            select: { buyPrice: true }
                        });
                        cost = variant?.buyPrice?.toNumber() || 0;
                    }

                    const newAvgCost = await InventoryCoreService.calculateWAC(
                        productVariantId,
                        locationId,
                        quantity,
                        cost
                    );

                    await tx.inventory.upsert({
                        where: {
                            locationId_productVariantId: { locationId, productVariantId },
                        },
                        update: {
                            quantity: { increment: quantity },
                            averageCost: newAvgCost
                        },
                        create: {
                            locationId,
                            productVariantId,
                            quantity,
                            averageCost: cost
                        }
                    });
                } else {
                    await tx.inventory.update({
                        where: {
                            locationId_productVariantId: { locationId, productVariantId },
                        },
                        data: { quantity: { decrement: quantity } }
                    });
                }

                const movement = await tx.stockMovement.create({
                    data: {
                        type: MovementType.ADJUSTMENT,
                        productVariantId,
                        fromLocationId: isIncrement ? null : locationId,
                        toLocationId: isIncrement ? locationId : null,
                        quantity,
                        cost: unitCost ? new Prisma.Decimal(unitCost) : undefined,
                        reference: reason,
                        createdById: userId,
                    },
                });

                await logActivity({
                    userId: userId,
                    action: 'ADJUST_STOCK_BULK',
                    entityType: 'ProductVariant',
                    entityId: productVariantId,
                    details: `Bulk Adjusted ${type} ${quantity} at ${locationId}. Reason: ${reason}`,
                    tx
                });

                await AccountingService.recordInventoryMovement(movement, tx);
                movements.push(movement);
            }
            return movements;
        });
    }
}
