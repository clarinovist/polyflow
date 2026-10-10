import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { sumInventoryAlertQuantity } from '@/lib/constants/locations';

const LOW_STOCK_DRIVER_LIMIT = 5;

type DecimalLike = { toNumber(): number };
type WarehouseInventoryThresholdDb = Pick<PrismaClient, 'productVariant'>;

type WarehouseThresholdVariant = {
    id: string;
    name: string;
    skuCode: string;
    primaryUnit: string;
    minStockAlert: DecimalLike | number | string | null;
    reorderPoint: DecimalLike | number | string | null;
    inventories: Array<{
        quantity: DecimalLike | number | string;
        location: {
            locationType: string;
            locationPurpose: string;
        } | null;
    }>;
};

export interface WarehouseLowStockDriver {
    id: string;
    name: string;
    skuCode: string;
    unit: string;
    eligibleQuantity: number;
    threshold: number;
    shortageRatio: number;
}

export interface WarehouseInventoryThresholdSnapshot {
    lowStockCount: number;
    reorderCount: number;
    lowStockDrivers: WarehouseLowStockDriver[];
}

function toFiniteNumber(value: unknown): number {
    if (
        value &&
        typeof value === 'object' &&
        'toNumber' in value &&
        typeof (value as { toNumber?: unknown }).toNumber === 'function'
    ) {
        const converted = (value as DecimalLike).toNumber();
        return Number.isFinite(converted) ? converted : 0;
    }

    const converted = Number(value ?? 0);
    return Number.isFinite(converted) ? converted : 0;
}

/**
 * One inventory-owned read feeds both canonical threshold counts and drivers.
 * Quantities only include INTERNAL RAW_MATERIAL / FINISHED_GOOD locations via
 * the shared alert-scope helper; unlike units are never aggregated together.
 */
export async function readWarehouseInventoryThresholdSnapshot(
    db: WarehouseInventoryThresholdDb = prisma,
): Promise<WarehouseInventoryThresholdSnapshot> {
    const variants = (await db.productVariant.findMany({
        where: {
            archivedAt: null,
            OR: [{ minStockAlert: { gt: 0 } }, { reorderPoint: { gt: 0 } }],
        },
        select: {
            id: true,
            name: true,
            skuCode: true,
            primaryUnit: true,
            minStockAlert: true,
            reorderPoint: true,
            inventories: {
                select: {
                    quantity: true,
                    location: {
                        select: {
                            locationType: true,
                            locationPurpose: true,
                        },
                    },
                },
            },
        },
    })) as WarehouseThresholdVariant[];

    let lowStockCount = 0;
    let reorderCount = 0;
    const lowStockDrivers: WarehouseLowStockDriver[] = [];

    for (const variant of variants) {
        const eligibleQuantity = sumInventoryAlertQuantity(variant.inventories);
        const lowStockThreshold = toFiniteNumber(variant.minStockAlert);
        const reorderThreshold = toFiniteNumber(variant.reorderPoint);

        if (lowStockThreshold > 0 && eligibleQuantity < lowStockThreshold) {
            lowStockCount += 1;
            lowStockDrivers.push({
                id: variant.id,
                name: variant.name,
                skuCode: variant.skuCode,
                unit: variant.primaryUnit,
                eligibleQuantity,
                threshold: lowStockThreshold,
                shortageRatio:
                    (lowStockThreshold - eligibleQuantity) / lowStockThreshold,
            });
        }

        if (reorderThreshold > 0 && eligibleQuantity < reorderThreshold) {
            reorderCount += 1;
        }
    }

    lowStockDrivers.sort((left, right) => {
        const severityDifference = right.shortageRatio - left.shortageRatio;
        if (severityDifference !== 0) return severityDifference;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });

    return {
        lowStockCount,
        reorderCount,
        lowStockDrivers: lowStockDrivers.slice(0, LOW_STOCK_DRIVER_LIMIT),
    };
}
