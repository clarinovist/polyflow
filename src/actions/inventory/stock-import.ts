'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { InventoryMovementService } from '@/services/inventory/movement-service';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';

export interface ValidatedStockItem {
    productVariantId: string;
    locationId: string;
    quantity: number;
}

export const getStockImportLookups = withTenant(
async function getStockImportLookups() {
    return safeAction(async () => {
        await requireAuth();

        const [products, locations] = await Promise.all([
            prisma.productVariant.findMany({
                select: { id: true, skuCode: true }
            }),
            prisma.location.findMany({
                select: { id: true, name: true }
            })
        ]);

        return {
            products: products.map(p => ({ id: p.id, sku: p.skuCode })),
            locations: locations.map(l => ({ id: l.id, name: l.name }))
        };
    });
}
);

export const importInitialStock = withTenant(
async function importInitialStock(
    items: ValidatedStockItem[],
    reason: string = "Stock Import"
) {
    return safeAction(async () => {
        const session = await requireAuth();
        const userId = session.user.id;

        if (items.length === 0) {
            return { imported: 0 };
        }

        // Group by location because InventoryMovementService.adjustStockBulk takes one locationId per call
        const itemsByLocation = new Map<string, ValidatedStockItem[]>();
        for (const item of items) {
            const existing = itemsByLocation.get(item.locationId) || [];
            existing.push(item);
            itemsByLocation.set(item.locationId, existing);
        }

        try {
            let totalImported = 0;

            for (const [locationId, locationItems] of itemsByLocation) {
                const bulkData = {
                    locationId,
                    items: locationItems.map(item => ({
                        productVariantId: item.productVariantId,
                        type: 'ADJUSTMENT_IN' as const,
                        quantity: item.quantity,
                        reason: reason
                    }))
                };

                await InventoryMovementService.adjustStockBulk(bulkData, userId);
                totalImported += locationItems.length;
            }

            revalidatePath('/warehouse/inventory');
            revalidatePath('/warehouse/inventory/history');

            return { imported: totalImported };

        } catch (error) {
            logger.error('Failed to import stock', { error, module: 'StockImportActions' });
            throw new BusinessRuleError(error instanceof Error ? error.message : "Internal server error");
        }
    });
}
);
