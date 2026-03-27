import { prisma } from '@/lib/core/prisma';
import { Prisma, BatchStatus, ProductType, ReservationStatus } from '@prisma/client';
import { InventoryWithRelations } from '@/types/inventory';
import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';

export class InventoryQueryService {
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
                averageCost: true,
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
                status: { in: [ReservationStatus.ACTIVE, ReservationStatus.WAITING] }
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
            const status = r.status as string;
            if (status === ReservationStatus.ACTIVE) {
                activeReservationMap.set(key, qty);
            } else if (status === ReservationStatus.WAITING) {
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

    static async getStockMovements(filters?: { limit?: number; startDate?: Date; endDate?: Date }) {
        const { limit = 50, startDate, endDate } = filters || {};
        const where: Prisma.StockMovementWhereInput = {};

        if (startDate && endDate) {
            where.createdAt = {
                gte: startDate,
                lte: endDate
            };
        } else if (startDate) {
            where.createdAt = { gte: startDate };
        } else if (endDate) {
            where.createdAt = { lte: endDate };
        }

        return await prisma.stockMovement.findMany({
            where,
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
}
