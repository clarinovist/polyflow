'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/tools/auth-checks';
import { InvoiceService } from '@/services/finance/invoice-service';
import { createInvoiceSchema, updateInvoiceStatusSchema, CreateInvoiceValues } from '@/lib/schemas/invoice';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils/utils';
import { AutoJournalService } from '@/services/finance/auto-journal-service';
import { logger } from '@/lib/config/logger';

export const getInvoices = withTenant(
async function getInvoices(dateRange?: { startDate?: Date, endDate?: Date }) {
    await requireAuth();
    const where: Prisma.InvoiceWhereInput = {};
    if (dateRange?.startDate && dateRange?.endDate) {
        where.invoiceDate = {
            gte: dateRange.startDate,
            lte: dateRange.endDate
        };
    }

    const invoices = await prisma.invoice.findMany({
        where,
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
    return serializeData(invoices);
}
);

export const getInvoiceById = withTenant(
async function getInvoiceById(id: string) {
    await requireAuth();
    const invoice = await prisma.invoice.findUnique({
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
    return serializeData(invoice);
}
);

export const createInvoice = withTenant(
async function createInvoice(data: CreateInvoiceValues) {
    const session = await requireAuth();
    const result = createInvoiceSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        const invoice = await InvoiceService.createInvoice(result.data, session.user.id);

        // Auto-Journaling Trigger
        await AutoJournalService.handleSalesInvoiceCreated(invoice.id).catch(error => {
            logger.error('Auto-Journal failed for sales invoice', { error, invoiceId: invoice.id, module: 'AutoJournalService' });
        });

        revalidatePath('/sales'); // Refresh sales to update invoice status if any
        revalidatePath(`/sales/orders/${data.salesOrderId}`);
        return { success: true, data: serializeData(invoice) };
    } catch (error) {
        logger.error('Failed to create invoice', { error, module: 'InvoiceActions' });
        return { success: false, error: 'Failed to create invoice. Please try again.' };
    }
}
);

export const updateInvoiceStatus = withTenant(
async function updateInvoiceStatus(data: { id: string, status: InvoiceStatus, paidAmount?: number }) {
    const session = await requireAuth();
    const result = updateInvoiceStatusSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await InvoiceService.updateStatus(result.data, session.user.id);
        revalidatePath('/sales'); // If there were an invoice list page, verify path
        const invoice = await prisma.invoice.findUnique({ where: { id: data.id }, select: { salesOrderId: true } });
        if (invoice) {
            revalidatePath(`/sales/orders/${invoice.salesOrderId}`);
        }

        // Auto-Journal: Sales Payment
        if (data.paidAmount && data.paidAmount > 0) {
            await AutoJournalService.handleSalesPayment(data.id, data.paidAmount).catch(error => {
                logger.error('Auto-Journal failed for sales payment', { error, invoiceId: data.id, module: 'AutoJournalService' });
            });
        }

        return { success: true };
    } catch (error) {
        logger.error('Failed to update invoice status', { error, invoiceId: data.id, module: 'InvoiceActions' });
        return { success: false, error: 'Failed to update invoice. Please try again.' };
    }
}
);
