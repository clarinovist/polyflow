'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { createCustomerSchema, updateCustomerSchema, CreateCustomerValues, UpdateCustomerValues } from '@/lib/schemas/partner';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { getCustomerCreditExposure, getCustomersWithCreditSummary } from '@/services/sales/credit-service';

export const getCustomers = withTenant(
async function getCustomers() {
    return safeAction(async () => {
        await requireAuth();
        return prisma.customer.findMany({
            orderBy: {
                name: 'asc',
            },
        });
    });
}
);

export const getCustomerById = withTenant(
async function getCustomerById(id: string) {
    return safeAction(async () => {
        await requireAuth();
        return prisma.customer.findUnique({
            where: { id },
        });
    });
}
);

export const getNextCustomerCode = withTenant(
async function getNextCustomerCode(): Promise<string> {
    await requireAuth();
    const prefix = 'CUS-';

    const lastCustomer = await prisma.customer.findFirst({
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

    if (lastCustomer?.code) {
        const numPart = lastCustomer.code.substring(prefix.length);
        const parsed = parseInt(numPart, 10);
        if (!isNaN(parsed)) {
            nextNumber = parsed + 1;
        }
    }

    return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
}
);

export const createCustomer = withTenant(
async function createCustomer(data: CreateCustomerValues) {
    return safeAction(async () => {
        await requireAuth();
        const result = createCustomerSchema.safeParse(data);

        if (!result.success) {
            throw new BusinessRuleError(result.error.issues[0].message);
        }

        try {
            let code = result.data.code?.trim();
            if (!code) {
                code = await getNextCustomerCode();

                let attempts = 0;
                while (attempts < 5) {
                    const exists = await prisma.customer.findUnique({
                        where: { code },
                        select: { id: true },
                    });

                    if (!exists) break;

                    const numPart = parseInt(code.substring(4), 10);
                    code = `CUS-${(numPart + 1).toString().padStart(3, '0')}`;
                    attempts++;
                }
            }

            await prisma.customer.create({
                data: {
                    ...result.data,
                    code,
                },
            });

            revalidatePath('/sales/customers');
            return null;
        } catch (error) {
            logger.error('Failed to create customer', { error, module: 'CustomerActions' });
            if (error instanceof Error && error.message.includes('Unique constraint')) {
                throw new BusinessRuleError('Customer code already exists');
            }
            throw new BusinessRuleError('Failed to create customer');
        }
    });
}
);

export const updateCustomer = withTenant(
async function updateCustomer(data: UpdateCustomerValues) {
    return safeAction(async () => {
        await requireAuth();
        const result = updateCustomerSchema.safeParse(data);

        if (!result.success) {
            throw new BusinessRuleError(result.error.issues[0].message);
        }

        try {
            await prisma.customer.update({
                where: { id: data.id },
                data: result.data,
            });

            revalidatePath('/sales/customers');
            revalidatePath(`/sales/customers/${data.id}`);
            return null;
        } catch (error) {
            logger.error('Failed to update customer', { error, customerId: data.id, module: 'CustomerActions' });
            throw new BusinessRuleError('Failed to update customer');
        }
    });
}
);

/**
 * Quick-create customer with minimal fields (for mobile sales flow).
 * Returns the created customer object so the caller can immediately use it.
 */
export const quickCreateCustomer = withTenant(
async function quickCreateCustomer(data: { name: string; phone?: string; billingAddress?: string }) {
    return safeAction(async () => {
        await requireAuth();

        if (!data.name.trim()) {
            throw new BusinessRuleError('Nama customer wajib diisi');
        }

        const code = await getNextCustomerCode();

        const customer = await prisma.customer.create({
            data: {
                name: data.name.trim(),
                code,
                phone: data.phone?.trim() || null,
                billingAddress: data.billingAddress?.trim() || null,
            },
        });

        revalidatePath('/sales/mobile');
        return {
            id: customer.id,
            name: customer.name,
            code: customer.code,
            creditLimit: null as number | null,
            paymentTermDays: null as number | null,
        };
    });
}
);

export const deleteCustomer = withTenant(
async function deleteCustomer(id: string) {
    return safeAction(async () => {
        await requireAuth();
        try {
            await prisma.customer.delete({
                where: { id },
            });

            revalidatePath('/sales/customers');
            return null;
        } catch (error) {
            logger.error('Failed to delete customer', { error, customerId: id, module: 'CustomerActions' });
            throw new BusinessRuleError('Failed to delete customer');
        }
    });
}
);

export const getCustomerCreditExposureAction = withTenant(
async function getCustomerCreditExposureAction(customerId: string) {
    return safeAction(async () => {
        await requireAuth();
        return getCustomerCreditExposure(customerId);
    });
}
);

export const getCustomersWithCreditSummaryAction = withTenant(
async function getCustomersWithCreditSummaryAction() {
    return safeAction(async () => {
        await requireAuth();
        return getCustomersWithCreditSummary();
    });
}
);
