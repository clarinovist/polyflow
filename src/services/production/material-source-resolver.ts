import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/core/prisma';
import {
    isInactiveLocation,
    resolveMaterialSourceLocationId,
    type LocationLike,
} from '@/lib/locations/resolve-location';

export interface MaterialSourceInput {
    productVariantId: string;
    productType?: string | null;
    requiredQty: number;
}

export interface MaterialSourceResolution {
    productVariantId: string;
    /** Warehouse this material should be drawn from */
    sourceLocationId: string;
    sourceLocationName: string;
    /** Stock available at the resolved source */
    stockAtSource: number;
    /** Stock across every eligible warehouse */
    totalStock: number;
    /** True only when no warehouse holds enough */
    isShortage: boolean;
}

/** Scrap never counts as available production stock. */
const EXCLUDED_PURPOSES = new Set(['SCRAP']);

function isEligible(loc: LocationLike & { locationPurpose?: string | null }) {
    if (isInactiveLocation(loc)) return false;
    return !EXCLUDED_PURPOSES.has(loc.locationPurpose || '');
}

/**
 * Resolve, per material, which warehouse it should come from and whether it is
 * genuinely short.
 *
 * A SPK routinely spans several warehouses — packaging supplies and WIP batches
 * are stored apart from raw materials. Checking one location for every material
 * reports stock that exists as missing, which is what made every packing order
 * open as WAITING_MATERIAL despite full shelves.
 *
 * Preference order per material:
 *   1. the caller's location, when it holds enough
 *   2. the warehouse implied by the product type, when it holds enough
 *   3. whichever eligible warehouse holds the most
 *   4. the type default, so the UI still names where the stock belongs
 */
export async function resolveMaterialSources(params: {
    materials: MaterialSourceInput[];
    fallbackLocationId?: string | null;
    client?: Prisma.TransactionClient;
}): Promise<MaterialSourceResolution[]> {
    const { materials, fallbackLocationId, client } = params;
    if (materials.length === 0) return [];

    const db = client ?? prisma;

    const locations = await db.location.findMany({
        select: {
            id: true,
            name: true,
            slug: true,
            locationPurpose: true,
        },
        orderBy: { name: 'asc' },
    });

    const eligibleIds = new Set(locations.filter(isEligible).map((l) => l.id));
    const nameById = new Map(locations.map((l) => [l.id, l.name]));

    const variantIds = materials.map((m) => m.productVariantId);
    const inventoryRows = await db.inventory.findMany({
        where: {
            productVariantId: { in: variantIds },
            quantity: { gt: 0 },
        },
        select: {
            productVariantId: true,
            locationId: true,
            quantity: true,
        },
    });

    const stockByVariant = new Map<
        string,
        { locationId: string; qty: number }[]
    >();
    for (const row of inventoryRows) {
        if (!eligibleIds.has(row.locationId)) continue;
        const list = stockByVariant.get(row.productVariantId) || [];
        list.push({
            locationId: row.locationId,
            qty: row.quantity.toNumber(),
        });
        stockByVariant.set(row.productVariantId, list);
    }

    return materials.map((material) => {
        const rows = stockByVariant.get(material.productVariantId) || [];
        const qtyAt = (locationId: string | null | undefined) =>
            (locationId &&
                rows.find((r) => r.locationId === locationId)?.qty) ||
            0;

        const typeDefaultId = resolveMaterialSourceLocationId(
            locations as LocationLike[],
            material.productType,
            fallbackLocationId,
        );

        const totalStock = rows.reduce((sum, r) => sum + r.qty, 0);
        const required = material.requiredQty;

        let sourceLocationId: string;
        if (fallbackLocationId && qtyAt(fallbackLocationId) >= required) {
            sourceLocationId = fallbackLocationId;
        } else if (typeDefaultId && qtyAt(typeDefaultId) >= required) {
            sourceLocationId = typeDefaultId;
        } else if (rows.length > 0) {
            sourceLocationId = rows.reduce((best, r) =>
                r.qty > best.qty ? r : best,
            ).locationId;
        } else {
            sourceLocationId = typeDefaultId || fallbackLocationId || '';
        }

        return {
            productVariantId: material.productVariantId,
            sourceLocationId,
            sourceLocationName: nameById.get(sourceLocationId) || '',
            stockAtSource: qtyAt(sourceLocationId),
            totalStock,
            isShortage: required > totalStock,
        };
    });
}
