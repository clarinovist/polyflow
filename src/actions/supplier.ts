'use server';

import { prisma } from '@/lib/prisma';
import { createSupplierSchema, updateSupplierSchema, CreateSupplierValues, UpdateSupplierValues } from '@/lib/schemas/partner';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-checks';

/**
 * Get all suppliers
 */
export async function getSuppliers() {
    await requireAuth();
    return prisma.supplier.findMany({
        orderBy: {
            name: 'asc',
        },
    });
}

/**
 * Get a single supplier by ID
 */
export async function getSupplierById(id: string) {
    await requireAuth();
    return prisma.supplier.findUnique({
        where: { id },
        include: {
            // Include counting of related items if useful
            _count: {
                select: {
                    supplierProducts: true,
                }
            }
        }
    });
}

/**
 * Generate the next available supplier code (SUP-XXX format)
 */
export async function getNextSupplierCode(): Promise<string> {
    await requireAuth();
    const prefix = 'SUP-';

    // Find the highest existing code with this prefix
    const lastSupplier = await prisma.supplier.findFirst({
        where: {
            code: {
                startsWith: prefix,
            },
        },
        orderBy: {
            code: 'desc',
        },
        select: {
            code: true,
        },
    });

    let nextNumber = 1;

    if (lastSupplier?.code) {
        const numPart = lastSupplier.code.substring(prefix.length);
        const parsed = parseInt(numPart, 10);
        if (!isNaN(parsed)) {
            nextNumber = parsed + 1;
        }
    }

    return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
}

/**
 * Create a new supplier
 */
export async function createSupplier(data: CreateSupplierValues) {
    await requireAuth();
    const result = createSupplierSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        // Auto-generate code if not provided
        let code = result.data.code?.trim();
        if (!code) {
            code = await getNextSupplierCode();

            // Retry loop to handle race conditions (max 5 attempts)
            let attempts = 0;
            while (attempts < 5) {
                const exists = await prisma.supplier.findUnique({
                    where: { code },
                    select: { id: true },
                });

                if (!exists) break;

                // Code exists, increment and try again
                const numPart = parseInt(code.substring(4), 10);
                code = `SUP-${(numPart + 1).toString().padStart(3, '0')}`;
                attempts++;
            }
        }

        await prisma.supplier.create({
            data: {
                ...result.data,
                code,
            },
        });

        revalidatePath('/dashboard/suppliers');
        return { success: true };
    } catch (error) {
        console.error('Create supplier error:', error);
        // Check for unique constraint violation
        if (error instanceof Error && error.message.includes('Unique constraint')) {
            return { success: false, error: 'Supplier code already exists' };
        }
        return { success: false, error: 'Failed to create supplier' };
    }
}

/**
 * Update an existing supplier
 */
export async function updateSupplier(data: UpdateSupplierValues) {
    await requireAuth();
    const result = updateSupplierSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await prisma.supplier.update({
            where: { id: data.id },
            data: result.data,
        });

        revalidatePath('/dashboard/suppliers');
        revalidatePath(`/dashboard/suppliers/${data.id}`);
        return { success: true };
    } catch (error) {
        console.error('Update supplier error:', error);
        return { success: false, error: 'Failed to update supplier' };
    }
}

/**
 * Delete a supplier
 */
export async function deleteSupplier(id: string) {
    await requireAuth();
    try {
        // Check for references before deleting
        const checks = await Promise.all([
            prisma.supplierProduct.count({ where: { supplierId: id } }),
            prisma.productVariant.count({ where: { preferredSupplierId: id } }),
        ]);

        const [productCount, preferredCount] = checks;

        if (productCount > 0 || preferredCount > 0) {
            return {
                success: false,
                error: `Cannot delete supplier. It is used in ${productCount} products and is preferred for ${preferredCount} variants.`,
            };
        }

        await prisma.supplier.delete({
            where: { id },
        });

        revalidatePath('/dashboard/suppliers');
        return { success: true };
    } catch (error) {
        console.error('Delete supplier error:', error);
        return { success: false, error: 'Failed to delete supplier' };
    }
}
