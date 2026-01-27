import { prisma } from '@/lib/prisma';
import { MovementType, Prisma, ReservationStatus, BatchStatus, ProductType } from '@prisma/client';
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
import { subDays, format } from 'date-fns';
import { AutoJournalService } from '@/services/finance/auto-journal-service';


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
                status: ReservationStatus.ACTIVE
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

        // Fetch active reservations
        const reservations = await prisma.stockReservation.groupBy({
            by: ['productVariantId', 'locationId'],
            where: {
                status: ReservationStatus.ACTIVE
            },
            _sum: {
                quantity: true
            }
        });

        const reservationMap = new Map<string, number>();
        reservations.forEach(r => {
            const key = `${r.locationId}-${r.productVariantId}`;
            reservationMap.set(key, r._sum.quantity?.toNumber() || 0);
        });

        return inventory.map(item => {
            const key = `${item.locationId}-${item.productVariantId}`;
            const reservedQuantity = reservationMap.get(key) || 0;
            const totalQuantity = item.quantity.toNumber();
            const availableQuantity = totalQuantity - reservedQuantity;

            return {
                ...item,
                reservedQuantity,
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
                        status: ReservationStatus.ACTIVE
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
            await AutoJournalService.handleStockMovement(result.id).catch(console.error);
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
        const variants = await prisma.productVariant.findMany({
            where: { reorderPoint: { not: null } },
            include: {
                product: { select: { name: true, productType: true } },
                preferredSupplier: { select: { name: true } },
                inventories: { select: { quantity: true } }
            }
        });

        return variants.map(v => {
            const totalPhysical = v.inventories.reduce((sum, inv) => sum + inv.quantity.toNumber(), 0);
            return {
                ...v,
                totalStock: totalPhysical,
                shouldReorder: totalPhysical < (v.reorderPoint?.toNumber() || 0)
            };
        }).filter(v => v.shouldReorder);
    }

    static async getInventoryValuation() {
        const stock = await prisma.inventory.findMany({
            where: { quantity: { gt: 0 } },
            include: {
                productVariant: {
                    select: { name: true, skuCode: true, buyPrice: true }
                }
            }
        });

        let totalValuation = 0;
        const valuationDetails = [];

        for (const item of stock) {
            const quantity = item.quantity.toNumber();
            const unitCost = item.averageCost?.toNumber() || item.productVariant.buyPrice?.toNumber() || 0;
            const value = quantity * unitCost;

            totalValuation += value;

            valuationDetails.push({
                productVariantId: item.productVariantId,
                name: item.productVariant.name,
                sku: item.productVariant.skuCode,
                locationId: item.locationId,
                quantity,
                unitCost,
                totalValue: value
            });
        }

        return {
            totalValuation,
            details: valuationDetails
        };
    }

    static async getInventoryAsOf(targetDate: Date, locationId?: string) {
        // Optimized query using SQL UNION and GROUP BY to avoid in-memory aggregation of all movements
        // This reduces complexity from O(N) application-side to O(N) database-side (which is much faster and indexed)

        // We calculate net change per location:
        // - Outgoing: -quantity
        // - Incoming: +quantity

        const result = await prisma.$queryRaw<Array<{ productVariantId: string, locationId: string, quantity: number }>>`
            SELECT
                "productVariantId",
                "locationId",
                SUM("quantity")::float as "quantity"
            FROM (
                SELECT "productVariantId", "fromLocationId" as "locationId", -1 * "quantity" as "quantity"
                FROM "StockMovement"
                WHERE "fromLocationId" IS NOT NULL AND "createdAt" <= ${targetDate}::timestamp

                UNION ALL

                SELECT "productVariantId", "toLocationId" as "locationId", "quantity"
                FROM "StockMovement"
                WHERE "toLocationId" IS NOT NULL AND "createdAt" <= ${targetDate}::timestamp
            ) as movements
            WHERE "locationId" IS NOT NULL
            ${locationId ? Prisma.sql`AND "locationId" = ${locationId}` : Prisma.empty}
            GROUP BY "productVariantId", "locationId"
        `;

        return result;
    }

    static async getStockHistory(productVariantId: string, startDate: Date, endDate: Date, locationId?: string) {
        const initialMovements = await prisma.stockMovement.findMany({
            where: {
                productVariantId,
                createdAt: { lt: startDate },
                ...(locationId ? {
                    OR: [
                        { fromLocationId: locationId },
                        { toLocationId: locationId }
                    ]
                } : {})
            }
        });

        let currentStock = initialMovements.reduce((sum, m) => {
            const qty = m.quantity.toNumber();
            let delta = 0;
            if (locationId) {
                if (m.toLocationId === locationId) delta += qty;
                if (m.fromLocationId === locationId) delta -= qty;
            } else {
                if (m.toLocationId && !m.fromLocationId) delta += qty;
                if (m.fromLocationId && !m.toLocationId) delta -= qty;
            }
            return sum + delta;
        }, 0);

        const movements = await prisma.stockMovement.findMany({
            where: {
                productVariantId,
                createdAt: {
                    gte: startDate,
                    lte: endDate
                },
                ...(locationId ? {
                    OR: [
                        { fromLocationId: locationId },
                        { toLocationId: locationId }
                    ]
                } : {})
            },
            orderBy: { createdAt: 'asc' }
        });

        const historyData = [];
        const curr = new Date(startDate);

        while (curr <= endDate) {
            const dayStart = new Date(curr);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(curr);
            dayEnd.setHours(23, 59, 59, 999);

            const dayMovements = movements.filter(m =>
                m.createdAt >= dayStart && m.createdAt <= dayEnd
            );

            dayMovements.forEach(m => {
                const qty = m.quantity.toNumber();
                if (locationId) {
                    if (m.toLocationId === locationId) currentStock += qty;
                    if (m.fromLocationId === locationId) currentStock -= qty;
                } else {
                    if (m.toLocationId && !m.fromLocationId) currentStock += qty;
                    if (m.fromLocationId && !m.toLocationId) currentStock -= qty;
                }
            });

            historyData.push({
                date: dayStart.toISOString().split('T')[0],
                stock: currentStock
            });

            curr.setDate(curr.getDate() + 1);
        }

        return historyData;
    }

    static async createStockReservation(data: CreateReservationValues, tx?: Prisma.TransactionClient) {
        const { productVariantId, locationId, quantity, reservedFor, referenceId, reservedUntil } = data;

        const execute = async (transaction: Prisma.TransactionClient) => {
            const physicalStock = await transaction.inventory.findUnique({
                where: {
                    locationId_productVariantId: { locationId, productVariantId }
                },
                select: { quantity: true }
            });

            const currentReservations = await transaction.stockReservation.aggregate({
                where: {
                    locationId,
                    productVariantId,
                    status: ReservationStatus.ACTIVE
                },
                _sum: { quantity: true }
            });

            const totalPhysical = physicalStock?.quantity.toNumber() || 0;
            const totalReserved = currentReservations._sum.quantity?.toNumber() || 0;
            const available = totalPhysical - totalReserved;

            if (available < quantity) {
                // Fetch name for error
                const variant = await transaction.productVariant.findUnique({ where: { id: productVariantId }, select: { name: true } });
                throw new Error(`Stok tidak cukup untuk reservasi ${variant?.name || productVariantId}. Fisik: ${totalPhysical}, Reserved: ${totalReserved}, Tersedia: ${available}, Diminta: ${quantity}`);
            }

            await transaction.stockReservation.create({
                data: {
                    productVariantId,
                    locationId,
                    quantity,
                    reservedFor,
                    referenceId,
                    reservedUntil,
                    status: ReservationStatus.ACTIVE
                }
            });
        };

        if (tx) {
            await execute(tx);
        } else {
            await prisma.$transaction(execute);
        }
    }

    static async cancelStockReservation(data: CancelReservationValues) {
        await prisma.stockReservation.update({
            where: { id: data.reservationId },
            data: { status: ReservationStatus.CANCELLED }
        });
    }

    static async getActiveReservations(locationId?: string, productVariantId?: string) {
        const where: Prisma.StockReservationWhereInput = {
            status: ReservationStatus.ACTIVE
        };

        if (locationId) where.locationId = locationId;
        if (productVariantId) where.productVariantId = productVariantId;

        return await prisma.stockReservation.findMany({
            where,
            include: {
                productVariant: {
                    select: { name: true, skuCode: true }
                },
                location: {
                    select: { name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    // ============================================
    // ANALYTICS & INSIGHTS (Phase 4)
    // ============================================

    /**
     * Calculates Inventory Turnover Ratio = COGS / Average Inventory Value
     * Returns global ratio and breakdown by product type
     */
    static async getInventoryTurnover(periodDays = 30) {
        const startDate = subDays(new Date(), periodDays);
        const endDate = new Date();

        // 1. Calculate COGS (Cost of Goods Sold)
        // Sum of quantity * cost for OUT movements (Sales, Production usage)
        const outboundMovements = await prisma.stockMovement.findMany({
            where: {
                type: MovementType.OUT,
                createdAt: { gte: startDate, lte: endDate },
                cost: { not: null }
            },
            select: { quantity: true, cost: true }
        });

        const cogs = outboundMovements.reduce((sum, m) => {
            return sum + (m.quantity.toNumber() * (m.cost?.toNumber() || 0));
        }, 0);

        // 2. Average Inventory Value
        // (Opening Inventory + Closing Inventory) / 2
        // We reuse getInventoryValuation logic but need it for specific dates
        // For simplicity in this iteration, we'll use current valuation as "Closing" 
        // and approximate Opening by reversing movements from current.

        // Current Value
        const currentValuation = await this.getInventoryValuation();
        const closingValue = currentValuation.totalValuation;

        // Opening Value Approximation = Closing - (In Value) + (Out Value)
        // "In Value" during period
        const inboundMovements = await prisma.stockMovement.findMany({
            where: {
                type: MovementType.IN,
                createdAt: { gte: startDate, lte: endDate },
                cost: { not: null }
            },
            select: { quantity: true, cost: true }
        });
        const inValue = inboundMovements.reduce((sum, m) => sum + (m.quantity.toNumber() * (m.cost?.toNumber() || 0)), 0);
        const outValue = cogs; // Reuse COGS calculation

        const openingValue = closingValue - inValue + outValue;
        const averageInventory = (openingValue + closingValue) / 2;

        const turnoverRatio = averageInventory > 0 ? cogs / averageInventory : 0;

        return {
            periodDays,
            cogs,
            averageInventory,
            turnoverRatio: Number(turnoverRatio.toFixed(2))
        };
    }

    /**
     * Calculates Days of Inventory on Hand (DOH)
     * DOH = (Average Inventory / COGS) * Period Days
     */
    static async getDaysOfInventoryOnHand(periodDays = 30) {
        const turnoverStats = await this.getInventoryTurnover(periodDays);

        // If no COGS, means infinite days (or 0 if no stock)
        // To avoid division by zero:
        if (turnoverStats.cogs === 0) {
            return {
                ...turnoverStats,
                daysOnHand: turnoverStats.averageInventory > 0 ? 999 : 0
            };
        }

        const daysOnHand = (turnoverStats.averageInventory / turnoverStats.cogs) * periodDays;

        return {
            ...turnoverStats,
            daysOnHand: Number(daysOnHand.toFixed(1))
        };
    }

    /**
     * Get stock movement trends for charts
     */
    static async getStockMovementTrends(period: 'week' | 'month' | 'quarter' = 'month') {
        const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
        const startDate = subDays(new Date(), days);

        const movements = await prisma.stockMovement.findMany({
            where: {
                createdAt: { gte: startDate }
            },
            select: {
                type: true,
                quantity: true,
                createdAt: true
            },
            orderBy: { createdAt: 'asc' }
        });

        // Group by Date
        const grouped = movements.reduce((acc, m) => {
            const dateStr = format(m.createdAt, 'yyyy-MM-dd');
            if (!acc[dateStr]) {
                acc[dateStr] = { date: dateStr, in: 0, out: 0, transfer: 0, adjustment: 0 };
            }

            const qty = m.quantity.toNumber();
            if (m.type === MovementType.IN) acc[dateStr].in += qty;
            else if (m.type === MovementType.OUT) acc[dateStr].out += qty;
            else if (m.type === MovementType.TRANSFER) acc[dateStr].transfer += qty;
            else if (m.type === MovementType.ADJUSTMENT) acc[dateStr].adjustment += qty;

            return acc;
        }, {} as Record<string, { date: string; in: number; out: number; transfer: number; adjustment: number }>);

        // Fill missing dates
        const results = [];
        for (let i = 0; i <= days; i++) {
            const date = subDays(new Date(), days - i);
            const dateStr = format(date, 'yyyy-MM-dd');
            results.push(grouped[dateStr] || { date: dateStr, in: 0, out: 0, transfer: 0, adjustment: 0 });
        }

        return results;
    }

}
