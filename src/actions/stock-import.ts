'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-checks';
import { InventoryService } from '@/services/inventory-service';
import { revalidatePath } from 'next/cache';

export interface ValidatedStockItem {
    productVariantId: string;
    locationId: string;
    quantity: number;
}

export type ImportStockResult = {
    success: boolean;
    imported: number;
    errors?: string[];
}

/**
 * Get lookup data for client-side validation
 * Returns arrays that can be easily converted to Maps on the client
 */
export async function getStockImportLookups() {
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
}

/**
 * Execution of stock import
 * Groups items by location because adjustStockBulk requires locationId
 */
export async function importInitialStock(
    items: ValidatedStockItem[],
    reason: string = "Stock Import"
): Promise<ImportStockResult> {
    const session = await requireAuth();
    const userId = session.user.id;

    if (items.length === 0) {
        return { success: true, imported: 0 };
    }

    // Group by location because InventoryService.adjustStockBulk takes one locationId per call
    const itemsByLocation = new Map<string, ValidatedStockItem[]>();
    for (const item of items) {
        const existing = itemsByLocation.get(item.locationId) || [];
        existing.push(item);
        itemsByLocation.set(item.locationId, existing);
    }

    try {
        let totalImported = 0;

        // Process each location's batch
        // We can run these in parallel or sequence. Sequence is safer for DB I/O load.
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

            await InventoryService.adjustStockBulk(bulkData, userId);
            totalImported += locationItems.length;
        }

        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');

        return {
            success: true,
            imported: totalImported
        };

    } catch (error) {
        console.error("Stock Import Error:", error);
        return {
            success: false,
            imported: 0,
            errors: [error instanceof Error ? error.message : "Checking internal server error"]
        };
    }
}
