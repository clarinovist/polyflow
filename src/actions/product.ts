'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { createProductSchema, updateProductSchema, CreateProductValues, UpdateProductValues } from '@/lib/schemas/product';
import { Inventory, CostHistory, ProductVariant, ProductType, Unit, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils/utils';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logger } from '@/lib/config/logger';
import { logActivity } from "@/lib/tools/audit";
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { getCurrentUnitCost } from '@/lib/utils/current-cost';

export type ProductWithVariantsAndStock = {
    id: string;
    name: string;
    productType: ProductType;
    createdAt: Date;
    updatedAt: Date;
    variants: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: Unit;
        salesUnit: Unit | null;
        conversionFactor: Prisma.Decimal;
        price: Prisma.Decimal | null;
        standardCost: Prisma.Decimal | null;
        buyPrice: Prisma.Decimal | null;
        minStockAlert: Prisma.Decimal | null;
        currentCost?: number;
        currentStockValue?: number;
        _count: {
            inventories: number;
        };
        stock?: number;
    }[];
    totalStock?: number;
};

type InventoryWithLocation = Inventory & {
    location: { name: string };
};

type CostHistoryWithCreatedBy = CostHistory & {
    createdBy: { name: string };
};

type ProductVariantWithRelations = ProductVariant & {
    inventories: InventoryWithLocation[];
    costHistory: CostHistoryWithCreatedBy[];
};

export const getProducts = withTenant(
async function getProducts(options?: { type?: ProductType }) {
    return safeAction(async () => {
        await requireAuth();
        const where: Prisma.ProductWhereInput = {};

        if (options?.type) {
            where.productType = options.type;
        }

        const products = await prisma.product.findMany({
            where,
            include: {
                variants: {
                    include: {
                        _count: {
                            select: {
                                inventories: true,
                            },
                        },
                        inventories: {
                            select: {
                                quantity: true,
                                averageCost: true,
                            },
                        },
                    },
                    orderBy: {
                        name: 'asc',
                    },
                },
            },
            orderBy: {
                name: 'asc',
            },
        });

        return products.map(product => {
            let productTotalStock = 0;

            const variantsArray = product.variants || [];

            const cleanedVariants = variantsArray.map(variant => {
                const invs = variant.inventories || [];
                const variantStock = invs.reduce((vSum, inv) => {
                    return vSum + (inv.quantity?.toNumber ? inv.quantity.toNumber() : Number(inv.quantity || 0));
                }, 0);
                const variantStockValue = invs.reduce((vSum, inv) => {
                    const quantity = inv.quantity?.toNumber ? inv.quantity.toNumber() : Number(inv.quantity || 0);
                    const averageCost = inv.averageCost?.toNumber ? inv.averageCost.toNumber() : Number(inv.averageCost || 0);
                    return vSum + (quantity * averageCost);
                }, 0);
                const currentCost = getCurrentUnitCost(variant);

                productTotalStock += variantStock;

                const { inventories: _, ...variantData } = variant;

                return {
                    ...variantData,
                    stock: variantStock,
                    currentCost,
                    currentStockValue: variantStock > 0 ? variantStockValue : 0,
                };
            });

            return {
                ...product,
                variants: cleanedVariants,
                totalStock: productTotalStock,
            };
        });
    });
}
);

export const getProductById = withTenant(
async function getProductById(id: string) {
    return safeAction(async () => {
        await requireAuth();
        const product = await prisma.product.findUnique({
            where: { id },
            include: {
                variants: {
                    include: {
                        inventories: {
                            select: {
                                quantity: true,
                                averageCost: true,
                                location: {
                                    select: { name: true }
                                }
                            }
                        },
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore - costHistory is not directly on ProductVariant type, but we are including it.
                        costHistory: {
                            take: 10,
                            orderBy: { createdAt: 'desc' },
                            include: {
                                createdBy: {
                                    select: { name: true }
                                }
                            }
                        }
                    },
                    orderBy: {
                        name: 'asc',
                    },
                },
            },
        });

        if (!product) {
            return null;
        }

        const enrichedVariants = (product.variants || [] as ProductVariantWithRelations[]).map((variant) => {
            const invs = variant.inventories || [];
            const stock = invs.reduce((sum: number, inv) => sum + Number(inv.quantity), 0);
            const stockValue = invs.reduce((sum: number, inv) => sum + (Number(inv.quantity) * Number(inv.averageCost || 0)), 0);
            return {
                ...variant,
                stock,
                currentCost: getCurrentUnitCost(variant),
                currentStockValue: stock > 0 ? stockValue : 0,
            };
        });

        return serializeData({
            ...product,
            variants: enrichedVariants
        });
    });
}
);

export const getUnits = withTenant(
async function getUnits(): Promise<{ success: boolean, data?: Unit[], error?: string }> {
    return safeAction(async () => {
        await requireAuth();
        return Object.values(Unit);
    });
}
);

export const getProductTypes = withTenant(
async function getProductTypes(): Promise<{ success: boolean, data?: ProductType[], error?: string }> {
    return safeAction(async () => {
        await requireAuth();
        return Object.values(ProductType);
    });
}
);

export const getVariants = withTenant(
async function getVariants() {
    return safeAction(async () => {
        await requireAuth();
        const variants = await prisma.productVariant.findMany({
            include: {
                product: true,
            },
            orderBy: {
                skuCode: 'asc',
            },
        });
        return serializeData(variants);
    });
}
);

export const createProduct = withTenant(
async function createProduct(data: CreateProductValues) {
    return safeAction(async () => {
        const session = await requireAuth();
        const result = createProductSchema.safeParse(data);

        if (!result.success) {
            throw new BusinessRuleError(result.error.issues[0].message);
        }

        const { name, productType, variants } = result.data;

        try {
            const existingSkus = await prisma.productVariant.findMany({
                where: {
                    skuCode: {
                        in: variants.map(v => v.skuCode),
                    },
                },
                select: {
                    skuCode: true,
                },
            });

            if (existingSkus.length > 0) {
                throw new BusinessRuleError(`SKU code(s) already exist: ${existingSkus.map(s => s.skuCode).join(', ')}`);
            }

            const createdProduct = await prisma.$transaction(async (tx) => {
                const product = await tx.product.create({
                    data: {
                        name,
                        productType,
                    },
                });

                await tx.productVariant.createMany({
                    data: variants.map(variant => ({
                        productId: product.id,
                        name: variant.name,
                        skuCode: variant.skuCode,
                        primaryUnit: variant.primaryUnit,
                        salesUnit: variant.salesUnit || variant.primaryUnit,
                        conversionFactor: new Prisma.Decimal(variant.conversionFactor),
                        price: variant.price ? new Prisma.Decimal(variant.price) : null,
                        buyPrice: variant.buyPrice ? new Prisma.Decimal(variant.buyPrice) : null,
                        minStockAlert: variant.minStockAlert ? new Prisma.Decimal(variant.minStockAlert) : null,
                    })),
                });
                return product;
            });

            await logActivity({
                userId: session.user.id,
                action: 'CREATE_PRODUCT',
                entityType: 'Product',
                entityId: createdProduct.id,
                details: `Created product ${createdProduct.name}`
            });

            revalidatePath('/dashboard/products');
            return null;
        } catch (error) {
            if (error instanceof BusinessRuleError) throw error;
            logger.error('Failed to create product', { error, module: 'ProductActions' });
            throw new BusinessRuleError('Failed to create product. Please check the inputs.');
        }
    });
}
);

export const updateProduct = withTenant(
async function updateProduct(data: UpdateProductValues) {
    return safeAction(async () => {
        const session = await requireAuth();
        const result = updateProductSchema.safeParse(data);

        if (!result.success) {
            throw new BusinessRuleError(result.error.issues[0].message);
        }

        const { id, name, productType, variants } = result.data;

        try {
            const currentProduct = await prisma.product.findUnique({
                where: { id },
                include: { variants: { select: { id: true, skuCode: true } } },
            });

            if (!currentProduct) {
                throw new BusinessRuleError('Product not found');
            }

            const currentSkuCodes = currentProduct.variants.map(v => v.skuCode);
            const newSkuCodes = variants.map(v => v.skuCode).filter(sku => !currentSkuCodes.includes(sku));

            if (newSkuCodes.length > 0) {
                const existingSkus = await prisma.productVariant.findMany({
                    where: {
                        skuCode: {
                            in: newSkuCodes,
                        },
                    },
                    select: {
                        skuCode: true,
                    },
                });

                if (existingSkus.length > 0) {
                    throw new BusinessRuleError(`SKU code(s) already exist: ${existingSkus.map(s => s.skuCode).join(', ')}`);
                }
            }

            await prisma.$transaction(async (tx) => {
                await tx.product.update({
                    where: { id },
                    data: {
                        name,
                        productType,
                    },
                });

                const existingVariantIds = currentProduct.variants.map(v => v.id);
                const incomingVariantIds = variants.filter(v => v.id).map(v => v.id!);

                const variantsToDelete = existingVariantIds.filter(id => !incomingVariantIds.includes(id));

                if (variantsToDelete.length > 0) {
                    const variantsWithInventory = await tx.inventory.findMany({
                        where: {
                            productVariantId: {
                                in: variantsToDelete,
                            },
                            quantity: {
                                gt: 0,
                            },
                        },
                        select: {
                            productVariant: {
                                select: {
                                    name: true,
                                    skuCode: true,
                                },
                            },
                        },
                    });

                    if (variantsWithInventory.length > 0) {
                        throw new BusinessRuleError(
                            `Cannot delete variant(s) with existing inventory: ${variantsWithInventory.map(v => v.productVariant.skuCode).join(', ')}`
                        );
                    }

                    await tx.productVariant.deleteMany({
                        where: {
                            id: {
                                in: variantsToDelete,
                            },
                        },
                    });
                }

                for (const variant of variants) {
                    const variantData = {
                        productId: id,
                        name: variant.name,
                        skuCode: variant.skuCode,
                        primaryUnit: variant.primaryUnit,
                        salesUnit: variant.salesUnit || variant.primaryUnit,
                        conversionFactor: new Prisma.Decimal(variant.conversionFactor),
                        price: variant.price ? new Prisma.Decimal(variant.price) : null,
                        buyPrice: variant.buyPrice ? new Prisma.Decimal(variant.buyPrice) : null,
                        minStockAlert: variant.minStockAlert ? new Prisma.Decimal(variant.minStockAlert) : null,
                    };

                    if (variant.id) {
                        await tx.productVariant.update({
                            where: { id: variant.id },
                            data: variantData,
                        });
                    } else {
                        await tx.productVariant.create({
                            data: variantData,
                        });
                    }
                }
            });

            await logActivity({
                userId: session.user.id,
                action: 'UPDATE_PRODUCT',
                entityType: 'Product',
                entityId: id,
                details: `Updated product ${name}`
            });

            revalidatePath('/dashboard');
            revalidatePath('/dashboard/products');
            revalidatePath(`/dashboard/products/${id}/edit`);
            return null;
        } catch (error) {
            if (error instanceof BusinessRuleError) throw error;
            logger.error('Failed to update product', { error, productId: id, module: 'ProductActions' });
            throw new BusinessRuleError('Failed to update product. Please check the inputs.');
        }
    });
}
);

export const deleteProduct = withTenant(
async function deleteProduct(id: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        try {
            const variants = await prisma.productVariant.findMany({
                where: { productId: id },
                select: { id: true, skuCode: true },
            });

            const variantIds = variants.map(v => v.id);

            if (variantIds.length > 0) {
                const checks = await Promise.all([
                    prisma.inventory.count({ where: { productVariantId: { in: variantIds } } }),
                    prisma.stockMovement.count({ where: { productVariantId: { in: variantIds } } }),
                    prisma.batch.count({ where: { productVariantId: { in: variantIds } } }),
                    prisma.bomItem.count({ where: { productVariantId: { in: variantIds } } }),
                    prisma.materialIssue.count({ where: { productVariantId: { in: variantIds } } }),
                    prisma.scrapRecord.count({ where: { productVariantId: { in: variantIds } } }),
                    prisma.stockReservation.count({ where: { productVariantId: { in: variantIds } } }),
                    prisma.stockOpnameItem.count({ where: { productVariantId: { in: variantIds } } }),
                    prisma.productionMaterial.count({ where: { productVariantId: { in: variantIds } } }),
                    prisma.bom.count({ where: { productVariantId: { in: variantIds } } }),
                ]);

                const [
                    inventoryCount,
                    movementCount,
                    batchCount,
                    bomItemCount,
                    materialIssueCount,
                    scrapCount,
                    reservationCount,
                    opnameItemCount,
                    productionMaterialCount,
                    bomCount
                ] = checks;

                const referenced: string[] = [];
                if (inventoryCount > 0) referenced.push(`Inventory (${inventoryCount})`);
                if (movementCount > 0) referenced.push(`StockMovement (${movementCount})`);
                if (batchCount > 0) referenced.push(`Batch (${batchCount})`);
                if (bomItemCount > 0) referenced.push(`BomItem (${bomItemCount})`);
                if (bomCount > 0) referenced.push(`Bom (${bomCount})`);
                if (materialIssueCount > 0) referenced.push(`MaterialIssue (${materialIssueCount})`);
                if (scrapCount > 0) referenced.push(`ScrapRecord (${scrapCount})`);
                if (reservationCount > 0) referenced.push(`StockReservation (${reservationCount})`);
                if (opnameItemCount > 0) referenced.push(`StockOpnameItem (${opnameItemCount})`);
                if (productionMaterialCount > 0) referenced.push(`ProductionMaterial (${productionMaterialCount})`);

                if (referenced.length > 0) {
                    throw new BusinessRuleError(`Cannot delete product. Its variants are referenced in: ${referenced.join(', ')}`);
                }
            }

            await prisma.$transaction(async (tx) => {
                if (variantIds.length > 0) {
                    await tx.productVariant.deleteMany({
                        where: { id: { in: variantIds } },
                    });
                }

                await tx.product.delete({
                    where: { id },
                });
            });

            await logActivity({
                userId: session.user.id,
                action: 'DELETE_PRODUCT',
                entityType: 'Product',
                entityId: id,
                details: `Deleted product ${id}`
            });

            revalidatePath('/dashboard/products');
            return null;
        } catch (error) {
            if (error instanceof BusinessRuleError) throw error;
            logger.error('Failed to delete product', { error, productId: id, module: 'ProductActions' });
            throw new BusinessRuleError('Failed to delete product. Ensure it has no dependencies.');
        }
    });
}
);

export const deleteVariant = withTenant(
async function deleteVariant(id: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        try {
            const checks = await Promise.all([
                prisma.inventory.count({ where: { productVariantId: id } }),
                prisma.stockMovement.count({ where: { productVariantId: id } }),
                prisma.batch.count({ where: { productVariantId: id } }),
                prisma.bomItem.count({ where: { productVariantId: id } }),
                prisma.materialIssue.count({ where: { productVariantId: id } }),
                prisma.scrapRecord.count({ where: { productVariantId: id } }),
                prisma.stockReservation.count({ where: { productVariantId: id } }),
                prisma.stockOpnameItem.count({ where: { productVariantId: id } }),
                prisma.productionMaterial.count({ where: { productVariantId: id } }),
                prisma.bom.count({ where: { productVariantId: id } }),
            ]);

            const [inventoryCount, movementCount, batchCount, bomItemCount, materialIssueCount, scrapCount, reservationCount, opnameItemCount, productionMaterialCount, bomCount] = checks;

            const referenced: string[] = [];
            if (inventoryCount > 0) referenced.push(`Inventory (${inventoryCount})`);
            if (movementCount > 0) referenced.push(`StockMovement (${movementCount})`);
            if (batchCount > 0) referenced.push(`Batch (${batchCount})`);
            if (bomItemCount > 0) referenced.push(`BomItem (${bomItemCount})`);
            if (bomCount > 0) referenced.push(`Bom (${bomCount})`);
            if (materialIssueCount > 0) referenced.push(`MaterialIssue (${materialIssueCount})`);
            if (scrapCount > 0) referenced.push(`ScrapRecord (${scrapCount})`);
            if (reservationCount > 0) referenced.push(`StockReservation (${reservationCount})`);
            if (opnameItemCount > 0) referenced.push(`StockOpnameItem (${opnameItemCount})`);
            if (productionMaterialCount > 0) referenced.push(`ProductionMaterial (${productionMaterialCount})`);

            if (referenced.length > 0) {
                throw new BusinessRuleError(`Cannot delete variant. It is referenced in: ${referenced.join(', ')}`);
            }

            await prisma.productVariant.delete({ where: { id } });

            await logActivity({
                userId: session.user.id,
                action: 'DELETE_PRODUCT_VARIANT',
                entityType: 'ProductVariant',
                entityId: id,
                details: `Deleted product variant ${id}`
            });

            revalidatePath('/dashboard/products');
            return null;
        } catch (error) {
            if (error instanceof BusinessRuleError) throw error;
            logger.error('Failed to delete variant', { error, variantId: id, module: 'ProductActions' });
            throw new BusinessRuleError('Failed to delete variant. Ensure it has no dependencies.');
        }
    });
}
);

export const getNextSKU = withTenant(
async function getNextSKU(productType: ProductType, productName: string, currentSkus: string[] = []): Promise<{ success: boolean, data?: string, error?: string }> {
    return safeAction(async () => {
        await requireAuth();
        const prefixes: Record<string, string> = {
            [ProductType.RAW_MATERIAL]: 'RM',
            [ProductType.INTERMEDIATE]: 'IN',
            [ProductType.PACKAGING]: 'PK',
            [ProductType.WIP]: 'WP',
            [ProductType.FINISHED_GOOD]: 'FG',
            [ProductType.SCRAP]: 'SC',
        };

        const prefix = prefixes[productType] || 'XX';

        const namePart = productName
            .replace(/[^A-Z]/gi, '')
            .toUpperCase();

        let category = namePart.substring(0, 3);
        while (category.length < 3) {
            category += 'X';
        }

        const skuPrefix = `${prefix}${category}`;

        const existingVariants = await prisma.productVariant.findMany({
            where: {
                skuCode: {
                    startsWith: skuPrefix,
                },
            },
            select: {
                skuCode: true,
            },
            orderBy: {
                skuCode: 'desc',
            },
        });

        const sequences = new Set<number>();

        for (const variant of existingVariants) {
            const seqPart = variant.skuCode.substring(5);
            const seq = parseInt(seqPart, 10);
            if (!isNaN(seq)) {
                sequences.add(seq);
            }
        }

        for (const sku of currentSkus) {
            if (sku && sku.startsWith(skuPrefix)) {
                const seqPart = sku.substring(5);
                const seq = parseInt(seqPart, 10);
                if (!isNaN(seq)) {
                    sequences.add(seq);
                }
            }
        }

        let nextSeq = 1;
        if (sequences.size > 0) {
            nextSeq = Math.max(...Array.from(sequences)) + 1;
        }

        return `${skuPrefix}${nextSeq.toString().padStart(3, '0')}`;
    });
}
);
