import { prisma } from "@/lib/core/prisma";
import { CreateInvoiceValues, UpdateInvoiceStatusValues } from "@/lib/schemas/invoice";
import { InvoiceStatus, JournalStatus, NotificationType } from "@prisma/client";
import { format, addDays } from "date-fns";
import { logActivity } from "@/lib/tools/audit";
import { AutoJournalService } from "./auto-journal-service";
import { logger } from "@/lib/config/logger";

export class InvoiceService {

    /**
     * Generate a new unique invoice number
     * Format: INV-YYYYMMDD-XXXX
     */
    static async generateInvoiceNumber(): Promise<string> {
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

    /**
     * Create a new invoice from a Sales Order
     */
    static async createInvoice(data: CreateInvoiceValues, userId: string) {
        const { salesOrderId, invoiceDate, dueDate, termOfPaymentDays, notes } = data;

        const finalDueDate = dueDate || addDays(invoiceDate, termOfPaymentDays || 0);

        const salesOrder = await prisma.salesOrder.findUnique({
            where: { id: salesOrderId },
            select: { id: true, totalAmount: true, orderNumber: true, customerId: true }
        });

        if (!salesOrder) {
            throw new Error("Sales Order not found");
        }

        if (!salesOrder.totalAmount) {
            throw new Error("Sales Order has no total amount");
        }

        if (!salesOrder.customerId) {
            throw new Error("Cannot create invoice for a Sales Order without customer. Complete the customer first, or use Production Order for internal stock build.");
        }

        const invoiceNumber = await this.generateInvoiceNumber();

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

        // Trigger Auto-Journaling
        await AutoJournalService.handleSalesInvoiceCreated(invoice.id).catch(err => {
            logger.error("Failed to generate auto-journal for invoice", { error: err, invoiceId: invoice.id, module: 'FinanceInvoiceService' });
        });

        return invoice;
    }

    /**
     * Update invoice status (e.g. record payment)
     */
    static async updateStatus(data: UpdateInvoiceStatusValues, userId: string) {
        const { id, status, paidAmount } = data;

        const invoice = await prisma.invoice.findUnique({
            where: { id }
        });

        if (!invoice) throw new Error("Invoice not found");

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

        // Sync Journal Entry Status
        // If Invoice is finalized (UNPAID/PAID/OVERDUE), POST the journal.
        // If Invoice is VOID/CANCELLED, VOID the journal.
        // If Invoice is DRAFT, revert journal to DRAFT.

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

    /**
     * Automatically create a DRAFT invoice from a Sales Order when shipped
     */
    static async createDraftInvoiceFromOrder(salesOrderId: string, userId: string) {
        const salesOrder = await prisma.salesOrder.findUnique({
            where: { id: salesOrderId },
            select: { id: true, totalAmount: true, orderNumber: true, customerId: true }
        });

        if (!salesOrder || !salesOrder.totalAmount || !salesOrder.customerId) return;

        // Check if invoice already exists to avoid duplicates
        const existingInvoice = await prisma.invoice.findFirst({
            where: { salesOrderId }
        });
        if (existingInvoice) return;

        const invoiceNumber = await this.generateInvoiceNumber();

        // Standard 30 days due date for draft
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

        // Auto-Journaling Trigger
        await AutoJournalService.handleSalesInvoiceCreated(invoice.id).catch(err => {
            logger.error("Failed to generate auto-journal for invoice", { error: err, invoiceId: invoice.id, module: 'FinanceInvoiceService' });
        });

        return invoice;
    }

    /**
     * Check for Overdue AR (Accounts Receivable)
     * To be triggered by daily cron jobs
     */
    static async checkOverdueSalesInvoices() {
        const { NotificationService } = await import('@/services/core/notification-service');
        const overdueInvoices = await prisma.invoice.findMany({
            where: {
                dueDate: { lt: new Date() },
                status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] }
            },
            include: { salesOrder: { select: { orderNumber: true } } }
        });

        if (overdueInvoices.length === 0) return;

        const targetUsers = await prisma.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true }
        });

        if (targetUsers.length > 0) {
            const inputs = overdueInvoices.map(inv => {
                return targetUsers.map(u => ({
                    userId: u.id,
                    type: 'OVERDUE_AR' as NotificationType,
                    title: 'Overdue Sales Invoice',
                    message: `Customer Invoice ${inv.invoiceNumber} is overdue since ${inv.dueDate?.toLocaleDateString() || 'Unknown'}. Outstanding: ${inv.totalAmount.toNumber() - inv.paidAmount.toNumber()}`,
                    link: `/admin/sales/invoices/${inv.id}`,
                    entityType: 'Invoice',
                    entityId: inv.id
                }));
            }).flat();

            await NotificationService.createBulkNotifications(inputs);
        }
    }
}
