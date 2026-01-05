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
        const cleanedVariants = product.variants.map(({ inventories, ...variant }) => variant);

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
    } catch (error: any) {
        console.error('Create product error:', error);
        return { success: false, error: error.message || 'Failed to create product' };
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
    } catch (error: any) {
        console.error('Update product error:', error);
        return { success: false, error: error.message || 'Failed to update product' };
    }
}

/**
 * Delete a product (cascades to variants)
 */
export async function deleteProduct(id: string) {
    try {
        // Check if any variants have inventory
        const variantsWithInventory = await prisma.inventory.findMany({
            where: {
                productVariant: {
                    productId: id,
                },
                quantity: {
                    gt: 0,
                },
            },
            include: {
                productVariant: {
                    select: {
                        name: true,
                        skuCode: true,
                    },
                },
            },
        });

        if (variantsWithInventory.length > 0) {
            return {
                success: false,
                error: `Cannot delete product. The following variants have inventory: ${variantsWithInventory.map(v => v.productVariant.skuCode).join(', ')}`,
            };
        }

        await prisma.product.delete({
            where: { id },
        });

        revalidatePath('/dashboard/products');
        return { success: true };
    } catch (error: any) {
        console.error('Delete product error:', error);
        return { success: false, error: error.message || 'Failed to delete product' };
    }
}

/**
 * Delete a single variant (with inventory check)
 */
export async function deleteVariant(id: string) {
    try {
        // Check if variant has inventory
        const inventory = await prisma.inventory.findMany({
            where: {
                productVariantId: id,
                quantity: {
                    gt: 0,
                },
            },
        });

        if (inventory.length > 0) {
            return {
                success: false,
                error: 'Cannot delete variant with existing inventory',
            };
        }

        await prisma.productVariant.delete({
            where: { id },
        });

        revalidatePath('/dashboard/products');
        return { success: true };
    } catch (error: any) {
        console.error('Delete variant error:', error);
        return { success: false, error: error.message || 'Failed to delete variant' };
    }
}
