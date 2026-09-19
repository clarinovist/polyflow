-- Explicit manual Finance approval; never fabricate invoice snapshots or backfill history.
CREATE TYPE "SalesReturnCreditMode" AS ENUM ('SNAPSHOT', 'MANUAL');
ALTER TABLE "SalesReturnCredit"
  ADD COLUMN "mode" "SalesReturnCreditMode" NOT NULL DEFAULT 'SNAPSHOT',
  ADD COLUMN "approvalReason" TEXT,
  ADD COLUMN "evidenceReference" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "manualRemainingBefore" DECIMAL(15,2),
  ADD CONSTRAINT "ReturnCredit_manual_approval" CHECK (
    (mode='SNAPSHOT' AND "approvalReason" IS NULL AND "evidenceReference" IS NULL AND "approvedAt" IS NULL AND "approvedById" IS NULL AND "manualRemainingBefore" IS NULL)
    OR (mode='MANUAL' AND status IN ('POSTED','REVERSED') AND "approvalReason" IS NOT NULL AND length(trim("approvalReason")) BETWEEN 5 AND 1000
      AND "evidenceReference" IS NOT NULL AND length(trim("evidenceReference")) BETWEEN 5 AND 1000
      AND "approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL AND "manualRemainingBefore" IS NOT NULL AND "manualRemainingBefore">= "totalAmount")
  );
ALTER TABLE "SalesReturnCreditAllocation"
  ALTER COLUMN "basisLineId" DROP NOT NULL,
  ALTER COLUMN "returnItemId" DROP NOT NULL,
  ALTER COLUMN quantity DROP NOT NULL,
  ADD COLUMN "manualSourceJournalId" TEXT REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReturnAllocation_mode_shape" CHECK (
    ("basisLineId" IS NOT NULL AND "returnItemId" IS NOT NULL AND quantity IS NOT NULL AND "manualSourceJournalId" IS NULL)
    OR ("basisLineId" IS NULL AND "returnItemId" IS NULL AND quantity IS NULL AND "manualSourceJournalId" IS NOT NULL AND "discountAmount"=0)
  );
CREATE UNIQUE INDEX "ReturnAllocation_one_manual_invoice" ON "SalesReturnCreditAllocation"("creditId") WHERE "manualSourceJournalId" IS NOT NULL;
CREATE INDEX "ReturnAllocation_manual_source_idx" ON "SalesReturnCreditAllocation"("manualSourceJournalId");

-- Same original ledger checks, with quantity coverage restricted to the SNAPSHOT mode.
-- Manual monetary allocation is checked separately below; common sums/cache/journal checks remain.
CREATE OR REPLACE FUNCTION check_return_credit_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
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
      IF credit_row.mode='SNAPSHOT' AND EXISTS (
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

CREATE FUNCTION check_manual_return_credit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credit_id text; c "SalesReturnCredit"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='SalesReturnCredit' THEN credit_id:=NEW.id;
  ELSE credit_id:=NEW."creditId"; END IF;
  SELECT * INTO c FROM "SalesReturnCredit" WHERE id=credit_id;
  IF EXISTS (SELECT 1 FROM "SalesReturnCreditAllocation" a WHERE a."creditId"=c.id AND
    ((c.mode='SNAPSHOT' AND a."basisLineId" IS NULL) OR (c.mode='MANUAL' AND a."manualSourceJournalId" IS NULL))) THEN
    RAISE EXCEPTION 'Credit allocation mode mismatch';
  END IF;
  IF c.mode='MANUAL' THEN
    IF (SELECT count(*) FROM "SalesReturnCreditAllocation" WHERE "creditId"=c.id)<>1 THEN RAISE EXCEPTION 'Manual credit requires exactly one invoice allocation'; END IF;
    IF EXISTS (
      SELECT 1 FROM "SalesReturnCreditAllocation" a JOIN "Invoice" i ON i.id=a."invoiceId"
      JOIN "SalesOrder" so ON so.id=i."salesOrderId" JOIN "SalesReturn" r ON r.id=c."salesReturnId"
      JOIN "JournalEntry" j ON j.id=a."manualSourceJournalId"
      WHERE a."creditId"=c.id AND (r."salesOrderId"<>i."salesOrderId" OR r."customerId" IS DISTINCT FROM so."customerId"
        OR r.status NOT IN ('RECEIVED','COMPLETED') OR j."referenceType"<>'SALES_INVOICE' OR j."referenceId" IS DISTINCT FROM i.id OR j.status<>'POSTED'
        OR NOT j."isAutoGenerated"
        OR (i."invoiceDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date > (c."postedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date
        OR (r."returnDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date > (c."postedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date)
    ) THEN RAISE EXCEPTION 'Manual credit source mismatch'; END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER manual_credit_shape AFTER INSERT OR UPDATE ON "SalesReturnCredit" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION check_manual_return_credit();
CREATE CONSTRAINT TRIGGER manual_allocation_shape AFTER INSERT ON "SalesReturnCreditAllocation" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION check_manual_return_credit();

CREATE FUNCTION guard_manual_return_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id text; return_id text;
BEGIN
  IF TG_TABLE_NAME='JournalLine' THEN
    source_id := CASE WHEN TG_OP='INSERT' THEN NEW."journalEntryId" ELSE OLD."journalEntryId" END;
    PERFORM id FROM "JournalEntry" WHERE id=source_id FOR UPDATE;
    IF TG_OP='UPDATE' AND NEW."journalEntryId"<>OLD."journalEntryId" AND EXISTS (
      SELECT 1 FROM "SalesReturnCreditAllocation" WHERE "manualSourceJournalId"=NEW."journalEntryId"
    ) THEN RAISE EXCEPTION 'Manual credit source journal is immutable'; END IF;
  ELSE source_id:=OLD.id; END IF;
  IF TG_TABLE_NAME IN ('JournalEntry','JournalLine') AND EXISTS (
    SELECT 1 FROM "SalesReturnCreditAllocation" WHERE "manualSourceJournalId"=source_id
  ) THEN RAISE EXCEPTION 'Manual credit source journal is immutable'; END IF;
  IF TG_TABLE_NAME='SalesOrder' THEN
    IF NEW."customerId" IS DISTINCT FROM OLD."customerId" AND EXISTS (
      SELECT 1 FROM "Invoice" i JOIN "SalesReturnCreditAllocation" a ON a."invoiceId"=i.id WHERE i."salesOrderId"=OLD.id AND a."manualSourceJournalId" IS NOT NULL
    ) THEN RAISE EXCEPTION 'Manually credited customer source is immutable'; END IF;
  END IF;
  IF TG_TABLE_NAME='Invoice' THEN
    IF EXISTS (SELECT 1 FROM "SalesReturnCreditAllocation" WHERE "invoiceId"=OLD.id AND "manualSourceJournalId" IS NOT NULL) AND
      (NEW."totalAmount",NEW."salesOrderId",NEW."invoiceDate",NEW."roundingAmount") IS DISTINCT FROM (OLD."totalAmount",OLD."salesOrderId",OLD."invoiceDate",OLD."roundingAmount") THEN
      RAISE EXCEPTION 'Manually credited invoice source is immutable';
    END IF;
  END IF;
  IF TG_TABLE_NAME IN ('SalesReturn','SalesReturnItem') THEN
    IF TG_TABLE_NAME='SalesReturn' THEN return_id:=OLD.id;
    ELSE return_id:=CASE WHEN TG_OP='INSERT' THEN NEW."salesReturnId" ELSE OLD."salesReturnId" END; END IF;
    PERFORM id FROM "SalesReturn" WHERE id=return_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM "SalesReturnCredit" WHERE "salesReturnId"=return_id AND mode='MANUAL') THEN
      IF TG_TABLE_NAME='SalesReturnItem' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Manually approved return source is immutable'; END IF;
      IF (NEW."salesOrderId",NEW."customerId",NEW."returnDate",NEW."deliveryOrderId") IS DISTINCT FROM (OLD."salesOrderId",OLD."customerId",OLD."returnDate",OLD."deliveryOrderId") OR NEW.status NOT IN ('RECEIVED','COMPLETED') THEN
        RAISE EXCEPTION 'Manually approved return source is immutable';
      END IF;
    END IF;
    IF TG_TABLE_NAME='SalesReturnItem' AND TG_OP='UPDATE' THEN
      IF NEW."salesReturnId"<>OLD."salesReturnId" AND EXISTS (SELECT 1 FROM "SalesReturnCredit" WHERE "salesReturnId"=NEW."salesReturnId" AND mode='MANUAL') THEN
        RAISE EXCEPTION 'Cannot move items into a manually approved return';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manual_source_journal_history BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION guard_manual_return_history();
CREATE TRIGGER manual_source_line_history BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION guard_manual_return_history();
CREATE TRIGGER manual_order_history BEFORE UPDATE ON "SalesOrder" FOR EACH ROW EXECUTE FUNCTION guard_manual_return_history();
CREATE TRIGGER manual_invoice_history BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION guard_manual_return_history();
CREATE TRIGGER manual_return_history BEFORE UPDATE OR DELETE ON "SalesReturn" FOR EACH ROW EXECUTE FUNCTION guard_manual_return_history();
CREATE TRIGGER manual_return_item_history BEFORE INSERT OR UPDATE OR DELETE ON "SalesReturnItem" FOR EACH ROW EXECUTE FUNCTION guard_manual_return_history();
