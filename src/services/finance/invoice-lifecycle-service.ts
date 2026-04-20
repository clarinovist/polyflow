import { addDays, format } from 'date-fns';
import { InvoiceStatus, JournalStatus } from '@prisma/client';

import { prisma } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';
import { CreateInvoiceValues, UpdateInvoiceStatusValues } from '@/lib/schemas/invoice';
import { logActivity } from '@/lib/tools/audit';

import { AutoJournalService } from './auto-journal-service';

export async function generateInvoiceNumber(): Promise<string> {
    const dateStr = format(new Date(), 'yyyyMMdd');
    const prefix = `INV-${dateStr}-`;

    const lastInvoice = await prisma.invoice.findFirst({
        where: { invoiceNumber: { startsWith: prefix } },
        orderBy: { invoiceNumber: 'desc' },
    });

    let nextSequence = 1;
    if (lastInvoice) {
        const parts = lastInvoice.invoiceNumber.split('-');
        const lastSeq = parseInt(parts[2]);
        if (!isNaN(lastSeq)) {
            nextSequence = lastSeq + 1;
        }
    }

    return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
}

export async function createInvoice(data: CreateInvoiceValues, userId: string) {
    const { salesOrderId, invoiceDate, dueDate, termOfPaymentDays, notes } = data;

    const finalDueDate = dueDate || addDays(invoiceDate, termOfPaymentDays || 0);

    const salesOrder = await prisma.salesOrder.findUnique({
        where: { id: salesOrderId },
        select: { id: true, totalAmount: true, orderNumber: true, customerId: true }
    });

    if (!salesOrder) {
        throw new Error('Sales Order not found');
    }

    if (!salesOrder.totalAmount) {
        throw new Error('Sales Order has no total amount');
    }

    if (!salesOrder.customerId) {
        throw new Error('Cannot create invoice for a Sales Order without customer. Complete the customer first, or use Production Order for internal stock build.');
    }

    const invoiceNumber = await generateInvoiceNumber();

    const invoice = await prisma.invoice.create({
        data: {
            invoiceNumber,
            salesOrderId,
            invoiceDate,
            dueDate: finalDueDate,
            termOfPaymentDays: termOfPaymentDays || 0,
            totalAmount: salesOrder.totalAmount,
            paidAmount: 0,
            status: InvoiceStatus.UNPAID,
            notes
        }
    });

    await logActivity({
        userId,
        action: 'CREATE_INVOICE',
        entityType: 'Invoice',
        entityId: invoice.id,
        details: `Invoice ${invoiceNumber} created for Order ${salesOrder.orderNumber}`
    });

    await AutoJournalService.handleSalesInvoiceCreated(invoice.id).catch(error => {
        logger.error('Failed to generate auto-journal for invoice', { error, invoiceId: invoice.id, module: 'FinanceInvoiceService' });
    });

    return invoice;
}

export async function updateInvoiceStatus(data: UpdateInvoiceStatusValues, userId: string) {
    const { id, status, paidAmount } = data;

    const invoice = await prisma.invoice.findUnique({
        where: { id }
    });

    if (!invoice) {
        throw new Error('Invoice not found');
    }

    await prisma.invoice.update({
        where: { id },
        data: {
            status,
            ...(paidAmount !== undefined && { paidAmount }),
        }
    });

    await logActivity({
        userId,
        action: 'UPDATE_INVOICE',
        entityType: 'Invoice',
        entityId: id,
        details: `Invoice ${invoice.invoiceNumber} status updated to ${status}`
    });

    let journalStatus: JournalStatus | undefined;

    switch (status) {
        case 'UNPAID':
        case 'PAID':
        case 'PARTIAL':
        case 'OVERDUE':
            journalStatus = JournalStatus.POSTED;
            break;
        case 'CANCELLED':
            journalStatus = JournalStatus.VOIDED;
            break;
        case 'DRAFT':
            journalStatus = JournalStatus.DRAFT;
            break;
    }

    if (journalStatus) {
        await prisma.journalEntry.updateMany({
            where: {
                referenceId: id,
                referenceType: 'SALES_INVOICE'
            },
            data: {
                status: journalStatus
            }
        });
    }
}

export async function createDraftInvoiceFromOrder(salesOrderId: string, userId: string) {
    const salesOrder = await prisma.salesOrder.findUnique({
        where: { id: salesOrderId },
        select: { id: true, totalAmount: true, orderNumber: true, customerId: true }
    });

    if (!salesOrder || !salesOrder.totalAmount || !salesOrder.customerId) {
        return;
    }

    const existingInvoice = await prisma.invoice.findFirst({
        where: { salesOrderId }
    });
    if (existingInvoice) {
        return;
    }

    const invoiceNumber = await generateInvoiceNumber();
    const invoiceDate = new Date();
    const dueDate = addDays(invoiceDate, 30);

    const invoice = await prisma.invoice.create({
        data: {
            invoiceNumber,
            salesOrderId,
            invoiceDate,
            dueDate,
            termOfPaymentDays: 30,
            totalAmount: salesOrder.totalAmount,
            paidAmount: 0,
            status: InvoiceStatus.DRAFT,
            notes: `System generated draft invoice for Order ${salesOrder.orderNumber}`
        }
    });

    await logActivity({
        userId,
        action: 'AUTO_GENERATE_INVOICE',
        entityType: 'Invoice',
        entityId: invoice.id,
        details: `Automated draft invoice ${invoiceNumber} generated for shipped Order ${salesOrder.orderNumber}`
    });

    await AutoJournalService.handleSalesInvoiceCreated(invoice.id).catch(error => {
        logger.error('Failed to generate auto-journal for invoice', { error, invoiceId: invoice.id, module: 'FinanceInvoiceService' });
    });

    return invoice;
}