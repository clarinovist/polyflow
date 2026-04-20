import { Prisma } from '@prisma/client';

import { MAKLON_STAGE_SLUGS, WAREHOUSE_SLUGS } from '@/lib/constants/locations';

import type { BackflushOrder } from './execution-types';

async function resolveLocationIdBySlug(tx: Prisma.TransactionClient, slug: string): Promise<string | null> {
    const location = await tx.location.findUnique({
        where: { slug },
        select: { id: true }
    });

    return location?.id || null;
}

async function findFirstStockLocation(
    tx: Prisma.TransactionClient,
    productVariantId: string,
    locationSlugs: string[]
): Promise<string | null> {
    for (const slug of locationSlugs) {
        const locationId = await resolveLocationIdBySlug(tx, slug);
        if (!locationId) {
            continue;
        }

        const inventory = await tx.inventory.findUnique({
            where: {
                locationId_productVariantId: {
                    locationId,
                    productVariantId
                }
            },
            select: { quantity: true }
        });

        if (inventory && inventory.quantity.toNumber() > 0) {
            return locationId;
        }
    }

    return null;
}

async function resolveMaklonMaterialLocation(
    tx: Prisma.TransactionClient,
    order: BackflushOrder,
    productVariantId: string
): Promise<string | null> {
    const category = order.bom?.category;

    const candidateSlugs =
        category === 'EXTRUSION'
            ? [
                MAKLON_STAGE_SLUGS.WIP,
                MAKLON_STAGE_SLUGS.RAW_MATERIAL,
                WAREHOUSE_SLUGS.CUSTOMER_OWNED
            ]
            : category === 'PACKING' || category === 'REWORK'
                ? [
                    MAKLON_STAGE_SLUGS.FINISHED_GOOD,
                    MAKLON_STAGE_SLUGS.WIP,
                    MAKLON_STAGE_SLUGS.RAW_MATERIAL,
                    WAREHOUSE_SLUGS.CUSTOMER_OWNED
                ]
                : [
                    MAKLON_STAGE_SLUGS.RAW_MATERIAL,
                    WAREHOUSE_SLUGS.CUSTOMER_OWNED
                ];

    const locationId = await findFirstStockLocation(tx, productVariantId, candidateSlugs);
    if (locationId) {
        return locationId;
    }

    const orderLocationInventory = await tx.inventory.findUnique({
        where: {
            locationId_productVariantId: {
                locationId: order.locationId,
                productVariantId
            }
        },
        select: { quantity: true }
    });

    if (orderLocationInventory && orderLocationInventory.quantity.toNumber() > 0) {
        return order.locationId;
    }

    const customerOwnedLocation = await tx.inventory.findFirst({
        where: {
            productVariantId,
            location: { locationType: 'CUSTOMER_OWNED' }
        },
        select: { locationId: true, quantity: true }
    });

    if (customerOwnedLocation && customerOwnedLocation.quantity.toNumber() > 0) {
        return customerOwnedLocation.locationId;
    }

    return null;
}

export async function resolveMaterialLocation(
    tx: Prisma.TransactionClient,
    order: BackflushOrder,
    productVariantId: string
): Promise<string> {
    if (order.isMaklon) {
        const maklonLocation = await resolveMaklonMaterialLocation(tx, order, productVariantId);
        if (maklonLocation) {
            return maklonLocation;
        }

        return order.locationId;
    }

    if (order.bom?.category === 'EXTRUSION' || order.bom?.category === 'MIXING') {
        const mixingLoc = await tx.location.findUnique({ where: { slug: WAREHOUSE_SLUGS.MIXING } });
        if (mixingLoc) {
            return mixingLoc.id;
        }
    } else if (order.bom?.category === 'PACKING' || order.bom?.category === 'REWORK') {
        const fgLoc = await tx.location.findUnique({ where: { slug: WAREHOUSE_SLUGS.FINISHING } });
        if (fgLoc) {
            return fgLoc.id;
        }
    }

    const orderLocationInventory = await tx.inventory.findUnique({
        where: {
            locationId_productVariantId: {
                locationId: order.locationId,
                productVariantId
            }
        },
        select: { quantity: true }
    });

    if (orderLocationInventory && orderLocationInventory.quantity.toNumber() > 0) {
        return order.locationId;
    }

    if (order.isMaklon) {
        const customerInventory = await tx.inventory.findFirst({
            where: {
                productVariantId,
                location: { locationType: 'CUSTOMER_OWNED' }
            },
            select: { locationId: true, quantity: true }
        });

        if (customerInventory && customerInventory.quantity.toNumber() > 0) {
            return customerInventory.locationId;
        }
    }

    return order.locationId;
}