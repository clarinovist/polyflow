import { Prisma } from '@prisma/client';

import { MAKLON_STAGE_SLUGS, WAREHOUSE_SLUGS } from '@/lib/constants/locations';

import type { BackflushOrder } from './execution-types';

async function resolveLocationIdBySlug(
    tx: Prisma.TransactionClient,
    slug: string,
): Promise<string | null> {
    const location = await tx.location.findUnique({
        where: { slug },
        select: { id: true },
    });

    return location?.id || null;
}

async function findFirstStockLocation(
    tx: Prisma.TransactionClient,
    productVariantId: string,
    locationSlugs: string[],
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
                    productVariantId,
                },
            },
            select: { quantity: true },
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
    productVariantId: string,
): Promise<string | null> {
    const category = order.bom?.category;

    const candidateSlugs =
        category === 'EXTRUSION'
            ? [
                  MAKLON_STAGE_SLUGS.WIP,
                  MAKLON_STAGE_SLUGS.RAW_MATERIAL,
                  WAREHOUSE_SLUGS.CUSTOMER_OWNED,
              ]
            : category === 'PACKING' || category === 'REWORK'
              ? [
                    MAKLON_STAGE_SLUGS.FINISHED_GOOD,
                    MAKLON_STAGE_SLUGS.WIP,
                    MAKLON_STAGE_SLUGS.RAW_MATERIAL,
                    WAREHOUSE_SLUGS.CUSTOMER_OWNED,
                ]
              : [
                    MAKLON_STAGE_SLUGS.RAW_MATERIAL,
                    WAREHOUSE_SLUGS.CUSTOMER_OWNED,
                ];

    const locationId = await findFirstStockLocation(
        tx,
        productVariantId,
        candidateSlugs,
    );
    if (locationId) {
        return locationId;
    }

    const orderLocationInventory = await tx.inventory.findUnique({
        where: {
            locationId_productVariantId: {
                locationId: order.locationId,
                productVariantId,
            },
        },
        select: { quantity: true },
    });

    if (
        orderLocationInventory &&
        orderLocationInventory.quantity.toNumber() > 0
    ) {
        return order.locationId;
    }

    const customerOwnedLocation = await tx.inventory.findFirst({
        where: {
            productVariantId,
            location: { locationType: 'CUSTOMER_OWNED' },
        },
        select: { locationId: true, quantity: true },
    });

    if (
        customerOwnedLocation &&
        customerOwnedLocation.quantity.toNumber() > 0
    ) {
        return customerOwnedLocation.locationId;
    }

    return null;
}

export async function resolveMaterialLocation(
    tx: Prisma.TransactionClient,
    order: BackflushOrder & { materialSourceLocationId?: string | null; routeStepId?: string | null },
    productVariantId: string,
): Promise<string> {
    // ── Phase 5: routed orders use persisted source location first ──
    if (order.materialSourceLocationId) {
        // Verify stock at persisted location — if has stock, use it
        const persistedInv = await tx.inventory.findUnique({
            where: {
                locationId_productVariantId: {
                    locationId: order.materialSourceLocationId,
                    productVariantId,
                },
            },
            select: { quantity: true },
        });
        if (persistedInv && persistedInv.quantity.toNumber() > 0) {
            return order.materialSourceLocationId;
        }
        // Even if no stock, still prefer persisted if explicitly set (WIP handoff expected)
        // but fall through to legacy resolver only if zero stock + not first step ambiguity
        // For first step or explicit WIP handoff, use persisted anyway
        const routeStep = order.routeStepId
            ? await tx.productionRouteStep.findUnique({ where: { id: order.routeStepId }, select: { sequence: true } })
            : null;
        if (routeStep?.sequence === 0 || !routeStep) {
            // First step or no routeStep record — still check persisted, but allow fallback below if empty
        } else {
            // Non-first routed step: if persisted set but empty, it's a real WIP miss — still return persisted
            // so inventory error surfaces correctly rather than silently consuming wrong location
            return order.materialSourceLocationId;
        }
    }

    if (order.isMaklon) {
        const maklonLocation = await resolveMaklonMaterialLocation(
            tx,
            order,
            productVariantId,
        );
        if (maklonLocation) {
            return maklonLocation;
        }

        return order.locationId;
    }

    if (
        order.bom?.category === 'EXTRUSION' ||
        order.bom?.category === 'MIXING'
    ) {
        const mixingLoc =
            (await tx.location.findUnique({
                where: { slug: WAREHOUSE_SLUGS.MIXING },
            })) ||
            (await tx.location.findUnique({
                where: { slug: 'gudang-wip-intermediate' },
            }));
        if (mixingLoc) {
            return mixingLoc.id;
        }
    } else if (order.bom?.category === 'PACKING') {
        const orderLocStock = await tx.inventory.findUnique({
            where: {
                locationId_productVariantId: {
                    locationId: order.locationId,
                    productVariantId,
                },
            },
            select: { quantity: true },
        });
        if (orderLocStock && orderLocStock.quantity.toNumber() > 0) {
            return order.locationId;
        }

        // Kiyowo: packing_area / fg_warehouse / rm_warehouse
        // Melindo: gudang-packaging (supplies), gudang-barang-jadi (FG), gudang-bahan-baku
        const candidateLocationId = await findFirstStockLocation(
            tx,
            productVariantId,
            [
                WAREHOUSE_SLUGS.FINISHING,
                'gudang-barang-jadi',
                WAREHOUSE_SLUGS.PACKING_AREA,
                'gudang-packaging',
                WAREHOUSE_SLUGS.RAW_MATERIAL,
                'gudang-bahan-baku',
                WAREHOUSE_SLUGS.WIP_STORAGE,
                'gudang-wip-intermediate',
            ],
        );
        if (candidateLocationId) {
            return candidateLocationId;
        }

        const fgLoc =
            (await tx.location.findUnique({
                where: { slug: WAREHOUSE_SLUGS.FINISHING },
            })) ||
            (await tx.location.findUnique({
                where: { slug: 'gudang-barang-jadi' },
            }));
        if (fgLoc) {
            return fgLoc.id;
        }
    } else if (order.bom?.category === 'REWORK') {
        const orderLocStock = await tx.inventory.findUnique({
            where: {
                locationId_productVariantId: {
                    locationId: order.locationId,
                    productVariantId,
                },
            },
            select: { quantity: true },
        });
        if (orderLocStock && orderLocStock.quantity.toNumber() > 0) {
            return order.locationId;
        }

        const fgLoc =
            (await tx.location.findUnique({
                where: { slug: WAREHOUSE_SLUGS.FINISHING },
            })) ||
            (await tx.location.findUnique({
                where: { slug: 'gudang-barang-jadi' },
            }));
        if (fgLoc) {
            return fgLoc.id;
        }
    }

    const orderLocationInventory = await tx.inventory.findUnique({
        where: {
            locationId_productVariantId: {
                locationId: order.locationId,
                productVariantId,
            },
        },
        select: { quantity: true },
    });

    if (
        orderLocationInventory &&
        orderLocationInventory.quantity.toNumber() > 0
    ) {
        return order.locationId;
    }

    if (order.isMaklon) {
        const customerInventory = await tx.inventory.findFirst({
            where: {
                productVariantId,
                location: { locationType: 'CUSTOMER_OWNED' },
            },
            select: { locationId: true, quantity: true },
        });

        if (customerInventory && customerInventory.quantity.toNumber() > 0) {
            return customerInventory.locationId;
        }
    }

    return order.materialSourceLocationId ?? order.locationId;
}
