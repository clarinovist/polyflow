'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { createCustomerSchema, updateCustomerSchema, CreateCustomerValues, UpdateCustomerValues } from '@/lib/schemas/partner';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/tools/auth-checks';

export const getCustomers = withTenant(
async function getCustomers() {
    await requireAuth();
    return prisma.customer.findMany({
        orderBy: {
            name: 'asc',
        },
    });
}
);

export const getCustomerById = withTenant(
async function getCustomerById(id: string) {
    await requireAuth();
    return prisma.customer.findUnique({
        where: { id },
    });
}
);

export const getNextCustomerCode = withTenant(
async function getNextCustomerCode(): Promise<string> {
    await requireAuth();
    const prefix = 'CUS-';

    // Find the highest existing code with this prefix
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
    await requireAuth();
    const result = createCustomerSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        // Auto-generate code if not provided
        let code = result.data.code?.trim();
        if (!code) {
            code = await getNextCustomerCode();

            // Retry loop to handle race conditions (max 5 attempts)
            let attempts = 0;
            while (attempts < 5) {
                const exists = await prisma.customer.findUnique({
                    where: { code },
                    select: { id: true },
                });

                if (!exists) break;

                // Code exists, increment and try again
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
        return { success: true };
    } catch (error) {
        console.error('Create customer error:', error);
        // Check for unique constraint violation
        if (error instanceof Error && error.message.includes('Unique constraint')) {
            return { success: false, error: 'Customer code already exists' };
        }
        return { success: false, error: 'Failed to create customer' };
    }
}
);

export const updateCustomer = withTenant(
async function updateCustomer(data: UpdateCustomerValues) {
    await requireAuth();
    const result = updateCustomerSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await prisma.customer.update({
            where: { id: data.id },
            data: result.data,
        });

        revalidatePath('/sales/customers');
        revalidatePath(`/sales/customers/${data.id}`);
        return { success: true };
    } catch (error) {
        console.error('Update customer error:', error);
        return { success: false, error: 'Failed to update customer' };
    }
}
);

export const deleteCustomer = withTenant(
async function deleteCustomer(id: string) {
    await requireAuth();
    try {
        // Future: Check for references (e.g. Sales Orders)
        // const activeOrders = await prisma.salesOrder.count({ where: { customerId: id } });

        await prisma.customer.delete({
            where: { id },
        });

        revalidatePath('/sales/customers');
        return { success: true };
    } catch (error) {
        console.error('Delete customer error:', error);
        return { success: false, error: 'Failed to delete customer' };
    }
}
);
