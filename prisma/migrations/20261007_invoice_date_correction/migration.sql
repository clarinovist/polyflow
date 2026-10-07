CREATE TABLE "InvoiceDateCorrection" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "oldInvoiceNumber" TEXT NOT NULL,
    "newInvoiceNumber" TEXT NOT NULL,
    "oldInvoiceDate" TIMESTAMP(3) NOT NULL,
    "newInvoiceDate" TIMESTAMP(3) NOT NULL,
    "oldDueDate" TIMESTAMP(3),
    "newDueDate" TIMESTAMP(3) NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "oldJournalDate" TIMESTAMP(3) NOT NULL,
    "newJournalDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "correctedById" TEXT NOT NULL,
    "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceDateCorrection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceDateCorrection_invoiceId_key"
    ON "InvoiceDateCorrection"("invoiceId");
CREATE INDEX "InvoiceDateCorrection_correctedAt_idx"
    ON "InvoiceDateCorrection"("correctedAt");
ALTER TABLE "InvoiceDateCorrection"
    ADD CONSTRAINT "InvoiceDateCorrection_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_invoice_date_correction_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Invoice date correction history is immutable';
END $$;
CREATE TRIGGER invoice_date_correction_history
    BEFORE UPDATE OR DELETE ON "InvoiceDateCorrection"
    FOR EACH ROW EXECUTE FUNCTION guard_invoice_date_correction_history();

CREATE OR REPLACE FUNCTION allow_audited_invoice_date_correction(
    old_row "Invoice",
    new_row "Invoice"
) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM "InvoiceDateCorrection" c
        WHERE c."invoiceId" = old_row.id
          AND c."oldInvoiceNumber" = old_row."invoiceNumber"
          AND c."newInvoiceNumber" = new_row."invoiceNumber"
          AND c."oldInvoiceDate" = old_row."invoiceDate"
          AND c."newInvoiceDate" = new_row."invoiceDate"
          AND c."oldDueDate" IS NOT DISTINCT FROM old_row."dueDate"
          AND c."newDueDate" = new_row."dueDate"
          AND new_row.id = old_row.id
          AND new_row."salesOrderId" = old_row."salesOrderId"
          AND new_row.status = old_row.status
          AND new_row."totalAmount" = old_row."totalAmount"
          AND new_row."roundingAmount" IS NOT DISTINCT FROM old_row."roundingAmount"
          AND new_row."commercialSnapshot" IS NOT DISTINCT FROM old_row."commercialSnapshot"
          AND new_row."paidAmount" = old_row."paidAmount"
          AND new_row."creditedAmount" = old_row."creditedAmount"
          AND new_row."priceAdjustmentAmount" = old_row."priceAdjustmentAmount"
          AND new_row."remainingAmount" = old_row."remainingAmount"
          AND new_row.notes IS NOT DISTINCT FROM old_row.notes
          AND new_row."createdAt" = old_row."createdAt"
          AND new_row."termOfPaymentDays" = old_row."termOfPaymentDays"
    );
$$;

CREATE OR REPLACE FUNCTION guard_consumed_return_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id text;
BEGIN
  IF TG_TABLE_NAME='JournalLine' THEN
    source_id := CASE WHEN TG_OP='INSERT' THEN NEW."journalEntryId" ELSE OLD."journalEntryId" END;
    -- Preserve the original serialization and move guard for journal lines.
    PERFORM id FROM "JournalEntry" WHERE id=source_id FOR UPDATE;
    IF TG_OP='UPDATE' AND NEW."journalEntryId"<>OLD."journalEntryId" THEN
      PERFORM id FROM "JournalEntry" WHERE id=NEW."journalEntryId" FOR UPDATE;
      IF EXISTS (SELECT 1 FROM "SalesReturnCredit" c WHERE c."journalId"=NEW."journalEntryId" OR c."reversalJournalId"=NEW."journalEntryId") OR
         EXISTS (SELECT 1 FROM "SalesReturnReceiptLine" r WHERE r."journalId"=NEW."journalEntryId") OR
         EXISTS (SELECT 1 FROM "InvoiceReturnBasisLine" b JOIN "SalesReturnCreditAllocation" a ON a."basisLineId"=b.id WHERE b."sourceJournalId"=NEW."journalEntryId") THEN
        RAISE EXCEPTION 'Cannot move a line into consumed return history';
      END IF;
    END IF;
  ELSE source_id := OLD.id; END IF;
 IF TG_TABLE_NAME IN ('JournalEntry','JournalLine') THEN
   IF EXISTS (SELECT 1 FROM "SalesReturnCredit" c WHERE c.status IN ('POSTED','REVERSED') AND (c."journalId"=source_id OR c."reversalJournalId"=source_id)) OR
      EXISTS (SELECT 1 FROM "SalesReturnReceiptLine" r WHERE r."journalId"=source_id) OR
      EXISTS (SELECT 1 FROM "InvoiceReturnBasisLine" b JOIN "SalesReturnCreditAllocation" a ON a."basisLineId"=b.id WHERE b."sourceJournalId"=source_id) OR
      EXISTS (SELECT 1 FROM "SalesReturnReceiptLine" r JOIN "JournalEntry" j ON j."referenceId"=r."sourceMovementId" WHERE j.id=source_id) THEN
     RAISE EXCEPTION 'Consumed return journal history is immutable';
   END IF;
 ELSIF TG_TABLE_NAME='StockMovement' THEN
   IF EXISTS (SELECT 1 FROM "SalesReturnReceiptLine" r WHERE r."sourceMovementId"=source_id OR r."movementId"=source_id) THEN RAISE EXCEPTION 'Consumed return movement is immutable'; END IF;
 ELSIF TG_TABLE_NAME='SalesReturnItem' THEN
   IF EXISTS (SELECT 1 FROM "SalesReturnReceiptLine" r WHERE r."returnItemId"=source_id) OR EXISTS (SELECT 1 FROM "SalesReturnCreditAllocation" a WHERE a."returnItemId"=source_id) THEN RAISE EXCEPTION 'Consumed return item is immutable'; END IF;
 ELSIF TG_TABLE_NAME='Invoice' THEN
   IF OLD.status <> 'DRAFT' AND NEW.status='DRAFT' AND EXISTS (SELECT 1 FROM "SalesReturnCreditAllocation" a WHERE a."invoiceId"=OLD.id) THEN RAISE EXCEPTION 'Consumed invoice cannot return to draft'; END IF;
   IF NEW.status='CANCELLED' AND EXISTS (SELECT 1 FROM "SalesReturnCreditAllocation" a JOIN "SalesReturnCredit" c ON c.id=a."creditId" WHERE a."invoiceId"=OLD.id AND c.status='POSTED') THEN RAISE EXCEPTION 'Invoice has active return credit'; END IF;
   IF (NEW."totalAmount",NEW."roundingAmount",NEW."salesOrderId",NEW."invoiceDate") IS DISTINCT FROM (OLD."totalAmount",OLD."roundingAmount",OLD."salesOrderId",OLD."invoiceDate")
      AND EXISTS (SELECT 1 FROM "InvoiceReturnBasisLine" b WHERE b."invoiceId"=source_id)
      AND OLD.status<>'DRAFT'
      AND NOT allow_audited_invoice_date_correction(OLD, NEW) THEN
     RAISE EXCEPTION 'Recognized invoice basis cannot be rewritten';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
