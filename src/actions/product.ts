'use server';

import { prisma } from '@/lib/prisma';
import { createProductSchema, updateProductSchema, CreateProductValues, UpdateProductValues } from '@/lib/schemas/product';
import { Inventory, CostHistory, ProductVariant, ProductType, Unit, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils';
import { requireAuth } from '@/lib/auth-checks';

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
        _count: {
            inventories: number;
        };
        stock?: number; // Calculated field per variant
    }[];
    totalStock?: number; // Calculated field for entire product
};

/**
 * Get all products with their variants and inventory totals
 */
export async function getProducts(options?: { type?: ProductType }): Promise<ProductWithVariantsAndStock[]> {
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

    // Calculate stock for each variant and total stock for each product
    return products.map(product => {
        let productTotalStock = 0;

        const cleanedVariants = product.variants.map(variant => {
            const variantStock = variant.inventories.reduce((vSum, inv) => {
                return vSum + inv.quantity.toNumber();
            }, 0);

            productTotalStock += variantStock;

            // Remove inventories from variant to clean up the response
            const { inventories: _, ...variantData } = variant;

            return {
                ...variantData,
                stock: variantStock,
            };
        });

        return {
            ...product,
            variants: cleanedVariants,
            totalStock: productTotalStock,
        };
    });
}

// Define types for the included relations
type InventoryWithLocation = Inventory & {
    location: { name: string };
};

type CostHistoryWithCreatedBy = CostHistory & {
    createdBy: { name: string };
};

// Define a type for ProductVariant with its included relations
type ProductVariantWithRelations = ProductVariant & {
    inventories: InventoryWithLocation[];
    costHistory: CostHistoryWithCreatedBy[];
};

/**
 * Get a single product by ID with all variants
 */
export async function getProductById(id: string) {
    await requireAuth();
    const product = await prisma.product.findUnique({
        where: { id },
        include: {
            variants: {
                include: {
                    inventories: {
                        select: {
                            quantity: true,
                            location: {
                                select: { name: true }
                            }
                        }
                    },
                    // Prisma does not directly link CostHistory to ProductVariant in its default type generation.
                    // This is a common pattern when a relation is not explicitly defined on the model itself
                    // but is fetched via a separate query or is a "virtual" relation.
                    // To make this work with Prisma's generated types, we often need to explicitly define
                    // the relation in the schema or use a raw query.
                    // For now, we'll use a type assertion with a comment to acknowledge the limitation.
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

    // Calculate stock for each variant
    const enrichedVariants = (product.variants as ProductVariantWithRelations[]).map((variant) => {
        const stock = variant.inventories.reduce((sum: number, inv) => sum + Number(inv.quantity), 0);
        return {
            ...variant,
            stock
        };
    });

    return serializeData({
        ...product,
        variants: enrichedVariants
    });
}

/**
 * Get all available units from the enum
 */
export async function getUnits(): Promise<Unit[]> {
    await requireAuth();
    return Object.values(Unit);
}

/**
 * Get all available product types from the enum
 */
export async function getProductTypes(): Promise<ProductType[]> {
    await requireAuth();
    return Object.values(ProductType);
}

/**
 * Get all product variants for selection
 */
export async function getVariants() {
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
}

/**
 * Create a new product with variants using a transaction
 */
export async function createProduct(data: CreateProductValues) {
    await requireAuth();
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
    await requireAuth();
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
    await requireAuth();
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
    await requireAuth();
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

/**
 * Auto-generate a unique SKU code based on product type and name
 */
export async function getNextSKU(productType: ProductType, productName: string, currentSkus: string[] = []): Promise<string> {
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

    // Get Category Part (3 chars)
    const namePart = productName
        .replace(/[^A-Z]/gi, '')
        .toUpperCase();

    let category = namePart.substring(0, 3);
    while (category.length < 3) {
        category += 'X';
    }

    const skuPrefix = `${prefix}${category}`;

    // Find all existing SKUs with this prefix in DB
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

    // Collect all sequence numbers from DB and current form
    const sequences = new Set<number>();

    // From DB
    for (const variant of existingVariants) {
        const seqPart = variant.skuCode.substring(5);
        const seq = parseInt(seqPart, 10);
        if (!isNaN(seq)) {
            sequences.add(seq);
        }
    }

    // From current form
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
        // Find the maximum sequence and increment
        nextSeq = Math.max(...Array.from(sequences)) + 1;
    }

    return `${skuPrefix}${nextSeq.toString().padStart(3, '0')}`;
}
