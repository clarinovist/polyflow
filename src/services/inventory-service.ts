import { prisma } from '@/lib/prisma';
import { MovementType, Prisma, BatchStatus, ProductType } from '@prisma/client';
import { logActivity } from '@/lib/audit';
import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';
import {
    TransferStockValues,
    BulkTransferStockValues,
    AdjustStockWithBatchValues,
    BulkAdjustStockValues,
    CreateReservationValues,
    CancelReservationValues
} from '@/lib/schemas/inventory';

import { InventoryWithRelations } from '@/types/inventory';
import { AutoJournalService } from '@/services/finance/auto-journal-service'; // Deprecated?
import { AccountingService } from '@/services/accounting-service';
import { STATUS_ACTIVE, STATUS_WAITING } from './inventory/constants';
import { createStockReservation, cancelStockReservation, getActiveReservations } from './inventory/reservation-service';
import {
    getSuggestedPurchases,
    getInventoryValuation,
    getInventoryAsOf,
    getStockHistory,
    getInventoryTurnover,
    getDaysOfInventoryOnHand,
    getStockMovementTrends
} from './inventory/analytics-service';

export class InventoryService {

    /**
     * Validate and Lock Stock (Atomic Check)
     * Must be called within a transaction.
     */
    static async validateAndLockStock(
        tx: Prisma.TransactionClient,
        locationId: string,
        productVariantId: string,
        quantity: number
    ) {
        // 1. Lock Row
        const stockRow = await tx.$queryRaw<Array<{ quantity: string }>>`
            SELECT "quantity"::text as quantity
            FROM "Inventory"
            WHERE "locationId" = ${locationId} AND "productVariantId" = ${productVariantId}
            FOR UPDATE
        `;
        const currentQty = stockRow[0] ? Number(stockRow[0].quantity) : 0;

        // 2. Check Physical Stock
        if (currentQty < quantity) {
            // Fetch details for better error
            const [variant, location] = await Promise.all([
                tx.productVariant.findUnique({ where: { id: productVariantId }, select: { name: true, primaryUnit: true } }),
                tx.location.findUnique({ where: { id: locationId }, select: { name: true } })
            ]);

            throw new Error(
                `Insufficient physical stock at location "${location?.name || locationId}".\n` +
                `Product: ${variant?.name || 'Unknown Item'}\n` +
                `Required: ${quantity} ${variant?.primaryUnit || ''}\n` +
                `Available: ${currentQty} ${variant?.primaryUnit || ''}\n` +
                `Tip: Check if the stock is in a different location (e.g., Main Warehouse vs Raw Material) or perform a Stock Adjustment.`
            );
        }

        // 3. Check Reservations
        const resAgg = await tx.stockReservation.aggregate({
            where: {
                locationId,
                productVariantId,
                status: STATUS_ACTIVE
            },
            _sum: { quantity: true }
        });

        const reservedQty = resAgg._sum.quantity?.toNumber() || 0;
        const availableQty = currentQty - reservedQty;

        if (availableQty < quantity) {
            const [variant, location] = await Promise.all([
                tx.productVariant.findUnique({ where: { id: productVariantId }, select: { name: true, primaryUnit: true } }),
                tx.location.findUnique({ where: { id: locationId }, select: { name: true } })
            ]);

            throw new Error(
                `Stock is reserved at location "${location?.name || locationId}".\n` +
                `Product: ${variant?.name || 'Unknown Item'}\n` +
                `Physical Stock: ${currentQty}\n` +
                `Reserved: ${reservedQty}\n` +
                `Net Available: ${availableQty} ${variant?.primaryUnit || ''}\n` +
                `Required: ${quantity} ${variant?.primaryUnit || ''}`
            );
        }

        return currentQty;
    }

    /**
     * Deduct Stock (Atomic)
     * Does NOT check stock (assumes validateAndLockStock was called or check was done)
     * However, Prisma update will fail if record missing.
     */
    static async deductStock(
        tx: Prisma.TransactionClient,
        locationId: string,
        productVariantId: string,
        quantity: number
    ) {
        await tx.inventory.update({
            where: {
                locationId_productVariantId: { locationId, productVariantId }
            },
            data: { quantity: { decrement: quantity } }
        });
    }

    /**
     * Increment Stock (Atomic Upsert)
     */
    static async incrementStock(
        tx: Prisma.TransactionClient,
        locationId: string,
        productVariantId: string,
        quantity: number
    ) {
        await tx.inventory.upsert({
            where: {
                locationId_productVariantId: { locationId, productVariantId }
            },
            update: { quantity: { increment: quantity } },
            create: { locationId, productVariantId, quantity }
        });
    }

    static async getStats(filters?: { locationId?: string; type?: string }): Promise<InventoryWithRelations[]> {
        const where: Prisma.InventoryWhereInput = {};

        if (filters?.locationId) {
            where.locationId = filters.locationId;
        }

        if (filters?.type) {
            where.productVariant = {
                product: {
                    productType: filters.type as ProductType,
                },
            };
        }

        const inventory = await prisma.inventory.findMany({
            where,
            select: {
                id: true,
                locationId: true,
                productVariantId: true,
                quantity: true,
                updatedAt: true,
                productVariant: {
                    select: {
                        id: true,
                        name: true,
                        skuCode: true,
                        primaryUnit: true,
                        price: true,
                        minStockAlert: true,
                        product: {
                            select: {
                                id: true,
                                name: true,
                                productType: true,
                            }
                        }
                    }
                },
                location: {
                    select: {
                        id: true,
                        name: true,
                    }
                },
            },
            orderBy: {
                productVariant: {
                    name: 'asc',
                },
            },
        });

        // Fetch active and waiting reservations
        const reservations = await prisma.stockReservation.groupBy({
            by: ['productVariantId', 'locationId', 'status'],
            where: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                status: { in: [STATUS_ACTIVE, STATUS_WAITING] as any }
            },
            _sum: {
                quantity: true
            }
        });

        const activeReservationMap = new Map<string, number>();
        const waitingReservationMap = new Map<string, number>();

        reservations.forEach(r => {
            const key = `${r.locationId}-${r.productVariantId}`;
            const qty = r._sum.quantity?.toNumber() || 0;
            // Use string comparison for safety
            const status = r.status as string;
            if (status === STATUS_ACTIVE) {
                activeReservationMap.set(key, qty);
            } else if (status === STATUS_WAITING) {
                waitingReservationMap.set(key, qty);
            }
        });

        return inventory.map(item => {
            const key = `${item.locationId}-${item.productVariantId}`;
            const reservedQuantity = activeReservationMap.get(key) || 0;
            const waitingQuantity = waitingReservationMap.get(key) || 0;
            const totalQuantity = item.quantity.toNumber();
            const availableQuantity = totalQuantity - reservedQuantity;

            return {
                ...item,
                reservedQuantity,
                waitingQuantity,
                availableQuantity
            } as unknown as InventoryWithRelations;
        });
    }

    static async getLocations() {
        return await prisma.location.findMany();
    }

    static async getProductVariants() {
        return await prisma.productVariant.findMany({
            include: {
                product: true,
                inventories: {
                    select: {
                        locationId: true,
                        quantity: true
                    }
                }
            }
        });
    }

    static async getAvailableBatches(productVariantId: string, locationId: string) {
        if (!productVariantId || !locationId) return [];
        return await prisma.batch.findMany({
            where: {
                productVariantId,
                locationId,
                status: BatchStatus.ACTIVE,
                quantity: { gt: 0 }
            },
            orderBy: {
                manufacturingDate: 'asc'
            }
        });
    }



    static async calculateWAC(
        productVariantId: string,
        locationId: string,
        incomingQty: number,
        incomingCost: number
    ): Promise<number> {
        const inventory = await prisma.inventory.findUnique({
            where: { locationId_productVariantId: { locationId, productVariantId } }
        });

        const currentQty = inventory?.quantity.toNumber() || 0;
        const currentAvgCost = inventory?.averageCost?.toNumber() || 0;

        // WAC Formula: ((Existing Qty * Existing Cost) + (New Qty * New Cost)) / Total Qty
        const totalQty = currentQty + incomingQty;
        if (totalQty === 0) return 0;

        return ((currentQty * currentAvgCost) + (incomingQty * incomingCost)) / totalQty;
    }

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
                    status: STATUS_ACTIVE
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
            for (const item of items) {
                const { productVariantId, quantity } = item;

                const sourceStockRow = await tx.$queryRaw<Array<{ quantity: string }>>`
                    SELECT "quantity"::text as quantity
                    FROM "Inventory"
                    WHERE "locationId" = ${sourceLocationId} AND "productVariantId" = ${productVariantId}
                    FOR UPDATE
                `;
                const sourceStockQty = sourceStockRow[0] ? Number(sourceStockRow[0].quantity) : null;

                if (sourceStockQty === null || sourceStockQty < quantity) {
                    throw new Error(`Stok tidak mencukupi untuk produk ${productVariantId} di lokasi sumber.`);
                }

                const activeReservations = await tx.stockReservation.aggregate({
                    where: {
                        locationId: sourceLocationId,
                        productVariantId: productVariantId,
                        status: STATUS_ACTIVE
                    },
                    _sum: { quantity: true }
                });

                const reservedQty = activeReservations._sum.quantity?.toNumber() || 0;
                const availableQty = sourceStockQty - reservedQty;

                if (availableQty < quantity) {
                    throw new Error(`Tidak dapat mentransfer produk ${productVariantId}. Barang terreservasi. Tersedia: ${availableQty}, Diminta: ${quantity}`);
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

        const result = await prisma.$transaction(async (tx) => {
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
                        status: STATUS_ACTIVE
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
                // Get default cost if not provided
                let cost = unitCost;
                if (!cost) {
                    // Try to get standard cost or buy price
                    const variant = await tx.productVariant.findUnique({
                        where: { id: productVariantId },
                        select: { buyPrice: true }
                    });
                    cost = variant?.buyPrice?.toNumber() || 0;
                }

                // Calculate new Weighted Average Cost
                const newAvgCost = await InventoryService.calculateWAC(
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

            return movement;
        });

        if (result) {
            // await AutoJournalService.handleStockMovement(result.id).catch(console.error);
            await AccountingService.recordInventoryMovement(result).catch(console.error);
        }
    }

    static async adjustStockBulk(data: BulkAdjustStockValues, userId: string) {
        const { locationId, items } = data;

        const results = await prisma.$transaction(async (tx) => {
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
                    // Get default cost if not provided
                    let cost = unitCost;
                    if (!cost) {
                        // Try to get standard cost or buy price
                        const variant = await tx.productVariant.findUnique({
                            where: { id: productVariantId },
                            select: { buyPrice: true }
                        });
                        cost = variant?.buyPrice?.toNumber() || 0;
                    }

                    // Calculate new Weighted Average Cost
                    const newAvgCost = await InventoryService.calculateWAC(
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
                movements.push(movement);
            }
            return movements;
        });

        if (results && results.length > 0) {
            for (const movement of results) {
                await AutoJournalService.handleStockMovement(movement.id).catch(console.error);
            }
        }
    }

    static async updateThreshold(productVariantId: string, minStockAlert: number) {
        await prisma.productVariant.update({
            where: { id: productVariantId },
            data: { minStockAlert: new Prisma.Decimal(minStockAlert) },
        });
    }

    static async getStockMovements(limit = 50) {
        return await prisma.stockMovement.findMany({
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                productVariant: {
                    include: { product: true }
                },
                fromLocation: true,
                toLocation: true,
                createdBy: true,
            },
        });
    }

    static async getDashboardStats() {
        const [productCount, inventory, lowStockVariants] = await Promise.all([
            prisma.product.count(),
            prisma.inventory.findMany({
                select: {
                    quantity: true,
                    productVariantId: true,
                    location: { select: { id: true, slug: true } },
                    productVariant: {
                        select: { minStockAlert: true }
                    }
                }
            }),
            prisma.productVariant.findMany({
                where: { minStockAlert: { not: null } },
                select: {
                    id: true,
                    minStockAlert: true,
                    inventories: { select: { quantity: true } }
                }
            })
        ]);

        const totalStock = inventory.reduce((sum, item) => sum + item.quantity.toNumber(), 0);

        // Build total quantities per variant for ALL locations
        const variantQuantitiesAll = inventory.reduce((acc, item) => {
            acc[item.productVariantId] = (acc[item.productVariantId] || 0) + item.quantity.toNumber();
            return acc;
        }, {} as Record<string, number>);

        // For low stock alert we only consider Raw Material and Finished Goods warehouses
        const allowedLocationSlugs = new Set<string>([WAREHOUSE_SLUGS.RAW_MATERIAL, WAREHOUSE_SLUGS.FINISHING]);
        const variantQuantitiesForAlerts = inventory.reduce((acc, item) => {
            const slug = item.location?.slug;
            if (slug && allowedLocationSlugs.has(slug)) {
                acc[item.productVariantId] = (acc[item.productVariantId] || 0) + item.quantity.toNumber();
            }
            return acc;
        }, {} as Record<string, number>);

        const lowStockCount = lowStockVariants.filter(variant => {
            const totalForAlert = variantQuantitiesForAlerts[variant.id] || 0;
            const threshold = variant.minStockAlert?.toNumber() || 0;
            return totalForAlert < threshold;
        }).length;

        const reorderVariants = await prisma.productVariant.findMany({
            where: { reorderPoint: { not: null } },
            select: { id: true, reorderPoint: true }
        });

        const suggestedPurchasesCount = reorderVariants.filter(variant => {
            const total = variantQuantitiesAll[variant.id] || 0;
            const reorderPoint = variant.reorderPoint?.toNumber() || 0;
            return total < reorderPoint;
        }).length;

        const recentMovements = await prisma.stockMovement.count({
            where: {
                createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            }
        });

        return {
            productCount,
            totalStock,
            lowStockCount,
            recentMovements,
            suggestedPurchasesCount
        };
    }

    static async getSuggestedPurchases() {
        return getSuggestedPurchases();
    }

    static async getInventoryValuation() {
        return getInventoryValuation();
    }

    static async getInventoryAsOf(targetDate: Date, locationId?: string) {
        return getInventoryAsOf(targetDate, locationId);
    }

    static async getStockHistory(productVariantId: string, startDate: Date, endDate: Date, locationId?: string) {
        return getStockHistory(productVariantId, startDate, endDate, locationId);
    }

    static async createStockReservation(data: CreateReservationValues, tx?: Prisma.TransactionClient) {
        return createStockReservation(data, tx);
    }

    static async cancelStockReservation(data: CancelReservationValues) {
        return cancelStockReservation(data);
    }

    static async getActiveReservations(locationId?: string, productVariantId?: string) {
        return getActiveReservations(locationId, productVariantId);
    }

    // ============================================
    // ANALYTICS & INSIGHTS (Phase 4)
    // ============================================

    /**
     * Calculates Inventory Turnover Ratio = COGS / Average Inventory Value
     * Returns global ratio and breakdown by product type
     */
    static async getInventoryTurnover(periodDays = 30) {
        return getInventoryTurnover(periodDays);
    }

    /**
     * Calculates Days of Inventory on Hand (DOH)
     * DOH = (Average Inventory / COGS) * Period Days
     */
    static async getDaysOfInventoryOnHand(periodDays = 30) {
        return getDaysOfInventoryOnHand(periodDays);
    }

    /**
     * Get stock movement trends for charts
     */
    static async getStockMovementTrends(period: 'week' | 'month' | 'quarter' = 'month') {
        return getStockMovementTrends(period);
    }

}
