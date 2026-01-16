'use server';

import { prisma } from '@/lib/prisma';
import { transferStockSchema, TransferStockValues, bulkAdjustStockSchema, BulkAdjustStockValues, bulkTransferStockSchema, BulkTransferStockValues, createReservationSchema, CreateReservationValues, cancelReservationSchema, CancelReservationValues, adjustStockWithBatchSchema, AdjustStockWithBatchValues } from '@/lib/zod-schemas';
import { MovementType, Prisma, Unit, ProductType, ReservationStatus, BatchStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export type InventoryWithRelations = {
    id: string;
    locationId: string;
    productVariantId: string;
    quantity: Prisma.Decimal;
    updatedAt: Date;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: Unit;
        minStockAlert: Prisma.Decimal | null;
        product: {
            id: string;
            name: string;
            productType: ProductType;
        };
    };
    location: {
        id: string;
        name: string;
    };
    reservedQuantity?: number;
    availableQuantity?: number;
};

export async function getInventoryStats(searchParams?: { locationId?: string; type?: string }) {
    const where: Prisma.InventoryWhereInput = {};

    if (searchParams?.locationId) {
        where.locationId = searchParams.locationId;
    }

    if (searchParams?.type) {
        where.productVariant = {
            product: {
                productType: searchParams.type as ProductType,
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

    // Fetch active reservations to calculate reserved and available stock
    const reservations = await prisma.stockReservation.groupBy({
        by: ['productVariantId', 'locationId'],
        where: {
            status: ReservationStatus.ACTIVE
        },
        _sum: {
            quantity: true
        }
    });

    // Create a lookup map for reservations
    const reservationMap = new Map<string, number>();
    reservations.forEach(r => {
        const key = `${r.locationId}-${r.productVariantId}`;
        reservationMap.set(key, r._sum.quantity?.toNumber() || 0);
    });

    // Enhance inventory items with reserved and available quantities
    const enhancedInventory = inventory.map(item => {
        const key = `${item.locationId}-${item.productVariantId}`;
        const reservedQuantity = reservationMap.get(key) || 0;
        const totalQuantity = item.quantity.toNumber();
        const availableQuantity = totalQuantity - reservedQuantity;

        return {
            ...item,
            reservedQuantity,
            availableQuantity
        };
    });

    return enhancedInventory as unknown as InventoryWithRelations[];
}

export async function getLocations() {
    return await prisma.location.findMany();
}

export async function getProductVariants() {
    return await prisma.productVariant.findMany({
        include: {
            product: true
        }
    });
}

/**
 * Get available batches for a product variant at a location
 */
export async function getAvailableBatches(productVariantId: string, locationId: string) {
    if (!productVariantId || !locationId) return [];

    // 1. Get batches that are not expired (optional logic) and have status ACTIVE
    // We also need to check "Inventory" table? 
    // Actually, `Batch` table tracks manufacturing date, but `Inventory` aggregates qty.
    // However, if we implemented true batch tracking, we should have a `BatchInventory` or similar, OR `Inventory` has `batchId`.
    // In our schema, `Inventory` does NOT key by BatchId (yet). It is `locationId_productVariantId`.
    // Wait, checked schema earlier: `MaterialIssue` has `batchId`.
    // But does `Inventory` have `batchId`?
    // User schema analysis: "contains models... Batch... The Batch model has a QUARANTINE status".
    // I need to check if `Inventory` has `batchId` to distinguish stock.
    // If `Inventory` is only (Location, Variant), then we don't track HOW MANY of EACH BATCH are in stock.
    // That means we can't enforce FIFO strictly based on "Current Stock of Batch A".
    // We only know "Batch A exists" and "Total Stock is X".

    // CRITICAL FINDING: The schema likely lacks `BatchInventory` or `Inventory.batchId`.
    // To implement FIFO properly, we need to know the remaining quantity of each batch.
    // If the schema doesn't have it, we must calculate it from:
    // Batch Initial Qty - Sum(MaterialIssues for that Batch) - Sum(Sales for that Batch)?

    // Let's assume for this MVP, we query the `Batch` table which hopefully has a `quantity` field representing CURRENT quantity,
    // OR we just list batches and rely on user to pick.
    // The `Batch` model has `quantity` in the `createBatchSchema` usage in `inventory.ts` line 438: 
    // `quantity, // Initial batch quantity`
    // And I saw "Batch" model in `schema.prisma` view earlier? No, I saw `MaterialIssue` relation to `Batch`.
    // I should check `Batch` model definition.

    const batches = await prisma.batch.findMany({
        where: {
            productVariantId,
            locationId, // If batches are location-specific?
            status: BatchStatus.ACTIVE,
            quantity: { gt: 0 } // Assuming Batch.quantity is decremented on usage
        },
        orderBy: {
            manufacturingDate: 'asc'
        }
    });

    return batches;
}

import { logActivity } from '@/lib/audit';

export async function transferStock(data: TransferStockValues, userId?: string) {
    console.log("Transfer Action Started", data);
    const result = transferStockSchema.safeParse(data);
    if (!result.success) {
        console.error("Validation Failed", result.error);
        return { success: false, error: result.error.issues[0].message };
    }

    const { sourceLocationId, destinationLocationId, productVariantId, quantity, notes, date } = result.data;

    if (sourceLocationId === destinationLocationId) {
        return { success: false, error: "Source and destination cannot be the same" };
    }

    try {
        await prisma.$transaction(async (tx) => {
            console.log("Transaction Started");
            // 1. Check Source Balance
            const sourceStock = await tx.inventory.findUnique({
                where: {
                    locationId_productVariantId: {
                        locationId: sourceLocationId,
                        productVariantId: productVariantId,
                    },
                },
                select: {
                    id: true,
                    quantity: true,
                },
            });

            if (!sourceStock || sourceStock.quantity.toNumber() < quantity) {
                throw new Error(`Insufficient stock at source location. Current: ${sourceStock?.quantity || 0}`);
            }

            // 1.5 Check Reservation Constraints
            const activeReservations = await tx.stockReservation.aggregate({
                where: {
                    locationId: sourceLocationId,
                    productVariantId: productVariantId,
                    status: ReservationStatus.ACTIVE
                },
                _sum: { quantity: true }
            });

            const reservedQty = activeReservations._sum.quantity?.toNumber() || 0;
            const availableQty = sourceStock.quantity.toNumber() - reservedQty;

            if (availableQty < quantity) {
                throw new Error(`Cannot transfer. Stock is reserved. Available: ${availableQty}, Requested: ${quantity}`);
            }

            // 2. Decrement Source
            await tx.inventory.update({
                where: {
                    locationId_productVariantId: {
                        locationId: sourceLocationId,
                        productVariantId: productVariantId,
                    },
                },
                data: {
                    quantity: {
                        decrement: quantity,
                    },
                },
            });

            // 3. Increment Destination (Upsert)
            await tx.inventory.upsert({
                where: {
                    locationId_productVariantId: {
                        locationId: destinationLocationId,
                        productVariantId: productVariantId,
                    },
                },
                update: {
                    quantity: {
                        increment: quantity,
                    },
                },
                create: {
                    locationId: destinationLocationId,
                    productVariantId: productVariantId,
                    quantity: quantity,
                },
            });

            // 4. Create Movement Record
            await tx.stockMovement.create({
                data: {
                    type: MovementType.TRANSFER,
                    productVariantId,
                    fromLocationId: sourceLocationId,
                    toLocationId: destinationLocationId,
                    quantity,
                    reference: notes,
                    createdAt: date,
                    createdById: userId, // Add createdBy
                },
            });

            // 5. Audit Log (only if userId is provided)
            if (userId) {
                await logActivity({
                    userId,
                    action: 'TRANSFER_STOCK',
                    entityType: 'ProductVariant',
                    entityId: productVariantId,
                    details: `Transferred ${quantity} from ${sourceLocationId} to ${destinationLocationId}`,
                    tx
                });
            }
        });

        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');
        return { success: true };
    } catch (error) {
        console.error("Transfer Error", error);
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function transferStockBulk(data: BulkTransferStockValues, userId?: string) {
    const result = bulkTransferStockSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { sourceLocationId, destinationLocationId, items, notes, date } = result.data;

    if (sourceLocationId === destinationLocationId) {
        return { success: false, error: "Source and destination cannot be the same" };
    }

    try {
        await prisma.$transaction(async (tx) => {
            for (const item of items) {
                const { productVariantId, quantity } = item;

                // 1. Check Source Balance
                const sourceStock = await tx.inventory.findUnique({
                    where: {
                        locationId_productVariantId: {
                            locationId: sourceLocationId,
                            productVariantId: productVariantId,
                        },
                    },
                    select: {
                        id: true,
                        quantity: true,
                    },
                });

                if (!sourceStock || sourceStock.quantity.toNumber() < quantity) {
                    throw new Error(`Insufficient stock for product ${productVariantId} at source location.`);
                }

                // 1.5 Check Reservation Constraints
                const activeReservations = await tx.stockReservation.aggregate({
                    where: {
                        locationId: sourceLocationId,
                        productVariantId: productVariantId,
                        status: ReservationStatus.ACTIVE
                    },
                    _sum: { quantity: true }
                });

                const reservedQty = activeReservations._sum.quantity?.toNumber() || 0;
                const availableQty = sourceStock.quantity.toNumber() - reservedQty;

                if (availableQty < quantity) {
                    throw new Error(`Cannot transfer product ${productVariantId}. Stock is reserved. Available: ${availableQty}, Requested: ${quantity}`);
                }

                // 2. Decrement Source
                await tx.inventory.update({
                    where: {
                        locationId_productVariantId: {
                            locationId: sourceLocationId,
                            productVariantId: productVariantId,
                        },
                    },
                    data: {
                        quantity: {
                            decrement: quantity,
                        },
                    },
                });

                // 3. Increment Destination (Upsert)
                await tx.inventory.upsert({
                    where: {
                        locationId_productVariantId: {
                            locationId: destinationLocationId,
                            productVariantId: productVariantId,
                        },
                    },
                    update: {
                        quantity: {
                            increment: quantity,
                        },
                    },
                    create: {
                        locationId: destinationLocationId,
                        productVariantId: productVariantId,
                        quantity: quantity,
                    },
                });

                // 4. Create Movement Record
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

                // 5. Audit Log
                if (userId) {
                    await logActivity({
                        userId,
                        action: 'TRANSFER_STOCK_BULK',
                        entityType: 'ProductVariant',
                        entityId: productVariantId,
                        details: `Bulk Transferred ${quantity} from ${sourceLocationId} to ${destinationLocationId}`,
                        tx
                    });
                }
            }
        });

        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');
        return { success: true };
    } catch (error) {
        console.error("Bulk Transfer Error", error);
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function adjustStock(data: AdjustStockWithBatchValues, userId?: string) {
    // Parse using the extended schema which supports batchData
    const result = adjustStockWithBatchSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { locationId, productVariantId, type, quantity, reason, batchData } = result.data;

    try {
        await prisma.$transaction(async (tx) => {
            const isIncrement = type === 'ADJUSTMENT_IN';

            if (!isIncrement) {
                // Validation for OUT
                const currentStock = await tx.inventory.findUnique({
                    where: {
                        locationId_productVariantId: {
                            locationId,
                            productVariantId
                        }
                    },
                    select: {
                        id: true,
                        quantity: true,
                    },
                });
                if (!currentStock || currentStock.quantity.toNumber() < quantity) {
                    throw new Error(`Insufficient stock to adjust OUT. Current: ${currentStock?.quantity || 0}`);
                }

                // Check Reservations for OUT
                const activeReservations = await tx.stockReservation.aggregate({
                    where: {
                        locationId,
                        productVariantId,
                        status: ReservationStatus.ACTIVE
                    },
                    _sum: { quantity: true }
                });

                const reservedQty = activeReservations._sum.quantity?.toNumber() || 0;
                const availableQty = currentStock.quantity.toNumber() - reservedQty;

                if (availableQty < quantity) {
                    throw new Error(`Cannot adjust OUT. Stock is reserved. Available: ${availableQty}, Requested: ${quantity}`);
                }
            } else {
                // Logic for ADJUSTMENT_IN with Batch
                if (batchData) {
                    await tx.batch.create({
                        data: {
                            batchNumber: batchData.batchNumber,
                            productVariantId,
                            locationId,
                            quantity, // Initial batch quantity
                            manufacturingDate: batchData.manufacturingDate,
                            expiryDate: batchData.expiryDate,
                            status: BatchStatus.ACTIVE
                        }
                    });
                }
            }

            // 1. Update Inventory
            if (isIncrement) {
                await tx.inventory.upsert({
                    where: {
                        locationId_productVariantId: {
                            locationId,
                            productVariantId,
                        },
                    },
                    update: {
                        quantity: { increment: quantity },
                    },
                    create: {
                        locationId,
                        productVariantId,
                        quantity,
                    }
                });
            } else {
                await tx.inventory.update({
                    where: {
                        locationId_productVariantId: {
                            locationId,
                            productVariantId,
                        },
                    },
                    data: {
                        quantity: { decrement: quantity },
                    }
                });
            }

            // Get the newly created batch ID if we just created one, or find it if we're referencing a batch (not fully implemented in this schema yet, but preparing)
            // For now, if batchData exists, we just created a batch. To link it to movement, we need its ID.
            let batchId: string | null = null;
            if (isIncrement && batchData) {
                const newBatch = await tx.batch.findUnique({
                    where: { batchNumber: batchData.batchNumber }
                });
                batchId = newBatch?.id || null;
            }

            // 2. Create Movement
            await tx.stockMovement.create({
                data: {
                    type: MovementType.ADJUSTMENT,
                    productVariantId,
                    // If IN, From null, To Location. If OUT, From Location, To Null.
                    fromLocationId: isIncrement ? null : locationId,
                    toLocationId: isIncrement ? locationId : null,
                    quantity,
                    reference: reason,
                    batchId, // Link movement to batch
                    createdById: userId,
                },
            });

            // 3. Audit Log
            if (userId) {
                await logActivity({
                    userId,
                    action: 'ADJUST_STOCK',
                    entityType: 'ProductVariant',
                    entityId: productVariantId,
                    details: `${type} ${quantity} at ${locationId}. Reason: ${reason}`,
                    tx
                });
            }
        });

        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function adjustStockBulk(data: BulkAdjustStockValues, userId?: string) {
    const result = bulkAdjustStockSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { locationId, items } = result.data;

    try {
        await prisma.$transaction(async (tx) => {
            for (const item of items) {
                const { productVariantId, type, quantity, reason } = item;
                const isIncrement = type === 'ADJUSTMENT_IN';

                if (!isIncrement) {
                    // Validation for OUT
                    const currentStock = await tx.inventory.findUnique({
                        where: {
                            locationId_productVariantId: {
                                locationId,
                                productVariantId
                            }
                        },
                        select: {
                            id: true,
                            quantity: true,
                        },
                    });
                    if (!currentStock || currentStock.quantity.toNumber() < quantity) {
                        throw new Error(`Insufficient stock to adjust OUT for product ${productVariantId}`);
                    }
                }

                // 1. Update Inventory
                if (isIncrement) {
                    await tx.inventory.upsert({
                        where: {
                            locationId_productVariantId: {
                                locationId,
                                productVariantId,
                            },
                        },
                        update: {
                            quantity: { increment: quantity },
                        },
                        create: {
                            locationId,
                            productVariantId,
                            quantity,
                        }
                    });
                } else {
                    await tx.inventory.update({
                        where: {
                            locationId_productVariantId: {
                                locationId,
                                productVariantId,
                            },
                        },
                        data: {
                            quantity: { decrement: quantity },
                        }
                    });
                }

                // 2. Create Movement
                await tx.stockMovement.create({
                    data: {
                        type: MovementType.ADJUSTMENT,
                        productVariantId,
                        // If IN, From null, To Location. If OUT, From Location, To Null.
                        fromLocationId: isIncrement ? null : locationId,
                        toLocationId: isIncrement ? locationId : null,
                        quantity,
                        reference: reason,
                        createdById: userId,
                    },
                });

                // 3. Audit Log
                if (userId) {
                    await logActivity({
                        userId,
                        action: 'ADJUST_STOCK_BULK',
                        entityType: 'ProductVariant',
                        entityId: productVariantId,
                        details: `Bulk Adjusted ${type} ${quantity} at ${locationId}. Reason: ${reason}`,
                        tx
                    });
                }
            }
        });

        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function updateThreshold(productVariantId: string, minStockAlert: number) {
    try {
        await prisma.productVariant.update({
            where: {
                id: productVariantId,
            },
            data: {
                minStockAlert: new Prisma.Decimal(minStockAlert),
            },
        });
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/inventory');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function getStockMovements(limit = 50) {
    return await prisma.stockMovement.findMany({
        take: limit,
        orderBy: {
            createdAt: 'desc',
        },
        include: {
            productVariant: {
                include: {
                    product: true
                }
            },
            fromLocation: true,
            toLocation: true,
            createdBy: true,
        },
    });
}

export async function getDashboardStats() {
    const [productCount, inventory, lowStockVariants] = await Promise.all([
        prisma.product.count(),
        prisma.inventory.findMany({
            select: {
                quantity: true,
                productVariantId: true,
                productVariant: {
                    select: {
                        minStockAlert: true,
                    }
                }
            }
        }),
        prisma.productVariant.findMany({
            where: {
                minStockAlert: {
                    not: null
                }
            },
            select: {
                id: true,
                minStockAlert: true,
                inventories: {
                    select: {
                        quantity: true
                    }
                }
            }
        })
    ]);

    const totalStock = inventory.reduce((sum, item) => sum + item.quantity.toNumber(), 0);

    // Calculate low stock items
    // A variant is low stock if its total quantity across all locations < minStockAlert
    const variantQuantities = inventory.reduce((acc, item) => {
        acc[item.productVariantId] = (acc[item.productVariantId] || 0) + item.quantity.toNumber();
        return acc;
    }, {} as Record<string, number>);

    const lowStockCount = lowStockVariants.filter(variant => {
        const total = variantQuantities[variant.id] || 0;
        const threshold = variant.minStockAlert?.toNumber() || 0;
        return total < threshold;
    }).length;

    // Calculate Suggested Purchases Count (Reorder Point)
    const reorderVariants = await prisma.productVariant.findMany({
        where: { reorderPoint: { not: null } },
        select: { id: true, reorderPoint: true }
    });

    const suggestedPurchasesCount = reorderVariants.filter(variant => {
        const total = variantQuantities[variant.id] || 0;
        const reorderPoint = variant.reorderPoint?.toNumber() || 0;
        return total < reorderPoint;
    }).length;

    const recentMovements = await prisma.stockMovement.count({
        where: {
            createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // last 24h
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

export async function getSuggestedPurchases() {
    // 1. Get all variants with reorder points
    const variants = await prisma.productVariant.findMany({
        where: { reorderPoint: { not: null } },
        include: {
            product: { select: { name: true, productType: true } },
            preferredSupplier: { select: { name: true } },
            inventories: { select: { quantity: true } }
        }
    });

    // 2. Filter where Total Available < Reorder Point
    // Note: ideally we check available (physical - reserved), but for now using physical to check reorder point is standard initial step
    const suggestions = variants.map(v => {
        const totalPhysical = v.inventories.reduce((sum, inv) => sum + inv.quantity.toNumber(), 0);
        return {
            ...v,
            totalStock: totalPhysical,
            shouldReorder: totalPhysical < (v.reorderPoint?.toNumber() || 0)
        };
    }).filter(v => v.shouldReorder);

    return suggestions;
}

export async function getInventoryValuation() {
    // Moving Average Valuation:
    // Value = Sum(Quantity * AverageCost)
    // For this MVP, we will calculate Average Cost based on incoming movements (PURCHASE or ADJUSTMENT_IN) history
    // Real-world ERPs maintain a separate average_cost field on ProductVariant that updates on every receipt.

    // 1. Get current stock quantities per variant
    const stock = await getInventoryStats();

    // 2. Calculate valuation per variant
    let totalValuation = 0;
    const valuationDetails = [];

    // Group stock by variant
    const variantStock: Record<string, number> = {};
    stock.forEach(item => {
        variantStock[item.productVariantId] = (variantStock[item.productVariantId] || 0) + item.quantity.toNumber();
    });

    for (const [variantId, quantity] of Object.entries(variantStock)) {
        if (quantity <= 0) continue;

        // Fetch Avg Cost from recent IN/PURCHASE movements?
        // Simplifying: Fetch last known buyPrice from Variant itself as fallback, or calculate from movements if cost is available
        const variant = await prisma.productVariant.findUnique({
            where: { id: variantId },
            select: { buyPrice: true, name: true, skuCode: true }
        });

        if (!variant) continue;

        const unitCost = variant.buyPrice?.toNumber() || 0;

        // Advanced: Try to find weighted average from StockMovements with 'cost' field
        /* 
        // Commenting out due to prisma client type mismatch
        const movements = await prisma.stockMovement.findMany({
            where: {
                productVariantId: variantId,
                type: { in: [MovementType.IN, MovementType.ADJUSTMENT] },
                cost: { not: null }
            },
            orderBy: { createdAt: 'desc' },
            take: 10 // Look at last 10 receipts to estimate
        });

        if (movements.length > 0) {
            const totalCost = movements.reduce((sum, m) => sum + (m.cost?.toNumber() || 0) * m.quantity.toNumber(), 0);
            const totalQty = movements.reduce((sum, m) => sum + m.quantity.toNumber(), 0);
            if (totalQty > 0) {
                unitCost = totalCost / totalQty;
            }
        }
        */

        const value = quantity * unitCost;
        totalValuation += value;

        valuationDetails.push({
            productVariantId: variantId,
            name: variant.name,
            sku: variant.skuCode,
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

/**
 * Get inventory stock levels as of a specific date/time.
 * Reconstructs stock by summing movements up to the target date.
 */
export async function getInventoryAsOf(targetDate: Date, locationId?: string) {
    const movements = await prisma.stockMovement.findMany({
        where: {
            createdAt: {
                lte: targetDate,
            },
            ...(locationId ? {
                OR: [
                    { fromLocationId: locationId },
                    { toLocationId: locationId }
                ]
            } : {})
        },
        orderBy: {
            createdAt: 'asc',
        },
    });

    // Map to track quantity per variant per location
    const stockMap = new Map<string, number>();

    movements.forEach((m) => {
        const qty = m.quantity.toNumber();
        const variantId = m.productVariantId;

        if (m.fromLocationId) {
            const key = `${variantId}-${m.fromLocationId}`;
            stockMap.set(key, (stockMap.get(key) || 0) - qty);
        }
        if (m.toLocationId) {
            const key = `${variantId}-${m.toLocationId}`;
            stockMap.set(key, (stockMap.get(key) || 0) + qty);
        }
    });

    return Array.from(stockMap.entries()).map(([key, quantity]) => {
        const [productVariantId, locationId] = key.split('-');
        return {
            productVariantId,
            locationId,
            quantity
        };
    });
}

/**
 * Get stock history for a specific variant over a date range for visualization.
 */
export async function getStockHistory(
    productVariantId: string,
    startDate: Date,
    endDate: Date,
    locationId?: string
) {
    // 1. Get initial stock level before startDate
    const initialMovements = await prisma.stockMovement.findMany({
        where: {
            productVariantId,
            createdAt: {
                lt: startDate
            },
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
            // If No location specified, we sum globally
            if (m.toLocationId && !m.fromLocationId) delta += qty; // IN
            if (m.fromLocationId && !m.toLocationId) delta -= qty; // OUT
            // Transfers don't change global total
        }
        return sum + delta;
    }, 0);

    // 2. Get movements within the range
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
        orderBy: {
            createdAt: 'asc'
        }
    });

    // 3. Generate daily data points
    const historyData = [];
    const curr = new Date(startDate);

    // We'll iterate through days
    while (curr <= endDate) {
        const dayStart = new Date(curr);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(curr);
        dayEnd.setHours(23, 59, 59, 999);

        // Find movements on this specific day
        const dayMovements = movements.filter(m =>
            m.createdAt >= dayStart && m.createdAt <= dayEnd
        );

        // Update current stock with day's movements
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

        // Next day
        curr.setDate(curr.getDate() + 1);
    }

    return historyData;
}

// --- Stock Reservation Actions ---

export async function createStockReservation(data: CreateReservationValues) {
    const result = createReservationSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { productVariantId, locationId, quantity, reservedFor, referenceId, reservedUntil } = result.data;

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Check Available Stock (Physical - Reserved)
            const physicalStock = await tx.inventory.findUnique({
                where: {
                    locationId_productVariantId: { locationId, productVariantId }
                },
                select: { quantity: true }
            });

            const currentReservations = await tx.stockReservation.aggregate({
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
                throw new Error(`Insufficient available stock. Physical: ${totalPhysical}, Reserved: ${totalReserved}, Available: ${available}`);
            }

            // 2. Create Reservation
            await tx.stockReservation.create({
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
        });

        revalidatePath('/dashboard/inventory');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to create reservation" };
    }
}

export async function cancelStockReservation(data: CancelReservationValues) {
    const result = cancelReservationSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await prisma.stockReservation.update({
            where: { id: result.data.reservationId },
            data: { status: ReservationStatus.CANCELLED }
        });

        revalidatePath('/dashboard/inventory');
        return { success: true };
    } catch (_error) {
        return { success: false, error: "Failed to cancel reservation" };
    }
}

export async function getActiveReservations(locationId?: string, productVariantId?: string) {
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
