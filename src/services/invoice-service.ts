import { prisma } from "@/lib/prisma";
import { CreateInvoiceValues, UpdateInvoiceStatusValues } from "@/lib/schemas/invoice";
import { InvoiceStatus } from "@prisma/client";
import { format } from "date-fns";
import { logActivity } from "@/lib/audit";

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
        const { salesOrderId, invoiceDate, dueDate, notes } = data;

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
                dueDate,
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
    }
}
