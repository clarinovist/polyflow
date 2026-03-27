import { prisma } from '@/lib/core/prisma';
import { Prisma, ReservationStatus, NotificationType } from '@prisma/client';
import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';

export class InventoryCoreService {
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

    static async updateThreshold(productVariantId: string, minStockAlert: number) {
        await prisma.productVariant.update({
            where: { id: productVariantId },
            data: { minStockAlert: new Prisma.Decimal(minStockAlert) },
        });
    }

    /**
     * Verify thresholds and trigger notifications for LOW STOCK.
     * Can be hooked into daily maintenance schedules.
     */
    static async checkLowStockTriggers() {
        const { NotificationService } = await import('@/services/core/notification-service');
        const lowStockVariants = await prisma.productVariant.findMany({
            where: { minStockAlert: { not: null } },
            select: {
                id: true,
                minStockAlert: true,
                name: true,
                inventories: {
                    include: {
                        location: { select: { slug: true } }
                    }
                }
            }
        });

        // Only consider Raw Material and Finished Goods
        const allowedLocationSlugs = new Set<string>([WAREHOUSE_SLUGS.RAW_MATERIAL, WAREHOUSE_SLUGS.FINISHING]);
        
        for(const variant of lowStockVariants) {
            let totalForAlert = 0;
            for(const inv of variant.inventories) {
                if(inv.location?.slug && allowedLocationSlugs.has(inv.location.slug)) {
                    totalForAlert += inv.quantity.toNumber();
                }
            }

            const threshold = variant.minStockAlert?.toNumber() || 0;
            if(totalForAlert > 0 && totalForAlert < threshold) {
                // Find users that should be notified about inventory
                const targetUsers = await prisma.user.findMany({
                    where: { role: 'ADMIN' },
                    select: { id: true }
                });

                if(targetUsers.length > 0) {
                    const inputs = targetUsers.map(u => ({
                        userId: u.id,
                        type: 'LOW_STOCK' as NotificationType,
                        title: 'Low Stock Alert',
                        message: `Product "${variant.name}" has fallen below threshold (${threshold}). Current stock: ${totalForAlert}.`,
                        link: `/admin/inventory?variantId=${variant.id}`,
                        entityType: 'ProductVariant',
                        entityId: variant.id
                    }));
                    await NotificationService.createBulkNotifications(inputs);
                }
            }
        }
    }
}
