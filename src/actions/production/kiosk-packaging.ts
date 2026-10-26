'use server';

import { z } from 'zod';
import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, safeAction } from '@/lib/errors/errors';
import { resolveKioskActor } from '@/lib/auth/kiosk-actor';
import {
    PACKAGING_MATERIAL_TYPES,
    PACKAGING_STOCK_UNITS,
} from '@/lib/production/packaging-material';
import type {
    KioskPackagingBrand,
    KioskPackagingContext,
    KioskPackagingUsage,
} from '@/lib/production/kiosk-packaging';

const orderIdSchema = z.string().min(1).max(64);

const plannedItemSelect = {
    productVariantId: true,
    productVariant: { select: { product: { select: { productType: true } } } },
} as const;

/**
 * Packaging data for one SPK on the kiosk: brands with their labels, planned
 * packaging, usable stock and what this SPK already used. Stock cost is never
 * returned. Requires a signed-in user or a PIN-verified operator.
 */
export const getKioskPackagingContext = withTenant(
    async function getKioskPackagingContext(productionOrderId: string) {
        return safeAction(async (): Promise<KioskPackagingContext> => {
            const parsed = orderIdSchema.safeParse(productionOrderId);
            if (!parsed.success)
                throw new BusinessRuleError('SPK tidak valid.');
            await resolveKioskActor();

            const order = await prisma.productionOrder.findUniqueOrThrow({
                where: { id: parsed.data },
                select: {
                    actualPackagingEnabled: true,
                    requestedOutputVariantId: true,
                    actualQuantity: true,
                    bom: {
                        select: {
                            productVariantId: true,
                            productVariant: { select: { name: true } },
                            items: { select: plannedItemSelect },
                        },
                    },
                    plannedMaterials: { select: plannedItemSelect },
                },
            });
            const baseVariantId = order.bom.productVariantId;
            const planned = order.plannedMaterials.length
                ? order.plannedMaterials
                : order.bom.items;

            const [options, inventory, consumption] = await Promise.all([
                prisma.productionPackagingOption.findMany({
                    where: {
                        baseVariantId,
                        outputVariant: { archivedAt: null },
                    },
                    select: {
                        outputVariantId: true,
                        outputVariant: { select: { name: true } },
                        labelVariantId: true,
                        labelVariant: { select: { name: true } },
                    },
                    orderBy: { outputVariant: { name: 'asc' } },
                }),
                prisma.inventory.findMany({
                    where: {
                        quantity: { gt: 0 },
                        productVariant: {
                            archivedAt: null,
                            primaryUnit: { in: PACKAGING_STOCK_UNITS },
                            product: {
                                productType: { in: PACKAGING_MATERIAL_TYPES },
                            },
                        },
                        OR: [
                            { location: { locationType: 'INTERNAL' } },
                            {
                                location: {
                                    packagingOwnerCustomerId: { not: null },
                                },
                            },
                        ],
                    },
                    select: {
                        id: true,
                        productVariantId: true,
                        quantity: true,
                        productVariant: {
                            select: { name: true, primaryUnit: true },
                        },
                        location: {
                            select: {
                                id: true,
                                name: true,
                                packagingOwnerCustomerId: true,
                                packagingOwnerCustomer: {
                                    select: { name: true },
                                },
                            },
                        },
                    },
                    orderBy: [
                        { productVariantId: 'asc' },
                        { locationId: 'asc' },
                    ],
                }),
                prisma.productionPackagingConsumption.findMany({
                    where: {
                        execution: {
                            productionOrderId: parsed.data,
                            status: { not: 'VOIDED' },
                        },
                    },
                    select: {
                        productVariantId: true,
                        quantity: true,
                        unit: true,
                        productVariant: { select: { name: true } },
                        movement: { select: { fromLocationId: true } },
                    },
                    orderBy: { movement: { createdAt: 'desc' } },
                }),
            ]);

            const allBrands: KioskPackagingBrand[] = [
                {
                    id: baseVariantId,
                    name: order.bom.productVariant.name,
                    labelVariantId: null,
                    labelName: null,
                },
                ...options.map((option) => ({
                    id: option.outputVariantId,
                    name: option.outputVariant.name,
                    labelVariantId: option.labelVariantId,
                    labelName: option.labelVariant?.name ?? null,
                })),
            ];
            const fixedBrandId = order.requestedOutputVariantId;

            // Newest first, so the first row per material is its last source.
            const usage = new Map<string, KioskPackagingUsage>();
            for (const row of consumption) {
                const current = usage.get(row.productVariantId);
                usage.set(row.productVariantId, {
                    productVariantId: row.productVariantId,
                    name: row.productVariant.name,
                    unit: row.unit,
                    quantity: (current?.quantity ?? 0) + Number(row.quantity),
                    lastSourceLocationId:
                        current?.lastSourceLocationId ??
                        row.movement.fromLocationId,
                });
            }

            return {
                enabled: order.actualPackagingEnabled,
                baseVariantId,
                fixedBrandId,
                brands: fixedBrandId
                    ? allBrands.filter((brand) => brand.id === fixedBrandId)
                    : allBrands,
                plannedPackagingIds: planned
                    .filter(
                        (item) =>
                            item.productVariant.product.productType ===
                            'PACKAGING',
                    )
                    .map((item) => item.productVariantId),
                stock: inventory.map((row) => ({
                    id: row.id,
                    productVariantId: row.productVariantId,
                    name: row.productVariant.name,
                    unit: row.productVariant.primaryUnit,
                    locationId: row.location.id,
                    locationName: row.location.name,
                    ownerCustomerId: row.location.packagingOwnerCustomerId,
                    ownerName:
                        row.location.packagingOwnerCustomer?.name ?? null,
                    quantity: Number(row.quantity),
                })),
                usage: [...usage.values()],
                producedBaseQty: Number(order.actualQuantity ?? 0),
            };
        });
    },
);
