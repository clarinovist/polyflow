'use server';

import { prisma } from '@/lib/prisma';
import { createCustomerSchema, updateCustomerSchema, CreateCustomerValues, UpdateCustomerValues } from '@/lib/schemas/partner';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-checks';

/**
 * Get all customers
 */
export async function getCustomers() {
    await requireAuth();
    return prisma.customer.findMany({
        orderBy: {
            name: 'asc',
        },
    });
}

/**
 * Get a single customer by ID
 */
export async function getCustomerById(id: string) {
    await requireAuth();
    return prisma.customer.findUnique({
        where: { id },
    });
}

/**
 * Generate the next available customer code (CUS-XXX format)
 */
export async function getNextCustomerCode(): Promise<string> {
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

/**
 * Create a new customer
 */
export async function createCustomer(data: CreateCustomerValues) {
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

        revalidatePath('/dashboard/customers');
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

/**
 * Update an existing customer
 */
export async function updateCustomer(data: UpdateCustomerValues) {
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

        revalidatePath('/dashboard/customers');
        revalidatePath(`/dashboard/customers/${data.id}`);
        return { success: true };
    } catch (error) {
        console.error('Update customer error:', error);
        return { success: false, error: 'Failed to update customer' };
    }
}

/**
 * Delete a customer
 */
export async function deleteCustomer(id: string) {
    await requireAuth();
    try {
        // Future: Check for references (e.g. Sales Orders)
        // const activeOrders = await prisma.salesOrder.count({ where: { customerId: id } });

        await prisma.customer.delete({
            where: { id },
        });

        revalidatePath('/dashboard/customers');
        return { success: true };
    } catch (error) {
        console.error('Delete customer error:', error);
        return { success: false, error: 'Failed to delete customer' };
    }
}
