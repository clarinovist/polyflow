
import {
    handlePurchaseInvoiceCreated,
    handleSalesInvoiceCreated,
} from './auto-journal-invoice-handlers';
import {
    handlePurchasePayment,
    handleSalesPayment,
} from './auto-journal-payment-handlers';
import {
    handlePurchaseReturnShipped,
    handleSalesReturnReceived,
} from './auto-journal-return-handlers';

export class AutoJournalService {
    static async handleSalesInvoiceCreated(invoiceId: string) {
        return handleSalesInvoiceCreated(invoiceId);
    }

    static async handlePurchaseInvoiceCreated() {
        return handlePurchaseInvoiceCreated();
    }

    static async handleSalesPayment(paymentId: string, amount: number, method: string = 'Bank Transfer') {
        return handleSalesPayment(paymentId, amount, method);
    }

    static async handlePurchasePayment(paymentId: string, amount: number, method: string = 'Bank Transfer') {
        return handlePurchasePayment(paymentId, amount, method);
    }

    static async handleSalesReturnReceived(returnId: string) {
        return handleSalesReturnReceived(returnId);
    }

    static async handlePurchaseReturnShipped(returnId: string) {
        return handlePurchaseReturnShipped(returnId);
    }

    // DELEGATED: Auto-journaling for material issues is handled directly via AccountingService.recordInventoryMovement.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static async handleMaterialIssue(issueId: string) {
        return;
    }

    // DELEGATED: Auto-journaling for production output is handled directly via AccountingService.recordInventoryMovement.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static async handleProductionOutput(executionId: string) {
        return;
    }

    // DELEGATED: Auto-journaling for scrap output is handled directly via AccountingService.recordInventoryMovement.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static async handleScrapOutput(scrapId: string) {
        return;
    }

    // DELEGATED: Auto-journaling for general stock movements is handled directly via AccountingService.recordInventoryMovement.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static async handleStockMovement(movementId: string) {
        return;
    }
}
