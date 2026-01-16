'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const linkSupplierSchema = z.object({
    supplierId: z.string().min(1, "Supplier is required"),
    productVariantId: z.string().min(1, "Product variant is required"),
    unitPrice: z.coerce.number().nonnegative("Unit price must be non-negative").optional().nullable(),
    leadTimeDays: z.coerce.number().int().nonnegative().optional().nullable(),
    minOrderQty: z.coerce.number().nonnegative().optional().nullable(),
    isPreferred: z.boolean().default(false),
    notes: z.string().optional().nullable(),
});

export type LinkSupplierValues = z.infer<typeof linkSupplierSchema>;

/**
 * Link a supplier to a product variant
 */
export async function linkSupplierToProduct(data: LinkSupplierValues) {
    const result = linkSupplierSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { supplierId, productVariantId, ...rest } = result.data;

    try {
        await prisma.$transaction(async (tx) => {
            // If this is set as preferred, unset any existing preferred supplier for this variant
            if (rest.isPreferred) {
                await tx.supplierProduct.updateMany({
                    where: { productVariantId },
                    data: { isPreferred: false },
                });
            }

            await tx.supplierProduct.upsert({
                where: {
                    supplierId_productVariantId: {
                        supplierId,
                        productVariantId,
                    },
                },
                update: {
                    ...rest,
                    unitPrice: rest.unitPrice ? new Prisma.Decimal(rest.unitPrice) : null,
                    minOrderQty: rest.minOrderQty ? new Prisma.Decimal(rest.minOrderQty) : null,
                },
                create: {
                    supplierId,
                    productVariantId,
                    ...rest,
                    unitPrice: rest.unitPrice ? new Prisma.Decimal(rest.unitPrice) : null,
                    minOrderQty: rest.minOrderQty ? new Prisma.Decimal(rest.minOrderQty) : null,
                },
            });

            // Also update the legacy preferredSupplierId on ProductVariant for backward compatibility
            if (rest.isPreferred) {
                await tx.productVariant.update({
                    where: { id: productVariantId },
                    data: { preferredSupplierId: supplierId },
                });
            }
        });

        revalidatePath(`/dashboard/suppliers/${supplierId}`);
        revalidatePath(`/dashboard/products`);
        return { success: true };
    } catch (error) {
        console.error('Link supplier error:', error);
        return { success: false, error: 'Failed to link supplier to product' };
    }
}

/**
 * Unlink a supplier from a product variant
 */
export async function unlinkSupplierFromProduct(id: string) {
    try {
        const item = await prisma.supplierProduct.findUnique({
            where: { id },
        });

        if (!item) {
            return { success: false, error: 'Link not found' };
        }

        await prisma.$transaction(async (tx) => {
            await tx.supplierProduct.delete({
                where: { id },
            });

            // If this was the preferred supplier, clear the legacy field on ProductVariant
            if (item.isPreferred) {
                await tx.productVariant.update({
                    where: { id: item.productVariantId },
                    data: { preferredSupplierId: null },
                });
            }
        });

        revalidatePath(`/dashboard/suppliers/${item.supplierId}`);
        revalidatePath(`/dashboard/products`);
        return { success: true };
    } catch (error) {
        console.error('Unlink supplier error:', error);
        return { success: false, error: 'Failed to unlink supplier' };
    }
}

/**
 * Get all products for a specific supplier
 */
export async function getSupplierProducts(supplierId: string) {
    try {
        const products = await prisma.supplierProduct.findMany({
            where: { supplierId },
            include: {
                productVariant: {
                    include: {
                        product: true,
                    },
                },
            },
            orderBy: {
                productVariant: {
                    name: 'asc',
                },
            },
        });
        return serializeData(products);
    } catch (error) {
        console.error('Get supplier products error:', error);
        return [];
    }
}

/**
 * Get all suppliers for a specific product variant
 */
export async function getProductSuppliers(productVariantId: string) {
    try {
        const suppliers = await prisma.supplierProduct.findMany({
            where: { productVariantId },
            include: {
                supplier: true,
            },
            orderBy: {
                isPreferred: 'desc',
            },
        });
        return serializeData(suppliers);
    } catch (error) {
        console.error('Get product suppliers error:', error);
        return [];
    }
}

/**
 * Set a preferred supplier for a product variant
 */
export async function setPreferredSupplier(id: string) {
    try {
        const item = await prisma.supplierProduct.findUnique({
            where: { id },
        });

        if (!item) {
            return { success: false, error: 'Link not found' };
        }

        await prisma.$transaction(async (tx) => {
            // Unset all preferred for this variant
            await tx.supplierProduct.updateMany({
                where: { productVariantId: item.productVariantId },
                data: { isPreferred: false },
            });

            // Set this one as preferred
            await tx.supplierProduct.update({
                where: { id },
                data: { isPreferred: true },
            });

            // Update legacy field
            await tx.productVariant.update({
                where: { id: item.productVariantId },
                data: { preferredSupplierId: item.supplierId },
            });
        });

        revalidatePath(`/dashboard/suppliers/${item.supplierId}`);
        revalidatePath(`/dashboard/products`);
        return { success: true };
    } catch (error) {
        console.error('Set preferred supplier error:', error);
        return { success: false, error: 'Failed to set preferred supplier' };
    }
}
