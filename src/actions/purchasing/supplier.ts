'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { createSupplierSchema, updateSupplierSchema, CreateSupplierValues, UpdateSupplierValues } from '@/lib/schemas/partner';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';

export const getSuppliers = withTenant(
async function getSuppliers() {
    return safeAction(async () => {
        await requireAuth();
        return prisma.supplier.findMany({
            orderBy: {
                name: 'asc',
            },
        });
    });
}
);

export const getSupplierById = withTenant(
async function getSupplierById(id: string) {
    return safeAction(async () => {
        await requireAuth();
        return prisma.supplier.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        supplierProducts: true,
                    }
                }
            }
        });
    });
}
);

export const getNextSupplierCode = withTenant(
async function getNextSupplierCode(): Promise<string> {
    await requireAuth();
    const prefix = 'SUP-';

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
);

export const createSupplier = withTenant(
async function createSupplier(data: CreateSupplierValues) {
    return safeAction(async () => {
        await requireAuth();
        const result = createSupplierSchema.safeParse(data);

        if (!result.success) {
            throw new BusinessRuleError(result.error.issues[0].message);
        }

        try {
            let code = result.data.code?.trim();
            if (!code) {
                code = await getNextSupplierCode();

                let attempts = 0;
                while (attempts < 5) {
                    const exists = await prisma.supplier.findUnique({
                        where: { code },
                        select: { id: true },
                    });

                    if (!exists) break;

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

            revalidatePath('/planning/suppliers');
            return null;
        } catch (error) {
            logger.error('Failed to create supplier', { error, module: 'SupplierActions' });
            if (error instanceof Error && error.message.includes('Unique constraint')) {
                throw new BusinessRuleError('Supplier code already exists');
            }
            throw new BusinessRuleError('Failed to create supplier');
        }
    });
}
);

export const updateSupplier = withTenant(
async function updateSupplier(data: UpdateSupplierValues) {
    return safeAction(async () => {
        await requireAuth();
        const result = updateSupplierSchema.safeParse(data);

        if (!result.success) {
            throw new BusinessRuleError(result.error.issues[0].message);
        }

        try {
            await prisma.supplier.update({
                where: { id: data.id },
                data: result.data,
            });

            revalidatePath('/planning/suppliers');
            revalidatePath(`/planning/suppliers/${data.id}`);
            return null;
        } catch (error) {
            logger.error('Failed to update supplier', { error, supplierId: data.id, module: 'SupplierActions' });
            throw new BusinessRuleError('Failed to update supplier');
        }
    });
}
);

export const deleteSupplier = withTenant(
async function deleteSupplier(id: string) {
    return safeAction(async () => {
        await requireAuth();
        try {
            const checks = await Promise.all([
                prisma.supplierProduct.count({ where: { supplierId: id } }),
                prisma.productVariant.count({ where: { preferredSupplierId: id } }),
            ]);

            const [productCount, preferredCount] = checks;

            if (productCount > 0 || preferredCount > 0) {
                throw new BusinessRuleError(`Cannot delete supplier. It is used in ${productCount} products and is preferred for ${preferredCount} variants.`);
            }

            await prisma.supplier.delete({
                where: { id },
            });

            revalidatePath('/planning/suppliers');
            return null;
        } catch (error) {
            if (error instanceof BusinessRuleError) throw error;
            logger.error('Failed to delete supplier', { error, supplierId: id, module: 'SupplierActions' });
            throw new BusinessRuleError('Failed to delete supplier');
        }
    });
}
);
