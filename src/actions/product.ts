'use server';

import { prisma } from '@/lib/prisma';
import { createProductSchema, updateProductSchema, CreateProductValues, UpdateProductValues } from '@/lib/zod-schemas';
import { ProductType, Unit, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';

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
        buyPrice: Prisma.Decimal | null;
        sellPrice: Prisma.Decimal | null;
        minStockAlert: Prisma.Decimal | null;
        _count: {
            inventories: number;
        };
    }[];
    totalStock?: number; // Calculated field
};

/**
 * Get all products with their variants and inventory totals
 */
export async function getProducts(): Promise<ProductWithVariantsAndStock[]> {
    const products = await prisma.product.findMany({
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

    // Calculate total stock for each product
    return products.map(product => {
        const totalStock = product.variants.reduce((sum, variant) => {
            const variantStock = variant.inventories.reduce((vSum, inv) => {
                return vSum + inv.quantity.toNumber();
            }, 0);
            return sum + variantStock;
        }, 0);

        // Remove inventories from variants to clean up the response
        const cleanedVariants = product.variants.map(({ inventories: _, ...variant }) => variant);

        return {
            ...product,
            variants: cleanedVariants,
            totalStock,
        };
    });
}

/**
 * Get a single product by ID with all variants
 */
export async function getProductById(id: string) {
    const product = await prisma.product.findUnique({
        where: { id },
        include: {
            variants: {
                orderBy: {
                    name: 'asc',
                },
            },
        },
    });

    if (!product) {
        return null;
    }

    return product;
}

/**
 * Get all available units from the enum
 */
export async function getUnits(): Promise<Unit[]> {
    return Object.values(Unit);
}

/**
 * Get all available product types from the enum
 */
export async function getProductTypes(): Promise<ProductType[]> {
    return Object.values(ProductType);
}

/**
 * Create a new product with variants using a transaction
 */
export async function createProduct(data: CreateProductValues) {
    const result = createProductSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { name, productType, variants } = result.data;

    try {
        // Check for duplicate SKU codes in the database
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
            return {
                success: false,
                error: `SKU code(s) already exist: ${existingSkus.map(s => s.skuCode).join(', ')}`,
            };
        }

        await prisma.$transaction(async (tx) => {
            // Create product
            const product = await tx.product.create({
                data: {
                    name,
                    productType,
                },
            });

            // Create variants
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
                    sellPrice: variant.sellPrice ? new Prisma.Decimal(variant.sellPrice) : null,
                    minStockAlert: variant.minStockAlert ? new Prisma.Decimal(variant.minStockAlert) : null,
                })),
            });
        });

        revalidatePath('/dashboard/products');
        return { success: true };
    } catch (error) {
        console.error('Create product error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create product' };
    }
}

/**
 * Update an existing product and sync its variants
 */
export async function updateProduct(data: UpdateProductValues) {
    const result = updateProductSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { id, name, productType, variants } = result.data;

    try {
        // Check for duplicate SKU codes in the database (excluding current product's variants)
        const currentProduct = await prisma.product.findUnique({
            where: { id },
            include: { variants: { select: { id: true, skuCode: true } } },
        });

        if (!currentProduct) {
            return { success: false, error: 'Product not found' };
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
                return {
                    success: false,
                    error: `SKU code(s) already exist: ${existingSkus.map(s => s.skuCode).join(', ')}`,
                };
            }
        }

        await prisma.$transaction(async (tx) => {
            // Update product basic info
            await tx.product.update({
                where: { id },
                data: {
                    name,
                    productType,
                },
            });

            // Get existing variant IDs
            const existingVariantIds = currentProduct.variants.map(v => v.id);
            const incomingVariantIds = variants.filter(v => v.id).map(v => v.id!);

            // Delete variants that are no longer in the list
            const variantsToDelete = existingVariantIds.filter(id => !incomingVariantIds.includes(id));

            if (variantsToDelete.length > 0) {
                // Check if any of these variants have inventory
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
                    throw new Error(
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

            // Update or create variants
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
                    sellPrice: variant.sellPrice ? new Prisma.Decimal(variant.sellPrice) : null,
                    minStockAlert: variant.minStockAlert ? new Prisma.Decimal(variant.minStockAlert) : null,
                };

                if (variant.id) {
                    // Update existing variant
                    await tx.productVariant.update({
                        where: { id: variant.id },
                        data: variantData,
                    });
                } else {
                    // Create new variant
                    await tx.productVariant.create({
                        data: variantData,
                    });
                }
            }
        });

        revalidatePath('/dashboard');
        revalidatePath('/dashboard/products');
        revalidatePath(`/dashboard/products/${id}/edit`);
        return { success: true };
    } catch (error) {
        console.error('Update product error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update product' };
    }
}

/**
 * Delete a product (cascades to variants)
 */
export async function deleteProduct(id: string) {
    try {
        // Get all variants for this product
        const variants = await prisma.productVariant.findMany({
            where: { productId: id },
            select: { id: true, skuCode: true },
        });

        const variantIds = variants.map(v => v.id);

        if (variantIds.length > 0) {
            // Check for references in related tables for all variants
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
                return {
                    success: false,
                    error: `Cannot delete product. Its variants are referenced in: ${referenced.join(', ')}`,
                };
            }
        }

        // Delete variants and product in a transaction
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

        revalidatePath('/dashboard/products');
        return { success: true };
    } catch (error) {
        console.error('Delete product error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete product' };
    }
}

/**
 * Delete a single variant (with inventory check)
 */
export async function deleteVariant(id: string) {
    try {
        // Check for references in related tables before deleting
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
            return {
                success: false,
                error: `Cannot delete variant. It is referenced in: ${referenced.join(', ')}`,
            };
        }

        await prisma.productVariant.delete({ where: { id } });

        revalidatePath('/dashboard/products');
        return { success: true };
    } catch (error) {
        console.error('Delete variant error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete variant' };
    }
}
