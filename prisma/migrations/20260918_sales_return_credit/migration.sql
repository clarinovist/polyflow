-- Additive only: no legacy invoice/return amounts or journals are rewritten.
ALTER TABLE "Invoice" ADD COLUMN "creditedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_creditedAmount_nonnegative" CHECK ("creditedAmount" >= 0);
ALTER TABLE "Invoice" ADD COLUMN "remainingAmount" DECIMAL(15,2) NOT NULL GENERATED ALWAYS AS ("totalAmount" - "paidAmount" - "creditedAmount") STORED;
CREATE INDEX "Invoice_positive_receivable_due_idx" ON "Invoice" ("dueDate", id) WHERE "remainingAmount" > 0 AND status IN ('UNPAID','PARTIAL','OVERDUE');
CREATE TYPE "SalesReturnCreditStatus" AS ENUM ('REVIEW_REQUIRED', 'POSTED', 'REVERSED');

CREATE TABLE "SalesReturnReceiptLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnItemId" TEXT NOT NULL REFERENCES "SalesReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "sourceMovementId" TEXT NOT NULL REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "movementId" TEXT REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "journalId" TEXT REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "quantity" DECIMAL(15,4) NOT NULL CHECK ("quantity" > 0),
    "restockValue" DECIMAL(15,2) NOT NULL CHECK ("restockValue" >= 0),
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SalesReturnReceiptLine_returnItemId_key" ON "SalesReturnReceiptLine"("returnItemId");
CREATE UNIQUE INDEX "SalesReturnReceiptLine_movementId_key" ON "SalesReturnReceiptLine"("movementId");
CREATE UNIQUE INDEX "SalesReturnReceiptLine_journalId_key" ON "SalesReturnReceiptLine"("journalId");
CREATE INDEX "SalesReturnReceiptLine_sourceMovementId_idx" ON "SalesReturnReceiptLine"("sourceMovementId");

CREATE TABLE "InvoiceReturnBasisLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "sourceItemId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "quantity" DECIMAL(15,4) NOT NULL CHECK ("quantity" > 0),
    "netAmount" DECIMAL(15,2) NOT NULL CHECK ("netAmount" >= 0),
    "taxAmount" DECIMAL(15,2) NOT NULL CHECK ("taxAmount" >= 0),
    "discountAmount" DECIMAL(15,2) NOT NULL CHECK ("discountAmount" >= 0),
    "sourceJournalId" TEXT NOT NULL REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "sourceEvidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InvoiceReturnBasisLine_invoiceId_sourceItemId_key" ON "InvoiceReturnBasisLine"("invoiceId", "sourceItemId");
CREATE INDEX "InvoiceReturnBasisLine_invoiceId_productVariantId_idx" ON "InvoiceReturnBasisLine"("invoiceId", "productVariantId");

CREATE TABLE "SalesReturnCredit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salesReturnId" TEXT NOT NULL REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "status" "SalesReturnCreditStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "reviewReason" TEXT,
    "postedAt" TIMESTAMP(3),
    "netAmount" DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK ("netAmount" >= 0),
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "journalId" TEXT REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "reversalReason" TEXT,
    "reversalJournalId" TEXT REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesReturnCredit_amounts" CHECK ("totalAmount" = "netAmount" + "taxAmount"),
    CONSTRAINT "SalesReturnCredit_posted_fields" CHECK (
        ("status" IN ('POSTED', 'REVERSED') AND "postedAt" IS NOT NULL AND "journalId" IS NOT NULL AND "totalAmount" > 0 AND "reviewReason" IS NULL)
        OR ("status" = 'REVIEW_REQUIRED' AND "postedAt" IS NULL AND "journalId" IS NULL)
    ),
    CONSTRAINT "SalesReturnCredit_reversal_fields" CHECK (
        ("status" = 'REVERSED' AND "reversedAt" >= "postedAt" AND "reversedAt" IS NOT NULL AND "reversedById" IS NOT NULL AND length(trim("reversalReason")) >= 5 AND "reversalReason" IS NOT NULL AND "reversalJournalId" IS NOT NULL)
        OR ("status" <> 'REVERSED' AND "reversedAt" IS NULL AND "reversedById" IS NULL AND "reversalReason" IS NULL AND "reversalJournalId" IS NULL)
    )
);
CREATE UNIQUE INDEX "SalesReturnCredit_salesReturnId_key" ON "SalesReturnCredit"("salesReturnId");
CREATE UNIQUE INDEX "SalesReturnCredit_journalId_key" ON "SalesReturnCredit"("journalId");
CREATE UNIQUE INDEX "SalesReturnCredit_reversalJournalId_key" ON "SalesReturnCredit"("reversalJournalId");
CREATE INDEX "SalesReturnCredit_status_createdAt_idx" ON "SalesReturnCredit"("status", "createdAt");

CREATE TABLE "SalesReturnCreditAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creditId" TEXT NOT NULL REFERENCES "SalesReturnCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "invoiceId" TEXT NOT NULL REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "basisLineId" TEXT NOT NULL REFERENCES "InvoiceReturnBasisLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "returnItemId" TEXT NOT NULL REFERENCES "SalesReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "quantity" DECIMAL(15,4) NOT NULL CHECK ("quantity" > 0),
    "netAmount" DECIMAL(15,2) NOT NULL CHECK ("netAmount" >= 0),
    "taxAmount" DECIMAL(15,2) NOT NULL CHECK ("taxAmount" >= 0),
    "discountAmount" DECIMAL(15,2) NOT NULL CHECK ("discountAmount" >= 0),
    "totalAmount" DECIMAL(15,2) NOT NULL CHECK ("totalAmount" = "netAmount" + "taxAmount")
);
CREATE UNIQUE INDEX "ReturnCreditAllocation_source_key" ON "SalesReturnCreditAllocation"("creditId", "returnItemId", "basisLineId");
CREATE INDEX "SalesReturnCreditAllocation_invoiceId_idx" ON "SalesReturnCreditAllocation"("invoiceId");
CREATE INDEX "SalesReturnCreditAllocation_basisLineId_idx" ON "SalesReturnCreditAllocation"("basisLineId");

-- Immutable financial history and deferred cross-row cache/ledger verification.
CREATE FUNCTION guard_return_credit_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'SalesReturnCredit' THEN
    IF TG_OP = 'DELETE' AND OLD.status <> 'REVIEW_REQUIRED' THEN RAISE EXCEPTION 'Posted return credit history cannot be deleted'; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('POSTED','REVERSED') THEN
      IF NOT (OLD.status = 'POSTED' AND NEW.status = 'REVERSED' AND
          (to_jsonb(NEW) - ARRAY['status','reversedAt','reversedById','reversalReason','reversalJournalId','updatedAt']) =
          (to_jsonb(OLD) - ARRAY['status','reversedAt','reversedById','reversalReason','reversalJournalId','updatedAt'])) THEN
        RAISE EXCEPTION 'Posted return credit history is immutable; use compensation';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'SalesReturnCreditAllocation' THEN
    IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Return credit allocation history is immutable'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "SalesReturnCredit" c WHERE c.id = NEW."creditId" AND c.status = 'POSTED' AND c.xmin::text::bigint = txid_current() % 4294967296) THEN
      RAISE EXCEPTION 'Allocations can only be inserted in their credit posting transaction';
    END IF;
  ELSIF TG_TABLE_NAME = 'SalesReturnReceiptLine' THEN
    RAISE EXCEPTION 'Historical return receipt evidence is immutable';
  ELSIF TG_TABLE_NAME = 'InvoiceReturnBasisLine' THEN
    IF EXISTS (SELECT 1 FROM "Invoice" i WHERE i.id = OLD."invoiceId" AND i.status <> 'DRAFT') OR
       EXISTS (SELECT 1 FROM "SalesReturnCreditAllocation" a WHERE a."basisLineId" = OLD.id) THEN
      RAISE EXCEPTION 'Recognized or consumed invoice basis is immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER return_credit_history BEFORE UPDATE OR DELETE ON "SalesReturnCredit" FOR EACH ROW EXECUTE FUNCTION guard_return_credit_history();
CREATE TRIGGER return_allocation_history BEFORE INSERT OR UPDATE OR DELETE ON "SalesReturnCreditAllocation" FOR EACH ROW EXECUTE FUNCTION guard_return_credit_history();
CREATE TRIGGER return_receipt_history BEFORE UPDATE OR DELETE ON "SalesReturnReceiptLine" FOR EACH ROW EXECUTE FUNCTION guard_return_credit_history();
CREATE TRIGGER return_basis_history BEFORE UPDATE OR DELETE ON "InvoiceReturnBasisLine" FOR EACH ROW EXECUTE FUNCTION guard_return_credit_history();

CREATE FUNCTION check_return_credit_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invoice_id text; credit_id text; credit_row "SalesReturnCredit"%ROWTYPE; journal_id text;
BEGIN
  IF TG_TABLE_NAME = 'Invoice' THEN invoice_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'SalesReturnCreditAllocation' THEN invoice_id := NEW."invoiceId"; credit_id := NEW."creditId";
  ELSE credit_id := NEW.id; END IF;
  IF invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM "Invoice" i WHERE i.id = invoice_id AND i."creditedAmount" <> COALESCE((
      SELECT SUM(a."totalAmount") FROM "SalesReturnCreditAllocation" a JOIN "SalesReturnCredit" c ON c.id=a."creditId" WHERE a."invoiceId"=i.id AND c.status='POSTED'
    ),0)
  ) THEN RAISE EXCEPTION 'Invoice creditedAmount must equal active allocation ledger'; END IF;
  IF credit_id IS NOT NULL THEN
    SELECT * INTO credit_row FROM "SalesReturnCredit" WHERE id=credit_id;
    IF credit_row.status IN ('POSTED','REVERSED') THEN
      IF NOT EXISTS (SELECT 1 FROM "SalesReturnCreditAllocation" WHERE "creditId"=credit_id) OR EXISTS (
        SELECT 1 FROM "SalesReturnCredit" c WHERE c.id=credit_id AND
        (c."totalAmount",c."netAmount",c."taxAmount") IS DISTINCT FROM
        (SELECT ROW(SUM(a."totalAmount"),SUM(a."netAmount"),SUM(a."taxAmount")) FROM "SalesReturnCreditAllocation" a WHERE a."creditId"=c.id)
      ) THEN RAISE EXCEPTION 'Credit totals must equal allocations'; END IF;
      IF EXISTS (
        SELECT 1 FROM "SalesReturnCreditAllocation" a JOIN "Invoice" i ON i.id=a."invoiceId"
        JOIN "InvoiceReturnBasisLine" b ON b.id=a."basisLineId" JOIN "SalesReturnItem" ri ON ri.id=a."returnItemId"
        JOIN "SalesReturn" r ON r.id=ri."salesReturnId" JOIN "SalesOrder" so ON so.id=i."salesOrderId"
        WHERE a."creditId"=credit_id AND (b."invoiceId"<>i.id OR ri."salesReturnId"<>credit_row."salesReturnId" OR b."productVariantId"<>ri."productVariantId" OR r."salesOrderId"<>i."salesOrderId" OR r."customerId" IS DISTINCT FROM so."customerId")
      ) THEN RAISE EXCEPTION 'Credit allocation source mismatch'; END IF;
      IF EXISTS (
        SELECT 1 FROM "SalesReturnItem" ri WHERE ri."salesReturnId"=credit_row."salesReturnId" AND ri."returnedQty" <> COALESCE((SELECT SUM(a.quantity) FROM "SalesReturnCreditAllocation" a WHERE a."creditId"=credit_id AND a."returnItemId"=ri.id),0)
      ) THEN RAISE EXCEPTION 'Credit quantities must cover every return item'; END IF;
      IF EXISTS (
        SELECT 1 FROM "SalesReturnCreditAllocation" a JOIN "Invoice" i ON i.id=a."invoiceId" WHERE a."creditId"=credit_id AND i."creditedAmount" <> COALESCE((SELECT SUM(x."totalAmount") FROM "SalesReturnCreditAllocation" x JOIN "SalesReturnCredit" c ON c.id=x."creditId" WHERE x."invoiceId"=i.id AND c.status='POSTED'),0)
      ) THEN RAISE EXCEPTION 'Invoice creditedAmount must equal active allocation ledger'; END IF;
      IF EXISTS (
        SELECT 1 FROM "InvoiceReturnBasisLine" b WHERE b.id IN (SELECT "basisLineId" FROM "SalesReturnCreditAllocation" WHERE "creditId"=credit_id)
          AND (SELECT COALESCE(SUM(a.quantity),0) FROM "SalesReturnCreditAllocation" a JOIN "SalesReturnCredit" c ON c.id=a."creditId" WHERE a."basisLineId"=b.id AND c.status='POSTED') > b.quantity
      ) THEN RAISE EXCEPTION 'Active returned quantity exceeds original invoice basis'; END IF;
      FOREACH journal_id IN ARRAY ARRAY[credit_row."journalId",credit_row."reversalJournalId"] LOOP
        IF journal_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM "JournalEntry" j JOIN "JournalLine" l ON l."journalEntryId"=j.id WHERE j.id=journal_id AND j.status='POSTED' AND j."isAutoGenerated"
          GROUP BY j.id HAVING SUM(l.debit)=credit_row."totalAmount" AND SUM(l.credit)=credit_row."totalAmount"
        ) THEN RAISE EXCEPTION 'Credit journal must be posted and balanced to credit total'; END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_return_credit_ledger AFTER INSERT OR UPDATE ON "Invoice" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION check_return_credit_ledger();
CREATE CONSTRAINT TRIGGER return_credit_ledger AFTER INSERT OR UPDATE ON "SalesReturnCredit" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION check_return_credit_ledger();
CREATE CONSTRAINT TRIGGER return_allocation_ledger AFTER INSERT ON "SalesReturnCreditAllocation" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION check_return_credit_ledger();

CREATE FUNCTION guard_consumed_return_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id text;
BEGIN
  IF TG_TABLE_NAME='JournalLine' THEN
    source_id := CASE WHEN TG_OP='INSERT' THEN NEW."journalEntryId" ELSE OLD."journalEntryId" END;
    -- Serialize direct line edits with posting/receipt's historical evidence lock.
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
    IF (NEW."totalAmount",NEW."roundingAmount",NEW."salesOrderId",NEW."invoiceDate") IS DISTINCT FROM (OLD."totalAmount",OLD."roundingAmount",OLD."salesOrderId",OLD."invoiceDate") AND EXISTS (SELECT 1 FROM "InvoiceReturnBasisLine" b WHERE b."invoiceId"=source_id) AND OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'Recognized invoice basis cannot be rewritten'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER return_journal_history BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION guard_consumed_return_source();
CREATE TRIGGER return_journal_line_history BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION guard_consumed_return_source();
CREATE TRIGGER return_movement_history BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION guard_consumed_return_source();
CREATE TRIGGER return_item_history BEFORE UPDATE OR DELETE ON "SalesReturnItem" FOR EACH ROW EXECUTE FUNCTION guard_consumed_return_source();
CREATE TRIGGER return_invoice_history BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION guard_consumed_return_source();
