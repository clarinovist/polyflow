import { prisma } from "@/lib/prisma";
import { CreateInvoiceValues, UpdateInvoiceStatusValues } from "@/lib/schemas/invoice";
import { InvoiceStatus, JournalStatus } from "@prisma/client";
import { format, addDays } from "date-fns";
import { logActivity } from "@/lib/audit";
import { AutoJournalService } from "./finance/auto-journal-service";

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
            select: { id: true, totalAmount: true, orderNumber: true }
        });

        if (!salesOrder) {
            throw new Error("Sales Order not found");
        }

        if (!salesOrder.totalAmount) {
            throw new Error("Sales Order has no total amount");
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
            console.error("Auto-Journal failed for manual invoice:", err);
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
            select: { id: true, totalAmount: true, orderNumber: true }
        });

        if (!salesOrder || !salesOrder.totalAmount) return;

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
            console.error("Auto-Journal failed for automated invoice:", err);
        });

        return invoice;
    }
}
