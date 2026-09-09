-- Additive indexes only; existing payments and statuses are not rewritten.
CREATE INDEX "BarterSettlement_status_id_idx" ON "BarterSettlement"("status", "id");
CREATE INDEX "BarterSettlement_status_barterDate_id_idx" ON "BarterSettlement"("status", "barterDate", "id");
CREATE INDEX "BarterSettlement_status_cashPaymentDate_id_idx" ON "BarterSettlement"("status", "cashPaymentDate", "id");
CREATE INDEX "Payment_paymentDate_id_idx" ON "Payment"("paymentDate", "id");
CREATE INDEX "Invoice_status_createdAt_id_idx" ON "Invoice"("status", "createdAt", "id");
CREATE INDEX "PurchaseInvoice_barter_selector_idx" ON "PurchaseInvoice"("purchaseOrderId", "status", "dueDate", "invoiceDate", "id");
