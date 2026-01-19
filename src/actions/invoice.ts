'use server';

import { prisma } from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';
import { requireAuth } from '@/lib/auth-checks';
import { InvoiceService } from '@/services/invoice-service';
import { createInvoiceSchema, updateInvoiceStatusSchema, CreateInvoiceValues } from '@/lib/schemas/invoice';
import { revalidatePath } from 'next/cache';

/**
 * Get all invoices
 */
export async function getInvoices() {
    await requireAuth();
    return await prisma.invoice.findMany({
        include: {
            salesOrder: {
                select: {
                    orderNumber: true,
                    customer: { select: { name: true } }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
}

/**
 * Get invoice by ID
 */
export async function getInvoiceById(id: string) {
    await requireAuth();
    return await prisma.invoice.findUnique({
        where: { id },
        include: {
            salesOrder: {
                include: {
                    customer: true,
                    items: {
                        include: {
                            productVariant: {
                                include: { product: true }
                            }
                        }
                    }
                }
            }
        }
    });
}

/**
 * Create a new invoice
 */
export async function createInvoice(data: CreateInvoiceValues) {
    const session = await requireAuth();
    const result = createInvoiceSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        const invoice = await InvoiceService.createInvoice(result.data, session.user.id);
        revalidatePath('/dashboard/sales'); // Refresh sales to update invoice status if any
        revalidatePath(`/dashboard/sales/${data.salesOrderId}`);
        return { success: true, data: invoice };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to create invoice" };
    }
}

/**
 * Update invoice status
 */
export async function updateInvoiceStatus(data: { id: string, status: InvoiceStatus, paidAmount?: number }) {
    const session = await requireAuth();
    const result = updateInvoiceStatusSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await InvoiceService.updateStatus(result.data, session.user.id);
        revalidatePath('/dashboard/sales'); // If there were an invoice list page, verify path
        const invoice = await prisma.invoice.findUnique({ where: { id: data.id }, select: { salesOrderId: true } });
        if (invoice) {
            revalidatePath(`/dashboard/sales/${invoice.salesOrderId}`);
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to update invoice" };
    }
}
