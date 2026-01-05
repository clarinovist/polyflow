'use server';

import { prisma } from '@/lib/prisma';
import { adjustStockSchema, AdjustStockValues, transferStockSchema, TransferStockValues } from '@/lib/zod-schemas';
import { MovementType, Prisma, Unit, ProductType } from '@prisma/client';
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
};

export async function getInventoryStats(searchParams?: { locationId?: string; type?: string }) {
    const where: Prisma.InventoryWhereInput = {};

    if (searchParams?.locationId) {
        where.locationId = searchParams.locationId;
    }

    if (searchParams?.type) {
        where.productVariant = {
            product: {
                productType: searchParams.type as any,
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

    return inventory as unknown as InventoryWithRelations[];
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

export async function transferStock(data: TransferStockValues) {
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
            console.log("Source Stock:", sourceStock);

            if (!sourceStock || sourceStock.quantity.toNumber() < quantity) {
                throw new Error(`Insufficient stock at source location. Current: ${sourceStock?.quantity || 0}`);
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
            console.log("Source Decremented");

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
            console.log("Dest Incremented");

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
                },
            });
            console.log("Movement Created");
        });

        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');
        return { success: true };
    } catch (error: any) {
        console.error("Transfer Error", error);
        return { success: false, error: error.message };
    }
}

export async function adjustStock(data: AdjustStockValues) {
    const result = adjustStockSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { locationId, productVariantId, type, quantity, reason } = result.data;

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
                },
            });
        });

        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
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
    } catch (error: any) {
        return { success: false, error: error.message };
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
        recentMovements
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
