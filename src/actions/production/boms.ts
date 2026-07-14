'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { createBomSchema, CreateBomValues, duplicateBomSchema, DuplicateBomValues, archiveBomSchema } from '@/lib/schemas/production';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils/utils';
import { calculateBomCost } from '@/lib/utils/production-utils';
import { updateStandardCost } from '@/actions/finance/cost-history';
import { logger } from '@/lib/config/logger';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logActivity } from "@/lib/tools/audit";
import { safeAction, BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import {
    getCurrentUnitCost,
    getVariantCostDiagnostics,
    type VariantCostDiagnostics,
} from '@/lib/utils/current-cost';
import { BomCostCascadeService } from '@/services/production/bom-cost-cascade-service';
import { BomLifecycleService } from '@/services/production/bom-lifecycle-service';

/**
 * Unset other default BOMs on the same variant so only one is default.
 * Called inside a transaction; pass the transaction client `tx`.
 */
async function unsetOtherDefaultBoms(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    productVariantId: string,
    exceptBomId?: string
) {
    const where: Record<string, unknown> = {
        productVariantId,
        isDefault: true,
    };
    if (exceptBomId) {
        where.id = { not: exceptBomId };
    }
    await tx.bom.updateMany({
        where,
        data: { isDefault: false },
    });
}

function enrichVariantCurrentCost<T extends { inventories?: Array<{ quantity?: unknown; averageCost?: unknown }> } & Record<string, unknown>>(variant: T): T & {
    currentCost: number;
    costDiagnostics: VariantCostDiagnostics & { inventoryCount: number };
} {
    return {
        ...variant,
        currentCost: getCurrentUnitCost(variant),
        costDiagnostics: {
            ...getVariantCostDiagnostics(variant),
            inventoryCount: (variant.inventories || []).length,
        },
    };
}

function enrichBomCurrentCosts<T extends {
    productVariant: Record<string, unknown> & { inventories?: Array<{ quantity?: unknown; averageCost?: unknown }> };
    items: Array<{ productVariant: Record<string, unknown> & { inventories?: Array<{ quantity?: unknown; averageCost?: unknown }> } }>;
}>(bom: T): T {
    return {
        ...bom,
        productVariant: enrichVariantCurrentCost(bom.productVariant),
        items: bom.items.map((item) => ({
            ...item,
            productVariant: enrichVariantCurrentCost(item.productVariant),
        })),
    };
}

export const getBoms = withTenant(
async function getBoms(category?: string, status?: 'ACTIVE' | 'ARCHIVED' | 'ALL') {
    return safeAction(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {};
        if (category && category !== 'ALL') {
            where.category = category;
        }
        // Status filter (default: ACTIVE only)
        const effectiveStatus = status || 'ACTIVE';
        if (effectiveStatus === 'ACTIVE') {
            where.isActive = true;
        } else if (effectiveStatus === 'ARCHIVED') {
            where.isActive = false;
        }
        // ALL = no isActive filter

        const boms = await prisma.bom.findMany({
            where,
            include: {
                productVariant: {
                    include: {
                        product: true,
                        inventories: {
                            select: {
                                quantity: true,
                                averageCost: true,
                            }
                        }
                    }
                },
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true,
                                inventories: {
                                    select: {
                                        quantity: true,
                                        averageCost: true,
                                    }
                                }
                            }
                        }
                    }
                },
                _count: {
                    select: { ProductionOrder: true },
                }
            },
            orderBy: { updatedAt: 'desc' }
        });
        return serializeData(boms.map(enrichBomCurrentCosts));
    });
}
);

export const getProductVariants = withTenant(
async function getProductVariants() {
    return safeAction(async () => {
        const variants = await prisma.productVariant.findMany({
            include: {
                product: true,
                inventories: {
                    select: {
                        quantity: true,
                        averageCost: true,
                    }
                }
            },
            orderBy: { name: 'asc' }
        });
        return serializeData(variants.map(enrichVariantCurrentCost));
    });
}
);

export const createBom = withTenant(
async function createBom(data: CreateBomValues) {
    return safeAction(async () => {
        const session = await requireAuth();
        const validated = createBomSchema.parse(data);

        await BomCostCascadeService.validateNoBomCycle({
            outputVariantId: validated.productVariantId,
            itemVariantIds: validated.items.map((item) => item.productVariantId),
        });

        try {
            const bom = await prisma.$transaction(async (tx) => {
                // Unset other default BOMs on target variant (atomic with create)
                if (validated.isDefault) {
                    await unsetOtherDefaultBoms(tx, validated.productVariantId);
                }

                return tx.bom.create({
                    data: {
                        name: validated.name,
                        productVariant: { connect: { id: validated.productVariantId } },
                        outputQuantity: validated.outputQuantity,
                        isDefault: validated.isDefault,
                        category: validated.category,
                        items: {
                            create: validated.items.map(item => ({
                                productVariantId: item.productVariantId,
                                quantity: item.quantity,
                                scrapPercentage: item.scrapPercentage
                            }))
                        }
                    }
                });
            });

            const createdBom = await prisma.bom.findUnique({
                where: { id: bom.id },
                include: {
                    items: {
                        include: {
                            productVariant: {
                                include: {
                                    inventories: {
                                        select: {
                                            quantity: true,
                                            averageCost: true,
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (createdBom) {
                const totalCost = calculateBomCost(createdBom.items);
                const unitCost = totalCost / Number(createdBom.outputQuantity || 1);

                const rootCostUpdate = await updateStandardCost(validated.productVariantId, unitCost, 'BOM_UPDATE', bom.id);
                if (!rootCostUpdate.success) {
                    throw new BusinessRuleError(rootCostUpdate.error);
                }

                await BomCostCascadeService.cascadeFromVariants({
                    rootVariantIds: [validated.productVariantId],
                    defaultOnly: true,
                    referenceId: `root-bom:${bom.id}`,
                    userId: session.user.id,
                });
            }

            await logActivity({
                userId: session.user.id,
                action: 'CREATE_BOM',
                entityType: 'Bom',
                entityId: bom.id,
                details: `Created Recipe (BOM) ${bom.name}`
            });

            revalidatePath('/dashboard/boms');
            revalidatePath('/production/boms');
            return serializeData(bom);
        } catch (error) {
            logger.error("Failed to create BOM", { error, module: 'BomActions' });
            throw new BusinessRuleError("Failed to create Recipe (BOM). Please verify the details.");
        }
    });
}
);

export const getBom = withTenant(
async function getBom(id: string) {
    return safeAction(async () => {
        const bom = await prisma.bom.findUnique({
            where: { id },
            include: {
                productVariant: {
                    include: {
                        product: true,
                        inventories: {
                            select: {
                                quantity: true,
                                averageCost: true,
                            }
                        }
                    }
                },
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true,
                                inventories: {
                                    select: {
                                        quantity: true,
                                        averageCost: true,
                                    }
                                }
                            }
                        }
                    }
                },
                _count: {
                    select: { ProductionOrder: true },
                }
            }
        });

        if (!bom) throw new NotFoundError("Recipe", id);

        return serializeData(enrichBomCurrentCosts(bom));
    });
}
);

export const updateBom = withTenant(
async function updateBom(id: string, data: CreateBomValues) {
    return safeAction(async () => {
        const session = await requireAuth();
        const validated = createBomSchema.parse(data);

        await BomCostCascadeService.validateNoBomCycle({
            outputVariantId: validated.productVariantId,
            itemVariantIds: validated.items.map((item) => item.productVariantId),
            ignoreBomId: id,
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                // Unset other default BOMs on target variant when updating to default
                if (validated.isDefault) {
                    await unsetOtherDefaultBoms(tx, validated.productVariantId, id);
                }

                const updatedBom = await tx.bom.update({
                    where: { id },
                    data: {
                        name: validated.name,
                        productVariant: { connect: { id: validated.productVariantId } },
                        outputQuantity: validated.outputQuantity,
                        isDefault: validated.isDefault,
                        category: validated.category,
                    }
                });

                await tx.bomItem.deleteMany({ where: { bomId: id } });

                await tx.bomItem.createMany({
                    data: validated.items.map(item => ({
                        bomId: id,
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        scrapPercentage: item.scrapPercentage
                    }))
                });

                const newItemsWithCosts = await tx.bomItem.findMany({
                    where: { bomId: id },
                    include: {
                        productVariant: {
                            include: {
                                inventories: {
                                    select: {
                                        quantity: true,
                                        averageCost: true,
                                    }
                                }
                            }
                        }
                    }
                });

                const totalCost = calculateBomCost(newItemsWithCosts);
                const unitCost = totalCost / Number(updatedBom.outputQuantity || 1);

                const rootCostUpdate = await updateStandardCost(validated.productVariantId, unitCost, 'BOM_UPDATE', id, tx);
                if (!rootCostUpdate.success) {
                    throw new BusinessRuleError(rootCostUpdate.error);
                }

                return updatedBom;
            });

            await BomCostCascadeService.cascadeFromVariants({
                rootVariantIds: [validated.productVariantId],
                defaultOnly: true,
                referenceId: `root-bom:${id}`,
                userId: session.user.id,
            });

            await logActivity({
                userId: session.user.id,
                action: 'UPDATE_BOM',
                entityType: 'Bom',
                entityId: id,
                details: `Updated Recipe (BOM) ${validated.name}`
            });

            revalidatePath('/dashboard/boms');
            revalidatePath('/production/boms');
            return serializeData(result);
        } catch (error) {
            logger.error("Failed to update BOM", { error, module: 'BomActions' });
            throw new BusinessRuleError("Failed to update Recipe (BOM). Please try again.");
        }
    });
}
);

export const recalculateBomCostChain = withTenant(
async function recalculateBomCostChain(id: string) {
    return safeAction(async () => {
        const session = await requireAuth();

        const bom = await prisma.bom.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        productVariant: {
                            include: {
                                inventories: {
                                    select: {
                                        quantity: true,
                                        averageCost: true,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!bom) {
            throw new NotFoundError('Recipe', id);
        }

        const totalCost = calculateBomCost(bom.items);
        const unitCost = totalCost / Number(bom.outputQuantity || 1);

        const rootCostUpdate = await updateStandardCost(
            bom.productVariantId,
            unitCost,
            'BOM_UPDATE',
            `manual-recalc:${id}`,
            undefined,
            { skipCascade: true }
        );

        if (!rootCostUpdate.success) {
            throw new BusinessRuleError(rootCostUpdate.error);
        }

        const cascadeResult = await BomCostCascadeService.cascadeFromVariants({
            rootVariantIds: [bom.productVariantId],
            defaultOnly: true,
            referenceId: `manual-recalc:${id}`,
            userId: session.user.id,
        });

        await logActivity({
            userId: session.user.id,
            action: 'RECALCULATE_BOM_COST_CHAIN',
            entityType: 'Bom',
            entityId: id,
            details: `Recalculated cost chain for Recipe (BOM) ${bom.name} with ${cascadeResult.updatedCount} parent updates`
        });

        revalidatePath('/dashboard/boms');
        revalidatePath('/production/boms');
        revalidatePath(`/dashboard/boms/${id}`);
        revalidatePath(`/production/boms/${id}`);

        return serializeData({
            bomId: id,
            updatedParentCount: cascadeResult.updatedCount,
            updatedVariants: cascadeResult.updatedVariantIds,
        });
    });
}
);

export const deleteBom = withTenant(
async function deleteBom(id: string) {
    return safeAction(async () => {
        const session = await requireAuth();

        // Pre-check: if in use, throw BusinessRuleError (no logger.error)
        const usage = await BomLifecycleService.canHardDelete(id);
        if (!usage.ok) {
            if (usage.reason === 'BOM_NOT_FOUND') {
                throw new NotFoundError('Resep', id);
            }
            // BOM_IN_USE — business reject, not error
            throw new BusinessRuleError(
                `Resep tidak bisa dihapus karena sudah dipakai di ${usage.count} Production Order. Nonaktifkan saja agar tidak muncul di produksi baru.`,
                { bomId: id, count: usage.count },
                'BOM_IN_USE',
            );
        }

        const bom = await prisma.bom.findUnique({ where: { id } });
        const bomName = bom?.name || id;

        await BomLifecycleService.hardDelete(id, { userId: session.user.id });

        await logActivity({
            userId: session.user.id,
            action: 'DELETE_BOM',
            entityType: 'Bom',
            entityId: id,
            details: `Deleted Recipe (BOM) ${bomName}`
        });

        revalidatePath('/dashboard/boms');
        revalidatePath('/production/boms');
        return null;
    });
}
);

export const archiveBom = withTenant(
async function archiveBom(data: { bomId: string; newDefaultBomId?: string }) {
    return safeAction(async () => {
        const session = await requireAuth();
        const validated = archiveBomSchema.parse(data);

        const bom = await prisma.bom.findUnique({ where: { id: validated.bomId } });
        if (!bom) throw new NotFoundError('Resep', validated.bomId);
        const bomName = bom.name;

        // Idempotent: if already archived, return success
        if (!bom.isActive) {
            return null;
        }

        await BomLifecycleService.archive(
            validated.bomId,
            { userId: session.user.id },
            validated.newDefaultBomId,
        );

        const usage = await BomLifecycleService.getUsage(validated.bomId);

        await logActivity({
            userId: session.user.id,
            action: 'ARCHIVE_BOM',
            entityType: 'Bom',
            entityId: validated.bomId,
            details: `Archived Recipe (BOM) ${bomName} (used in ${usage.productionOrderCount} PO, replacement: ${validated.newDefaultBomId || 'none'})`
        });

        revalidatePath('/dashboard/boms');
        revalidatePath('/production/boms');
        return null;
    });
}
);

export const reactivateBom = withTenant(
async function reactivateBom(id: string) {
    return safeAction(async () => {
        const session = await requireAuth();

        const bom = await prisma.bom.findUnique({ where: { id } });
        if (!bom) throw new NotFoundError('Resep', id);
        const bomName = bom.name;

        // Idempotent: if already active, return success
        if (bom.isActive) {
            return null;
        }

        await BomLifecycleService.reactivate(id, { userId: session.user.id });

        await logActivity({
            userId: session.user.id,
            action: 'REACTIVATE_BOM',
            entityType: 'Bom',
            entityId: id,
            details: `Reactivated Recipe (BOM) ${bomName}`
        });

        revalidatePath('/dashboard/boms');
        revalidatePath('/production/boms');
        return null;
    });
}
);

export const bulkArchiveBom = withTenant(
async function bulkArchiveBom(ids: string[]) {
    return safeAction(async () => {
        const session = await requireAuth();
        if (!ids || ids.length === 0) {
            throw new BusinessRuleError('Pilih minimal satu resep untuk dinonaktifkan.', undefined, 'BULK_ARCHIVE_EMPTY');
        }

        const results: { success: string[]; failed: { id: string; reason: string }[] } = {
            success: [],
            failed: [],
        };

        for (const id of ids) {
            try {
                const bom = await prisma.bom.findUnique({ where: { id } });
                if (!bom) {
                    results.failed.push({ id, reason: 'Tidak ditemukan' });
                    continue;
                }
                if (!bom.isActive) {
                    results.failed.push({ id, reason: 'Sudah dinonaktifkan' });
                    continue;
                }
                // If default, skip (needs manual replacement selection)
                if (bom.isDefault) {
                    results.failed.push({ id, reason: 'Default — pilih pengganti manual' });
                    continue;
                }
                await BomLifecycleService.archive(id, { userId: session.user.id });
                results.success.push(id);
            } catch (error) {
                const message = error instanceof BusinessRuleError ? error.message : 'Gagal menonaktifkan';
                results.failed.push({ id, reason: message });
            }
        }

        if (results.success.length > 0) {
            await logActivity({
                userId: session.user.id,
                action: 'ARCHIVE_BOM',
                entityType: 'Bom',
                entityId: results.success.join(','),
                details: `Bulk archived ${results.success.length} Recipes (BOM)`,
            });
        }

        revalidatePath('/dashboard/boms');
        revalidatePath('/production/boms');
        return serializeData(results);
    });
}
);

export const duplicateBom = withTenant(
async function duplicateBom(data: DuplicateBomValues) {
    return safeAction(async () => {
        const session = await requireAuth();
        const validated = duplicateBomSchema.parse(data);

        // 1. Load source BOM with items
        const sourceBom = await prisma.bom.findUnique({
            where: { id: validated.sourceBomId },
            include: {
                items: true,
            },
        });

        if (!sourceBom) {
            throw new NotFoundError("Recipe", validated.sourceBomId);
        }

        if (sourceBom.items.length === 0) {
            throw new BusinessRuleError("Source BOM has no ingredients to duplicate.");
        }

        // 2. Verify target variant exists
        const targetVariant = await prisma.productVariant.findUnique({
            where: { id: validated.productVariantId },
        });

        if (!targetVariant) {
            throw new NotFoundError("ProductVariant", validated.productVariantId);
        }

        // 3. Validate no BOM cycle
        await BomCostCascadeService.validateNoBomCycle({
            outputVariantId: validated.productVariantId,
            itemVariantIds: sourceBom.items.map((item) => item.productVariantId),
        });

        // 4. Scale quantities and validate results
        const scale = Number(validated.quantityScale);
        const scaledItems = sourceBom.items.map((item) => {
            const rawQty = Number(item.quantity) * scale;
            // Round to 4 decimal places (Decimal(10,4) precision)
            const roundedQty = Math.round(rawQty * 10000) / 10000;
            return {
                productVariantId: item.productVariantId,
                quantity: roundedQty,
                scrapPercentage: item.scrapPercentage,
            };
        });

        // Validate no zero-quantity items after scaling
        const zeroItems = scaledItems.filter((item) => item.quantity <= 0);
        if (zeroItems.length > 0) {
            throw new BusinessRuleError(
                "Some ingredients resulted in zero or negative quantity after scaling. Increase the scale factor."
            );
        }

        try {
            const outputQuantity = validated.outputQuantity ?? Number(sourceBom.outputQuantity);

            const newBom = await prisma.$transaction(async (tx) => {
                // 5. Unset other defaults on target variant if new BOM is default
                if (validated.isDefault) {
                    await unsetOtherDefaultBoms(tx, validated.productVariantId);
                }

                // 6. Create the duplicated BOM
                return tx.bom.create({
                    data: {
                        name: validated.name,
                        productVariant: { connect: { id: validated.productVariantId } },
                        outputQuantity,
                        isDefault: validated.isDefault,
                        category: sourceBom.category,
                        description: sourceBom.description,
                        items: {
                            create: scaledItems.map((item) => ({
                                productVariantId: item.productVariantId,
                                quantity: item.quantity,
                                scrapPercentage: item.scrapPercentage,
                            })),
                        },
                    },
                });
            });

            // 7. Calculate cost and update standard cost
            const createdBom = await prisma.bom.findUnique({
                where: { id: newBom.id },
                include: {
                    items: {
                        include: {
                            productVariant: {
                                include: {
                                    inventories: {
                                        select: {
                                            quantity: true,
                                            averageCost: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (createdBom) {
                const totalCost = calculateBomCost(createdBom.items);
                const unitCost = totalCost / Number(createdBom.outputQuantity || 1);

                const rootCostUpdate = await updateStandardCost(
                    validated.productVariantId,
                    unitCost,
                    'BOM_UPDATE',
                    newBom.id
                );
                if (!rootCostUpdate.success) {
                    throw new BusinessRuleError(rootCostUpdate.error);
                }

                await BomCostCascadeService.cascadeFromVariants({
                    rootVariantIds: [validated.productVariantId],
                    defaultOnly: true,
                    referenceId: `root-bom:${newBom.id}`,
                    userId: session.user.id,
                });
            }

            // 8. Audit log
            await logActivity({
                userId: session.user.id,
                action: 'DUPLICATE_BOM',
                entityType: 'Bom',
                entityId: newBom.id,
                details: `Duplicated Recipe (BOM) from ${sourceBom.name} → ${validated.name} (scale: ${scale})`,
            });

            // 9. Revalidate paths
            revalidatePath('/dashboard/boms');
            revalidatePath('/production/boms');

            return serializeData(newBom);
        } catch (error) {
            // Re-throw known business errors (NotFoundError, BusinessRuleError)
            if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
                throw error;
            }
            logger.error("Failed to duplicate BOM", { error, module: 'BomActions' });
            throw new BusinessRuleError("Failed to duplicate Recipe. Please verify the details.");
        }
    });
}
);
