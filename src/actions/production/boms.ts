'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { createBomSchema, CreateBomValues } from '@/lib/schemas/production';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils/utils';
import { calculateBomCost } from '@/lib/utils/production-utils';
import { updateStandardCost } from '@/actions/finance/cost-history';
import { logger } from '@/lib/config/logger';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logActivity } from "@/lib/tools/audit";
import { safeAction, BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { getCurrentUnitCost } from '@/lib/utils/current-cost';

function enrichVariantCurrentCost<T extends { inventories?: Array<{ quantity?: unknown; averageCost?: unknown }> } & Record<string, unknown>>(variant: T): T & { currentCost: number } {
    return {
        ...variant,
        currentCost: getCurrentUnitCost(variant),
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
async function getBoms(category?: string) {
    return safeAction(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {};
        if (category && category !== 'ALL') {
            where.category = category;
        }

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

        try {
            const bom = await prisma.bom.create({
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

                await updateStandardCost(validated.productVariantId, unitCost, 'BOM_UPDATE', bom.id);
            }

            await logActivity({
                userId: session.user.id,
                action: 'CREATE_BOM',
                entityType: 'Bom',
                entityId: bom.id,
                details: `Created Recipe (BOM) ${bom.name}`
            });

            revalidatePath('/dashboard/boms');
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

        try {
            const result = await prisma.$transaction(async (tx) => {
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

                await updateStandardCost(validated.productVariantId, unitCost, 'BOM_UPDATE', id, tx);

                return updatedBom;
            });

            await logActivity({
                userId: session.user.id,
                action: 'UPDATE_BOM',
                entityType: 'Bom',
                entityId: id,
                details: `Updated Recipe (BOM) ${validated.name}`
            });

            revalidatePath('/dashboard/boms');
            return serializeData(result);
        } catch (error) {
            logger.error("Failed to update BOM", { error, module: 'BomActions' });
            throw new BusinessRuleError("Failed to update Recipe (BOM). Please try again.");
        }
    });
}
);

export const deleteBom = withTenant(
async function deleteBom(id: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        try {
            await prisma.bom.delete({ where: { id } });

            await logActivity({
                userId: session.user.id,
                action: 'DELETE_BOM',
                entityType: 'Bom',
                entityId: id,
                details: `Deleted Recipe (BOM) ${id}`
            });

            revalidatePath('/dashboard/boms');
            return null;
        } catch (error) {
            logger.error("Failed to delete BOM", { error, module: 'BomActions' });
            throw new BusinessRuleError("Failed to delete Recipe. It might be in use by a production order.");
        }
    });
}
);
