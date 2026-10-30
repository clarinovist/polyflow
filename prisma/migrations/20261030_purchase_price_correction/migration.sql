CREATE TABLE "PurchasePriceCorrection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseOrderId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "oldUnitPrice" DECIMAL(15,4) NOT NULL,
    "newUnitPrice" DECIMAL(15,4) NOT NULL,
    "receiptAmount" DECIMAL(15,2) NOT NULL,
    "inventoryAmount" DECIMAL(15,2) NOT NULL,
    "varianceAmount" DECIMAL(15,2) NOT NULL,
    "billTotalDelta" DECIMAL(15,2) NOT NULL,
    "billNetDelta" DECIMAL(15,2) NOT NULL,
    "billTaxDelta" DECIMAL(15,2) NOT NULL,
    "locationAllocations" JSONB NOT NULL,
    "sourceEvidence" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "postingDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestSignature" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchasePriceCorrection_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchasePriceCorrection_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchasePriceCorrection_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchasePriceCorrection_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchasePriceCorrection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchasePriceCorrection_amounts_check" CHECK (
        "oldUnitPrice" > 0 AND "newUnitPrice" > 0 AND "oldUnitPrice" <> "newUnitPrice"
        AND "receiptAmount" <> 0
        AND "receiptAmount" = "inventoryAmount" + "varianceAmount"
        AND "billTotalDelta" = "billNetDelta" + "billTaxDelta"
    )
);
CREATE UNIQUE INDEX "PurchasePriceCorrection_idempotencyKey_key" ON "PurchasePriceCorrection"("idempotencyKey");
CREATE UNIQUE INDEX "PurchasePriceCorrection_journalId_key" ON "PurchasePriceCorrection"("journalId");
CREATE INDEX "PurchasePriceCorrection_purchaseOrderId_createdAt_idx" ON "PurchasePriceCorrection"("purchaseOrderId", "createdAt");
CREATE INDEX "PurchasePriceCorrection_purchaseOrderItemId_idx" ON "PurchasePriceCorrection"("purchaseOrderItemId");
CREATE INDEX "PurchasePriceCorrection_invoiceId_postingDate_idx" ON "PurchasePriceCorrection"("invoiceId", "postingDate");
CREATE INDEX "PurchasePriceCorrection_createdById_idx" ON "PurchasePriceCorrection"("createdById");

-- Append-only corrections and their revaluation journals retain the original evidence.
CREATE FUNCTION guard_purchase_price_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'PurchasePriceCorrection' THEN
        RAISE EXCEPTION 'Riwayat koreksi harga pembelian tidak dapat diubah atau dihapus';
    ELSIF TG_TABLE_NAME = 'JournalEntry' THEN
        IF EXISTS (SELECT 1 FROM "PurchasePriceCorrection" WHERE "journalId" = OLD.id) THEN
            RAISE EXCEPTION 'Jurnal koreksi harga pembelian tidak dapat diubah atau dihapus';
        END IF;
    ELSE
        IF TG_OP <> 'INSERT' THEN
            IF EXISTS (SELECT 1 FROM "PurchasePriceCorrection" WHERE "journalId" = OLD."journalEntryId") THEN
                RAISE EXCEPTION 'Baris jurnal koreksi harga pembelian tidak dapat diubah atau dihapus';
            END IF;
        END IF;
        IF TG_OP <> 'DELETE' THEN
            IF EXISTS (SELECT 1 FROM "PurchasePriceCorrection" WHERE "journalId" = NEW."journalEntryId") THEN
                RAISE EXCEPTION 'Baris jurnal koreksi harga pembelian tidak dapat ditambahkan atau dipindahkan';
            END IF;
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER purchase_price_history BEFORE UPDATE OR DELETE ON "PurchasePriceCorrection"
    FOR EACH ROW EXECUTE FUNCTION guard_purchase_price_history();
CREATE TRIGGER purchase_price_journal_history BEFORE UPDATE OR DELETE ON "JournalEntry"
    FOR EACH ROW EXECUTE FUNCTION guard_purchase_price_history();
CREATE TRIGGER purchase_price_line_history BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine"
    FOR EACH ROW EXECUTE FUNCTION guard_purchase_price_history();
