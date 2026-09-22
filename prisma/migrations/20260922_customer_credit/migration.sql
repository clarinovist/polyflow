BEGIN;
CREATE TABLE "CustomerCreditNote" (
 id text PRIMARY KEY, "salesReturnId" text NOT NULL UNIQUE REFERENCES "SalesReturn"(id) ON DELETE RESTRICT,
 "sourceInvoiceId" text NOT NULL REFERENCES "Invoice"(id) ON DELETE RESTRICT,
 "customerId" text NOT NULL REFERENCES "Customer"(id) ON DELETE RESTRICT,
 "sourceJournalId" text NOT NULL REFERENCES "JournalEntry"(id) ON DELETE RESTRICT,
 "liabilityAccountId" text NOT NULL REFERENCES "Account"(id) ON DELETE RESTRICT,
 "netAmount" numeric(15,2) NOT NULL CHECK ("netAmount">=0), "taxAmount" numeric(15,2) NOT NULL CHECK ("taxAmount">=0),
 "totalAmount" numeric(15,2) NOT NULL CHECK ("totalAmount">0 AND "totalAmount"="netAmount"+"taxAmount"),
 status "SalesReturnCreditStatus" NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','REVERSED')),
 "postingDate" timestamp(3) NOT NULL, reason text NOT NULL CHECK(length(trim(reason))>=10), evidence text NOT NULL CHECK(length(trim(evidence))>=10),
 "requestSignature" text NOT NULL, "journalId" text NOT NULL UNIQUE REFERENCES "JournalEntry"(id) ON DELETE RESTRICT,
 "createdById" text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "reversedAt" timestamp(3), "reversedById" text REFERENCES "User"(id) ON DELETE RESTRICT, "reversalReason" text,
 "reversalJournalId" text UNIQUE REFERENCES "JournalEntry"(id) ON DELETE RESTRICT,
 CHECK ((status='POSTED' AND "reversedAt" IS NULL AND "reversedById" IS NULL AND "reversalReason" IS NULL AND "reversalJournalId" IS NULL) OR
 (status='REVERSED' AND "reversedAt">="postingDate" AND "reversedAt" IS NOT NULL AND "reversedById" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason"))>=10 AND "reversalJournalId" IS NOT NULL))
);
CREATE TABLE "CustomerCreditLink" (
 id text PRIMARY KEY, "fromCustomerId" text NOT NULL REFERENCES "Customer"(id) ON DELETE RESTRICT,
 "toCustomerId" text NOT NULL REFERENCES "Customer"(id) ON DELETE RESTRICT,
 reason text NOT NULL CHECK(length(trim(reason))>=10), evidence text NOT NULL CHECK(length(trim(evidence))>=10),
 "createdById" text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "revokedAt" timestamp(3), "revokedById" text REFERENCES "User"(id) ON DELETE RESTRICT, "revokeReason" text,
 CHECK ("fromCustomerId"<"toCustomerId"),
 CHECK (("revokedAt" IS NULL AND "revokedById" IS NULL AND "revokeReason" IS NULL) OR ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL AND "revokeReason" IS NOT NULL AND length(trim("revokeReason"))>=10))
);
CREATE UNIQUE INDEX "CustomerCreditLink_active_pair" ON "CustomerCreditLink"("fromCustomerId","toCustomerId") WHERE "revokedAt" IS NULL;
CREATE INDEX "CustomerCreditLink_fromCustomerId_toCustomerId_idx" ON "CustomerCreditLink"("fromCustomerId","toCustomerId");
CREATE TABLE "CustomerCreditApplication" (
 id text PRIMARY KEY, "noteId" text NOT NULL REFERENCES "CustomerCreditNote"(id) ON DELETE RESTRICT,
 "invoiceId" text NOT NULL REFERENCES "Invoice"(id) ON DELETE RESTRICT,
 "sourceJournalId" text NOT NULL REFERENCES "JournalEntry"(id) ON DELETE RESTRICT,
 "customerLinkId" text REFERENCES "CustomerCreditLink"(id) ON DELETE RESTRICT,
 "totalAmount" numeric(15,2) NOT NULL CHECK("totalAmount">0),
 status "SalesReturnCreditStatus" NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','REVERSED')),
 "postingDate" timestamp(3) NOT NULL, reason text NOT NULL CHECK(length(trim(reason))>=10),
 "idempotencyKey" text NOT NULL UNIQUE, "requestSignature" text NOT NULL,
 "journalId" text NOT NULL UNIQUE REFERENCES "JournalEntry"(id) ON DELETE RESTRICT,
 "createdById" text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "reversedAt" timestamp(3), "reversedById" text REFERENCES "User"(id) ON DELETE RESTRICT, "reversalReason" text,
 "reversalJournalId" text UNIQUE REFERENCES "JournalEntry"(id) ON DELETE RESTRICT,
 CHECK ((status='POSTED' AND "reversedAt" IS NULL AND "reversedById" IS NULL AND "reversalReason" IS NULL AND "reversalJournalId" IS NULL) OR
 (status='REVERSED' AND "reversedAt">="postingDate" AND "reversedAt" IS NOT NULL AND "reversedById" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason"))>=10 AND "reversalJournalId" IS NOT NULL))
);
CREATE INDEX "CustomerCreditNote_customerId_postingDate_idx" ON "CustomerCreditNote"("customerId","postingDate");
CREATE INDEX "CustomerCreditNote_sourceInvoiceId_idx" ON "CustomerCreditNote"("sourceInvoiceId");
CREATE INDEX "CustomerCreditApplication_noteId_postingDate_idx" ON "CustomerCreditApplication"("noteId","postingDate");
CREATE INDEX "CustomerCreditApplication_invoiceId_idx" ON "CustomerCreditApplication"("invoiceId");

-- Extend the established credit cache contract without relaxing legacy source/history checks.
CREATE FUNCTION invoice_total_return_credit(invoice_id text) RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT SUM(a."totalAmount") FROM "SalesReturnCreditAllocation" a JOIN "SalesReturnCredit" c ON c.id=a."creditId" WHERE a."invoiceId"=invoice_id AND c.status='POSTED'),0)
 + COALESCE((SELECT SUM(a."totalAmount") FROM "CustomerCreditApplication" a WHERE a."invoiceId"=invoice_id AND a.status='POSTED'),0)
$$;
-- Retain every other check in the deployed function, including manual/snapshot coverage.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('check_return_credit_ledger()'::regprocedure) INTO definition;
 definition := replace(definition,
 'COALESCE((
      SELECT SUM(a."totalAmount") FROM "SalesReturnCreditAllocation" a JOIN "SalesReturnCredit" c ON c.id=a."creditId" WHERE a."invoiceId"=i.id AND c.status=''POSTED''
    ),0)', 'invoice_total_return_credit(i.id)');
 definition := replace(definition,
 'COALESCE((SELECT SUM(x."totalAmount") FROM "SalesReturnCreditAllocation" x JOIN "SalesReturnCredit" c ON c.id=x."creditId" WHERE x."invoiceId"=i.id AND c.status=''POSTED''),0)', 'invoice_total_return_credit(i.id)');
 IF (length(definition)-length(replace(definition,'invoice_total_return_credit(i.id)','')))/length('invoice_total_return_credit(i.id)') <> 2 THEN
  RAISE EXCEPTION 'Unexpected return ledger definition; refusing to weaken checks';
 END IF;
 EXECUTE definition;
END $$;

CREATE FUNCTION check_customer_credit_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n "CustomerCreditNote"%ROWTYPE; a "CustomerCreditApplication"%ROWTYPE; journal_id text; amount numeric; owner_id text;
BEGIN
 IF TG_TABLE_NAME='CustomerCreditNote' THEN
  SELECT * INTO n FROM "CustomerCreditNote" WHERE id=NEW.id;
 ELSE
  SELECT * INTO a FROM "CustomerCreditApplication" WHERE id=NEW.id;
  SELECT * INTO n FROM "CustomerCreditNote" WHERE id=a."noteId";
  SELECT s."customerId" INTO owner_id FROM "Invoice" i JOIN "SalesOrder" s ON s.id=i."salesOrderId" WHERE i.id=a."invoiceId";
  IF owner_id IS DISTINCT FROM n."customerId" AND NOT EXISTS (SELECT 1 FROM "CustomerCreditLink" l WHERE l.id=a."customerLinkId" AND l."fromCustomerId"=LEAST(owner_id,n."customerId") AND l."toCustomerId"=GREATEST(owner_id,n."customerId") AND l."createdAt"<=a."createdAt" AND (l."revokedAt" IS NULL OR l."revokedAt">=a."createdAt")) THEN RAISE EXCEPTION 'Unapproved customer credit identity'; END IF;
  IF a."invoiceId"=n."sourceInvoiceId" OR a."postingDate"<n."postingDate" THEN RAISE EXCEPTION 'Invalid credit target/date'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "JournalEntry" j WHERE j.id=a."sourceJournalId" AND j."referenceType"='SALES_INVOICE' AND j."referenceId"=a."invoiceId" AND j.status='POSTED' AND j."isAutoGenerated") THEN RAISE EXCEPTION 'Customer credit target source invalid'; END IF;
  IF EXISTS (SELECT 1 FROM "Invoice" i WHERE i.id=a."invoiceId" AND (i."creditedAmount"<>invoice_total_return_credit(i.id) OR i."remainingAmount"<0 OR i.status IN ('DRAFT','CANCELLED'))) THEN RAISE EXCEPTION 'Customer credit invoice ledger mismatch'; END IF;
 END IF;
 IF (SELECT COALESCE(SUM("totalAmount"),0) FROM "CustomerCreditApplication" WHERE "noteId"=n.id AND status='POSTED')>n."totalAmount" OR (n.status='REVERSED' AND EXISTS(SELECT 1 FROM "CustomerCreditApplication" WHERE "noteId"=n.id AND status='POSTED')) THEN RAISE EXCEPTION 'Customer credit overdrawn or reversed with active allocations'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "SalesReturn" r JOIN "Invoice" i ON i.id=n."sourceInvoiceId" JOIN "SalesOrder" s ON s.id=i."salesOrderId" JOIN "JournalEntry" j ON j.id=n."sourceJournalId" WHERE r.id=n."salesReturnId" AND r."salesOrderId"=s.id AND r."customerId"=n."customerId" AND s."customerId"=n."customerId" AND r.status IN ('RECEIVED','COMPLETED') AND j.status='POSTED' AND j."referenceType"='SALES_INVOICE' AND j."referenceId"=i.id) THEN RAISE EXCEPTION 'Customer credit source mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM "SalesReturnCredit" WHERE "salesReturnId"=n."salesReturnId" AND status IN ('POSTED','REVERSED')) THEN RAISE EXCEPTION 'Return already financially consumed'; END IF;
 IF TG_TABLE_NAME='CustomerCreditNote' THEN amount:=n."totalAmount"; ELSE amount:=a."totalAmount"; END IF;
 FOREACH journal_id IN ARRAY CASE WHEN TG_TABLE_NAME='CustomerCreditNote' THEN ARRAY[n."journalId",n."reversalJournalId"] ELSE ARRAY[a."journalId",a."reversalJournalId"] END LOOP
  IF journal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "JournalEntry" j JOIN "JournalLine" l ON l."journalEntryId"=j.id WHERE j.id=journal_id AND j.status='POSTED' AND j."isAutoGenerated" GROUP BY j.id HAVING SUM(l.debit)=amount AND SUM(l.credit)=amount) THEN RAISE EXCEPTION 'Customer credit journal invalid'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER customer_credit_note_ledger AFTER INSERT OR UPDATE ON "CustomerCreditNote" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION check_customer_credit_ledger();
CREATE CONSTRAINT TRIGGER customer_credit_application_ledger AFTER INSERT OR UPDATE ON "CustomerCreditApplication" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION check_customer_credit_ledger();

CREATE FUNCTION guard_customer_credit_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id text; return_id text;
BEGIN
 IF TG_TABLE_NAME IN ('CustomerCreditNote','CustomerCreditApplication') THEN
  IF TG_OP='INSERT' THEN
   IF TG_TABLE_NAME='CustomerCreditNote' THEN
    PERFORM id FROM "SalesReturn" WHERE id=NEW."salesReturnId" FOR UPDATE;
    PERFORM id FROM "Invoice" WHERE id=NEW."sourceInvoiceId" FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM "Invoice" i WHERE i.id=NEW."sourceInvoiceId" AND i.status='PAID' AND i."paidAmount"=i."totalAmount" AND i."creditedAmount"=0 AND i."priceAdjustmentAmount"=0 AND i."paidAmount"=COALESCE((SELECT SUM(amount) FROM "Payment" WHERE "invoiceId"=i.id),0)) THEN RAISE EXCEPTION 'Customer credit requires fully paid source'; END IF;
    IF EXISTS(SELECT 1 FROM "SalesReturnItem" i WHERE i."salesReturnId"=NEW."salesReturnId" AND NOT EXISTS(SELECT 1 FROM "SalesReturnReceiptLine" r WHERE r."returnItemId"=i.id AND r.quantity=i."returnedQty")) THEN RAISE EXCEPTION 'Customer credit requires complete receipt evidence'; END IF;
    IF EXISTS(SELECT 1 FROM "CustomerCreditNote" n JOIN "Invoice" i ON i.id=n."sourceInvoiceId" WHERE n."sourceInvoiceId"=NEW."sourceInvoiceId" AND n.status='POSTED' GROUP BY i.id HAVING SUM(n."totalAmount")+NEW."totalAmount">i."totalAmount") THEN RAISE EXCEPTION 'Customer credit source value exceeded'; END IF;
   ELSE
    PERFORM id FROM "CustomerCreditNote" WHERE id=NEW."noteId" FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM "CustomerCreditNote" WHERE id=NEW."noteId" AND status='POSTED') THEN RAISE EXCEPTION 'Customer credit note is not active'; END IF;
   END IF;
   RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Customer credit history cannot be deleted'; END IF;
  IF TG_OP='UPDATE' AND NOT (OLD.status='POSTED' AND NEW.status='REVERSED' AND (to_jsonb(NEW)-ARRAY['status','reversedAt','reversedById','reversalReason','reversalJournalId'])=(to_jsonb(OLD)-ARRAY['status','reversedAt','reversedById','reversalReason','reversalJournalId'])) THEN RAISE EXCEPTION 'Customer credit history is immutable'; END IF;
 ELSIF TG_TABLE_NAME='CustomerCreditLink' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Customer identity approval history cannot be deleted'; END IF;
  IF OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL OR (to_jsonb(NEW)-ARRAY['revokedAt','revokedById','revokeReason'])<>(to_jsonb(OLD)-ARRAY['revokedAt','revokedById','revokeReason']) THEN RAISE EXCEPTION 'Customer identity approval is immutable'; END IF;
 ELSIF TG_TABLE_NAME='SalesReturnCredit' THEN
  PERFORM id FROM "SalesReturn" WHERE id=NEW."salesReturnId" FOR UPDATE;
  IF EXISTS(SELECT 1 FROM "CustomerCreditNote" WHERE "salesReturnId"=NEW."salesReturnId") THEN RAISE EXCEPTION 'Return consumed by customer credit'; END IF;
 ELSIF TG_TABLE_NAME IN ('JournalEntry','JournalLine') THEN
  source_id:=CASE WHEN TG_TABLE_NAME='JournalLine' THEN COALESCE(to_jsonb(OLD)->>'journalEntryId',to_jsonb(NEW)->>'journalEntryId') ELSE OLD.id END;
  PERFORM id FROM "JournalEntry" WHERE id=source_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM "CustomerCreditNote" WHERE source_id IN ("journalId","sourceJournalId","reversalJournalId") OR (TG_TABLE_NAME='JournalLine' AND (to_jsonb(NEW)->>'journalEntryId') IN ("journalId","sourceJournalId","reversalJournalId"))) OR EXISTS(SELECT 1 FROM "CustomerCreditApplication" WHERE source_id IN ("journalId","sourceJournalId","reversalJournalId") OR (TG_TABLE_NAME='JournalLine' AND (to_jsonb(NEW)->>'journalEntryId') IN ("journalId","sourceJournalId","reversalJournalId"))) THEN RAISE EXCEPTION 'Customer credit journal history immutable'; END IF;
 ELSIF TG_TABLE_NAME='Payment' THEN
  IF EXISTS(SELECT 1 FROM "CustomerCreditNote" WHERE "sourceInvoiceId" IN (to_jsonb(NEW)->>'invoiceId',to_jsonb(OLD)->>'invoiceId')) THEN RAISE EXCEPTION 'Customer credit source payment history immutable'; END IF;
 ELSIF TG_TABLE_NAME='SalesOrder' THEN
  IF NEW."customerId" IS DISTINCT FROM OLD."customerId" AND EXISTS(SELECT 1 FROM "Invoice" i WHERE i."salesOrderId"=OLD.id AND (EXISTS(SELECT 1 FROM "CustomerCreditNote" WHERE "sourceInvoiceId"=i.id) OR EXISTS(SELECT 1 FROM "CustomerCreditApplication" WHERE "invoiceId"=i.id))) THEN RAISE EXCEPTION 'Customer credit customer identity immutable'; END IF;
 ELSIF TG_TABLE_NAME='Invoice' THEN
  IF EXISTS(SELECT 1 FROM "CustomerCreditNote" WHERE "sourceInvoiceId"=OLD.id) THEN
   IF (NEW."totalAmount",NEW."salesOrderId",NEW."paidAmount",NEW."creditedAmount",NEW."priceAdjustmentAmount",NEW.status,NEW."invoiceDate") IS DISTINCT FROM (OLD."totalAmount",OLD."salesOrderId",OLD."paidAmount",OLD."creditedAmount",OLD."priceAdjustmentAmount",OLD.status,OLD."invoiceDate") THEN RAISE EXCEPTION 'Paid customer credit source cannot be rewritten'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM "CustomerCreditApplication" WHERE "invoiceId"=OLD.id) AND ((NEW."totalAmount",NEW."salesOrderId",NEW."invoiceDate") IS DISTINCT FROM (OLD."totalAmount",OLD."salesOrderId",OLD."invoiceDate") OR NEW.status IN ('DRAFT','CANCELLED')) THEN RAISE EXCEPTION 'Customer credit target history immutable'; END IF;
 ELSIF TG_TABLE_NAME='SalesReturnItem' THEN
  return_id:=COALESCE(to_jsonb(NEW)->>'salesReturnId',to_jsonb(OLD)->>'salesReturnId');
  PERFORM id FROM "SalesReturn" WHERE id=return_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM "CustomerCreditNote" WHERE "salesReturnId" IN (return_id,to_jsonb(OLD)->>'salesReturnId')) THEN RAISE EXCEPTION 'Customer credit return items immutable'; END IF;
 ELSIF TG_TABLE_NAME='SalesReturn' THEN
  IF EXISTS(SELECT 1 FROM "CustomerCreditNote" WHERE "salesReturnId"=OLD.id) AND ((to_jsonb(NEW)-ARRAY['status','updatedAt'])<>(to_jsonb(OLD)-ARRAY['status','updatedAt']) OR NEW.status NOT IN ('RECEIVED','COMPLETED')) THEN RAISE EXCEPTION 'Customer credit return source immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER customer_credit_note_history BEFORE INSERT OR UPDATE OR DELETE ON "CustomerCreditNote" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
CREATE TRIGGER customer_credit_application_history BEFORE INSERT OR UPDATE OR DELETE ON "CustomerCreditApplication" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
CREATE TRIGGER customer_credit_link_history BEFORE UPDATE OR DELETE ON "CustomerCreditLink" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
CREATE TRIGGER customer_credit_direct_exclusion BEFORE INSERT OR UPDATE ON "SalesReturnCredit" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
CREATE TRIGGER customer_credit_journal_history BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
CREATE TRIGGER customer_credit_line_history BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
CREATE TRIGGER customer_credit_order_history BEFORE UPDATE ON "SalesOrder" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
CREATE TRIGGER customer_credit_invoice_history BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
CREATE TRIGGER customer_credit_return_history BEFORE UPDATE ON "SalesReturn" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
CREATE TRIGGER customer_credit_payment_history BEFORE INSERT OR UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
CREATE TRIGGER customer_credit_return_item_history BEFORE INSERT OR UPDATE OR DELETE ON "SalesReturnItem" FOR EACH ROW EXECUTE FUNCTION guard_customer_credit_history();
COMMIT;
