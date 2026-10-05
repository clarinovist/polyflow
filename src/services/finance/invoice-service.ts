import {
    CreateInvoiceValues,
    UpdateInvoiceStatusValues,
} from '@/lib/schemas/invoice';

import {
    createDraftInvoiceFromOrder,
    createInvoice,
    generateInvoiceNumber,
    updateInvoiceStatus,
    updateSalesInvoiceDueDate,
} from './invoice-lifecycle-service';
import { checkOverdueSalesInvoices } from './invoice-overdue-service';

export class InvoiceService {
    static async generateInvoiceNumber(
        refDate?: Date,
    ): Promise<string> {
        return generateInvoiceNumber(refDate);
    }

    static async createInvoice(data: CreateInvoiceValues, userId: string) {
        return createInvoice(data, userId);
    }

    static async updateStatus(data: UpdateInvoiceStatusValues, userId: string) {
        return updateInvoiceStatus(data, userId);
    }

    static async updateSalesInvoiceDueDate(
        id: string,
        data: {
            dueDate?: Date;
            termOfPaymentDays?: number;
        },
        userId: string,
    ) {
        return updateSalesInvoiceDueDate(id, data, userId);
    }

    static async createDraftInvoiceFromOrder(
        salesOrderId: string,
        userId: string,
        opts?: { invoiceDate?: Date },
    ) {
        return createDraftInvoiceFromOrder(salesOrderId, userId, opts);
    }

    static async checkOverdueSalesInvoices() {
        return checkOverdueSalesInvoices();
    }
}
