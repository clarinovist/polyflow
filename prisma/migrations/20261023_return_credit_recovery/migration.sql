-- Additive exact recovery only. Never reopen or rewrite an original credit.
CREATE TYPE "ReturnCreditRecoveryKind" AS ENUM ('REINSTATE', 'COMPENSATE');
CREATE TABLE "ReturnCreditRecovery" (
  id TEXT PRIMARY KEY,
  "originalCreditId" TEXT NOT NULL REFERENCES "SalesReturnCredit"(id) ON DELETE RESTRICT,
  kind "ReturnCreditRecoveryKind" NOT NULL,
  "compensatesId" TEXT UNIQUE REFERENCES "ReturnCreditRecovery"(id) ON DELETE RESTRICT,
  "postingDate" TIMESTAMP(3) NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 1000),
  evidence TEXT NOT NULL CHECK (length(trim(evidence)) BETWEEN 5 AND 1000),
  "requestSignature" TEXT NOT NULL,
  "journalId" TEXT NOT NULL UNIQUE REFERENCES "JournalEntry"(id) ON DELETE RESTRICT,
  "actorUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnCreditRecovery_originalCreditId_kind_key" UNIQUE ("originalCreditId", kind),
  CONSTRAINT recovery_kind_shape CHECK ((kind='REINSTATE' AND "compensatesId" IS NULL) OR (kind='COMPENSATE' AND "compensatesId" IS NOT NULL))
);
CREATE INDEX "ReturnCreditRecovery_postingDate_idx" ON "ReturnCreditRecovery"("postingDate");

CREATE FUNCTION return_credit_is_effective(credit_id text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM "SalesReturnCredit" c WHERE c.id=credit_id AND
   (c.status='POSTED' OR (c.status='REVERSED'
     AND EXISTS (SELECT 1 FROM "ReturnCreditRecovery" e WHERE e."originalCreditId"=c.id AND e.kind='REINSTATE')
     AND NOT EXISTS (SELECT 1 FROM "ReturnCreditRecovery" e WHERE e."originalCreditId"=c.id AND e.kind='COMPENSATE'))))
$$;
CREATE OR REPLACE FUNCTION invoice_total_return_credit(invoice_id text) RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT SUM(a."totalAmount") FROM "SalesReturnCreditAllocation" a WHERE a."invoiceId"=invoice_id AND return_credit_is_effective(a."creditId")),0)
 + COALESCE((SELECT SUM(a."totalAmount") FROM "CustomerCreditApplication" a WHERE a."invoiceId"=invoice_id AND a.status='POSTED'),0)
$$;
-- Preserve the complete deployed function, including newer manual/customer guards.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('check_return_credit_ledger()'::regprocedure) INTO definition;
 IF position($match$AND c.status='POSTED')$match$ in definition)=0 THEN
   RAISE EXCEPTION 'Unexpected quantity guard; refusing to replace';
 END IF;
 definition:=replace(definition,$match$AND c.status='POSTED')$match$,'AND return_credit_is_effective(c.id))');
 EXECUTE definition;
END $$;

-- Cents, net/tax and quantities must account for recovered credits too. These checks
-- apply to invoices participating in recovery; unrelated legacy data is untouched.
CREATE FUNCTION check_recovery_invoice(invoice_id text, proposed_credit text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE inv "Invoice"%ROWTYPE; source_tax numeric; active_net numeric; active_tax numeric; price_net numeric; price_tax numeric;
BEGIN
 SELECT * INTO inv FROM "Invoice" WHERE id=invoice_id;
 IF proposed_credit IS NULL AND NOT EXISTS (SELECT 1 FROM "SalesReturnCreditAllocation" a JOIN "ReturnCreditRecovery" e ON e."originalCreditId"=a."creditId" WHERE a."invoiceId"=invoice_id) THEN RETURN; END IF;
 IF inv."creditedAmount"<>invoice_total_return_credit(invoice_id) OR inv."remainingAmount"<0 THEN
   RAISE EXCEPTION 'Recovery invoice ledger mismatch or negative balance'; END IF;
 IF EXISTS (SELECT 1 FROM "SalesReturnCreditAllocation" a JOIN "ReturnCreditRecovery" e ON e."originalCreditId"=a."creditId" WHERE a."invoiceId"=invoice_id AND return_credit_is_effective(a."creditId")) AND inv.status IN ('DRAFT','CANCELLED') THEN
   RAISE EXCEPTION 'Invoice has effective recovered credit'; END IF;
 SELECT COALESCE(SUM(l.credit-l.debit) FILTER (WHERE ac.type='LIABILITY'),0) INTO source_tax
 FROM "JournalEntry" j JOIN "JournalLine" l ON l."journalEntryId"=j.id JOIN "Account" ac ON ac.id=l."accountId"
 WHERE j."referenceType"='SALES_INVOICE' AND j."referenceId"=invoice_id AND j.status='POSTED';
 SELECT COALESCE(SUM(a."netAmount"),0),COALESCE(SUM(a."taxAmount"),0) INTO active_net,active_tax
 FROM "SalesReturnCreditAllocation" a WHERE a."invoiceId"=invoice_id AND (return_credit_is_effective(a."creditId") OR a."creditId"=proposed_credit);
 SELECT COALESCE(SUM("netAmount"),0),COALESCE(SUM("taxAmount"),0) INTO price_net,price_tax
 FROM "InvoicePriceAdjustment" WHERE "invoiceId"=invoice_id AND status='POSTED';
 IF active_tax>source_tax+price_tax OR active_net>inv."totalAmount"-source_tax+price_net THEN
   RAISE EXCEPTION 'Effective return net/tax exceeds invoice capacity'; END IF;
 IF EXISTS (
   SELECT 1 FROM "InvoiceReturnBasisLine" b JOIN "SalesReturnCreditAllocation" a ON a."basisLineId"=b.id
   WHERE b."invoiceId"=invoice_id AND (return_credit_is_effective(a."creditId") OR a."creditId"=proposed_credit) GROUP BY b.id
   HAVING SUM(a.quantity)>b.quantity OR SUM(a."netAmount")>b."netAmount" OR SUM(a."taxAmount")>b."taxAmount" OR SUM(a."discountAmount")>b."discountAmount"
 ) THEN RAISE EXCEPTION 'Effective return quantity or rounding capacity exceeded'; END IF;
END $$;

CREATE FUNCTION recovery_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invoice_id text; target_credit_id text;
BEGIN
 IF TG_TABLE_NAME='Invoice' THEN PERFORM check_recovery_invoice(NEW.id);
 ELSIF TG_TABLE_NAME IN ('SalesReturnCreditAllocation','InvoicePriceAdjustment') THEN
   PERFORM id FROM "Invoice" WHERE id=NEW."invoiceId" FOR UPDATE;
   PERFORM check_recovery_invoice(NEW."invoiceId");
 ELSE
   IF TG_TABLE_NAME='SalesReturnCredit' THEN target_credit_id:=NEW.id; ELSE target_credit_id:=NEW."originalCreditId"; END IF;
   FOR invoice_id IN SELECT DISTINCT a."invoiceId" FROM "SalesReturnCreditAllocation" a
     WHERE a."creditId"=target_credit_id ORDER BY a."invoiceId"
   LOOP PERFORM id FROM "Invoice" WHERE id=invoice_id FOR UPDATE; PERFORM check_recovery_invoice(invoice_id); END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER recovery_invoice_ledger AFTER INSERT OR UPDATE ON "Invoice" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION recovery_invoice_guard();
-- Every legitimate allocation mutation must update Invoice's credit cache, whose
-- guard checks the final capacity. Existing allocation/history ledger triggers remain.
CREATE CONSTRAINT TRIGGER recovery_price_ledger AFTER INSERT OR UPDATE ON "InvoicePriceAdjustment" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION recovery_invoice_guard();
CREATE CONSTRAINT TRIGGER recovery_event_ledger AFTER INSERT ON "ReturnCreditRecovery" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION recovery_invoice_guard();

CREATE FUNCTION validate_return_recovery(credit_id text, event_kind "ReturnCreditRecoveryKind", event_date timestamp, actor_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c "SalesReturnCredit"%ROWTYPE; r "SalesReturn"%ROWTYPE; a record; original_journal "JournalEntry"%ROWTYPE; source_count integer; invoice_row "Invoice"%ROWTYPE; first_event "ReturnCreditRecovery"%ROWTYPE; day date;
BEGIN
 SELECT * INTO c FROM "SalesReturnCredit" WHERE id=credit_id;
 IF NOT FOUND OR c.status<>'REVERSED' THEN RAISE EXCEPTION 'Recovery requires an original reversed credit'; END IF;
 SELECT * INTO r FROM "SalesReturn" WHERE id=c."salesReturnId";
 IF r.status NOT IN ('RECEIVED','COMPLETED') OR r."customerId" IS NULL OR r."customerId" IS DISTINCT FROM (SELECT "customerId" FROM "SalesOrder" WHERE id=r."salesOrderId") THEN RAISE EXCEPTION 'Recovery return source mismatch'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "User" WHERE id=actor_id AND role IN ('ADMIN','FINANCE') AND "isActive") THEN RAISE EXCEPTION 'Active Finance/Admin actor required'; END IF;
 day:=(event_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date;
 IF day>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date OR day<(c."reversedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date THEN RAISE EXCEPTION 'Invalid recovery posting date'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "FiscalPeriod" WHERE year=extract(year FROM day) AND month=extract(month FROM day) AND status='OPEN') THEN RAISE EXCEPTION 'Recovery accounting period is closed or missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "SalesReturnItem" WHERE "salesReturnId"=r.id) OR EXISTS (
   SELECT 1 FROM "SalesReturnItem" i LEFT JOIN "SalesReturnReceiptLine" s ON s."returnItemId"=i.id LEFT JOIN "StockMovement" m ON m.id=s."sourceMovementId"
   WHERE i."salesReturnId"=r.id AND (s.id IS NULL OR s.quantity<>i."returnedQty" OR m.type<>'OUT' OR m."salesOrderId" IS DISTINCT FROM r."salesOrderId" OR m."productVariantId"<>i."productVariantId" OR day<(s."receivedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date)
 ) THEN RAISE EXCEPTION 'Recovery requires complete original receipt evidence'; END IF;
 IF EXISTS (
   SELECT 1 FROM "SalesReturnItem" i JOIN "SalesReturnReceiptLine" s ON s."returnItemId"=i.id
   LEFT JOIN "StockMovement" m ON m.id=s."movementId" LEFT JOIN "JournalEntry" j ON j.id=s."journalId"
   WHERE i."salesReturnId"=r.id AND i.condition='GOOD' AND s."restockValue">0 AND
     (m.id IS NULL OR j.id IS NULL OR m.type<>'RETURN_IN' OR m."salesOrderId" IS DISTINCT FROM r."salesOrderId" OR m."productVariantId"<>i."productVariantId" OR m.quantity<>s.quantity OR m."toLocationId" IS DISTINCT FROM r."returnLocationId" OR j.status<>'POSTED' OR NOT j."isAutoGenerated")
 ) THEN RAISE EXCEPTION 'Recovery stock receipt evidence invalid'; END IF;
 IF EXISTS (SELECT 1 FROM "CustomerCreditNote" WHERE "salesReturnId"=r.id) THEN RAISE EXCEPTION 'Return has a customer credit path'; END IF;
 SELECT * INTO original_journal FROM "JournalEntry" WHERE id=c."journalId";
 IF original_journal.status IS DISTINCT FROM 'POSTED' OR NOT original_journal."isAutoGenerated" OR original_journal."referenceType" IS DISTINCT FROM 'SALES_RETURN' OR original_journal."referenceId" IS DISTINCT FROM r.id THEN RAISE EXCEPTION 'Original credit journal ownership invalid'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j.id=c."reversalJournalId" AND j.status='POSTED' AND j."isAutoGenerated" AND j."referenceType"='MANUAL_ENTRY' AND j."referenceId"=c.id) THEN RAISE EXCEPTION 'Original reversal journal ownership invalid'; END IF;
 IF (SELECT SUM(debit) FROM "JournalLine" WHERE "journalEntryId"=c."journalId") IS DISTINCT FROM c."totalAmount" OR (SELECT SUM(credit) FROM "JournalLine" WHERE "journalEntryId"=c."journalId") IS DISTINCT FROM c."totalAmount" OR EXISTS (
   SELECT 1 FROM "JournalLine" l JOIN "Account" ac ON ac.id=l."accountId" WHERE l."journalEntryId" IN (c."journalId",c."reversalJournalId") AND (NOT ac."isActive" OR l.currency<>'IDR' OR l."exchangeRate"<>1 OR l.debit<0 OR l.credit<0)
 ) OR EXISTS (
   SELECT 1 FROM "JournalLine" WHERE "journalEntryId" IN (c."journalId",c."reversalJournalId") GROUP BY "accountId",currency,"exchangeRate" HAVING SUM(debit-credit)<>0
 ) THEN RAISE EXCEPTION 'Original credit/reversal journal vector invalid'; END IF;
 IF (SELECT COALESCE(SUM(l.credit-l.debit),0) FROM "JournalLine" l JOIN "Account" ac ON ac.id=l."accountId" WHERE l."journalEntryId"=c."journalId" AND ac.type='ASSET')<>c."totalAmount" OR
    (SELECT COALESCE(SUM(l.debit-l.credit),0) FROM "JournalLine" l JOIN "Account" ac ON ac.id=l."accountId" WHERE l."journalEntryId"=c."journalId" AND ac.type='LIABILITY')<>c."taxAmount" OR
    (SELECT COALESCE(SUM(l.debit-l.credit),0) FROM "JournalLine" l JOIN "Account" ac ON ac.id=l."accountId" WHERE l."journalEntryId"=c."journalId" AND ac.type='REVENUE')<>c."netAmount" THEN RAISE EXCEPTION 'Original credit account vector invalid'; END IF;
 IF (SELECT ROW(SUM("netAmount"),SUM("taxAmount"),SUM("totalAmount")) FROM "SalesReturnCreditAllocation" WHERE "creditId"=c.id) IS DISTINCT FROM ROW(c."netAmount",c."taxAmount",c."totalAmount") THEN RAISE EXCEPTION 'Original allocation totals mismatch'; END IF;
 SELECT * INTO first_event FROM "ReturnCreditRecovery" WHERE "originalCreditId"=c.id AND kind='REINSTATE';
 IF event_kind='COMPENSATE' AND (first_event.id IS NULL OR event_date<first_event."postingDate") THEN RAISE EXCEPTION 'Compensation requires prior reinstatement'; END IF;
 FOR a IN SELECT "invoiceId",SUM("totalAmount") amount FROM "SalesReturnCreditAllocation" WHERE "creditId"=c.id GROUP BY "invoiceId" ORDER BY "invoiceId" LOOP
   SELECT * INTO invoice_row FROM "Invoice" WHERE id=a."invoiceId";
   IF invoice_row."salesOrderId"<>r."salesOrderId" OR invoice_row.status IN ('DRAFT','CANCELLED') OR day<(invoice_row."invoiceDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date THEN RAISE EXCEPTION 'Recovery invoice source/status/date invalid'; END IF;
   SELECT COUNT(*) INTO source_count FROM "JournalEntry" WHERE "referenceType"='SALES_INVOICE' AND "referenceId"=invoice_row.id AND status<>'VOIDED';
   IF source_count<>1 OR NOT EXISTS (SELECT 1 FROM "JournalEntry" WHERE "referenceType"='SALES_INVOICE' AND "referenceId"=invoice_row.id AND status='POSTED' AND "isAutoGenerated") THEN RAISE EXCEPTION 'Recovery invoice journal missing or ambiguous'; END IF;
   IF event_kind='REINSTATE' AND first_event.id IS NULL THEN
     IF a.amount>invoice_row."remainingAmount" THEN RAISE EXCEPTION 'Insufficient invoice balance for exact recovery'; END IF;
     PERFORM check_recovery_invoice(invoice_row.id,c.id);
   END IF;
   IF EXISTS (
     SELECT 1 FROM "JournalEntry" j JOIN "JournalLine" l ON l."journalEntryId"=j.id
     WHERE j."referenceType"='SALES_INVOICE' AND j."referenceId"=invoice_row.id AND j.status='POSTED'
     GROUP BY j.id HAVING SUM(l.debit)<>SUM(l.credit) OR SUM(l.debit)<>invoice_row."totalAmount"
   ) OR EXISTS (
     SELECT 1 FROM "JournalLine" l JOIN "Account" ac ON ac.id=l."accountId"
     WHERE l."journalEntryId"=c."journalId" AND ac.type IN ('ASSET','LIABILITY') AND NOT EXISTS (
       SELECT 1 FROM "JournalEntry" j JOIN "JournalLine" s ON s."journalEntryId"=j.id
       WHERE j."referenceType"='SALES_INVOICE' AND j."referenceId"=invoice_row.id AND j.status='POSTED' AND s."accountId"=l."accountId"
     )
   ) THEN RAISE EXCEPTION 'Recovery original invoice account vector invalid'; END IF;
 END LOOP;
END $$;

CREATE FUNCTION guard_return_recovery_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "SalesReturnCredit"%ROWTYPE; first_event "ReturnCreditRecovery"%ROWTYPE; invoice_id text; expected_source text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Recovery events are immutable; use compensation'; END IF;
 SELECT * INTO c FROM "SalesReturnCredit" WHERE id=NEW."originalCreditId";
 PERFORM id FROM "SalesReturn" WHERE id=c."salesReturnId" FOR UPDATE;
 PERFORM id FROM "SalesOrder" WHERE id=(SELECT "salesOrderId" FROM "SalesReturn" WHERE id=c."salesReturnId") FOR SHARE;
 FOR invoice_id IN SELECT DISTINCT "invoiceId" FROM "SalesReturnCreditAllocation" WHERE "creditId"=c.id ORDER BY "invoiceId" LOOP PERFORM id FROM "Invoice" WHERE id=invoice_id FOR UPDATE; END LOOP;
 PERFORM id FROM "FiscalPeriod" WHERE year=extract(year FROM NEW."postingDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta') AND month=extract(month FROM NEW."postingDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta') FOR SHARE;
 PERFORM validate_return_recovery(c.id,NEW.kind,NEW."postingDate",NEW."actorUserId");
 SELECT * INTO first_event FROM "ReturnCreditRecovery" WHERE "originalCreditId"=c.id AND kind='REINSTATE';
 IF NEW.kind='COMPENSATE' AND NEW."compensatesId" IS DISTINCT FROM first_event.id THEN RAISE EXCEPTION 'Wrong recovery compensation source'; END IF;
 IF NEW.kind='REINSTATE' AND EXISTS (SELECT 1 FROM "ReturnCreditRecovery" WHERE "originalCreditId"=c.id) THEN RAISE EXCEPTION 'Only one reinstatement is allowed'; END IF;
 expected_source:=CASE WHEN NEW.kind='REINSTATE' THEN c."journalId" ELSE first_event."journalId" END;
 IF NOT EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j.id=NEW."journalId" AND j.status='POSTED' AND j."isAutoGenerated" AND j."referenceType"='MANUAL_ENTRY' AND j."referenceId"=NEW.id AND j.reference='RETURN_CREDIT_RECOVERY:'||NEW.id AND j."entryDate"=NEW."postingDate" AND j."createdById"=NEW."actorUserId") THEN RAISE EXCEPTION 'Recovery journal ownership invalid'; END IF;
 IF (SELECT SUM(debit) FROM "JournalLine" WHERE "journalEntryId"=NEW."journalId") IS DISTINCT FROM c."totalAmount" OR (SELECT SUM(credit) FROM "JournalLine" WHERE "journalEntryId"=NEW."journalId") IS DISTINCT FROM c."totalAmount" OR EXISTS (
   SELECT 1 FROM (
     SELECT "accountId",currency,"exchangeRate",SUM(debit) d,SUM(credit) k FROM "JournalLine" WHERE "journalEntryId"=NEW."journalId" GROUP BY "accountId",currency,"exchangeRate"
   ) n FULL JOIN (
     SELECT "accountId",currency,"exchangeRate",SUM(CASE WHEN NEW.kind='REINSTATE' THEN debit ELSE credit END) d,SUM(CASE WHEN NEW.kind='REINSTATE' THEN credit ELSE debit END) k FROM "JournalLine" WHERE "journalEntryId"=expected_source GROUP BY "accountId",currency,"exchangeRate"
   ) o USING ("accountId",currency,"exchangeRate") WHERE n.d IS DISTINCT FROM o.d OR n.k IS DISTINCT FROM o.k
 ) THEN RAISE EXCEPTION 'Recovery journal is not the exact original vector'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_event_history BEFORE INSERT OR UPDATE OR DELETE ON "ReturnCreditRecovery" FOR EACH ROW EXECUTE FUNCTION guard_return_recovery_event();

CREATE FUNCTION guard_recovery_sources() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_id text; return_id text;
BEGIN
 IF TG_TABLE_NAME='JournalEntry' THEN journal_id:=OLD.id;
 ELSIF TG_TABLE_NAME='JournalLine' THEN
   journal_id:=CASE WHEN TG_OP='INSERT' THEN NEW."journalEntryId" ELSE OLD."journalEntryId" END;
   PERFORM id FROM "JournalEntry" WHERE id=journal_id FOR UPDATE;
   IF TG_OP='UPDATE' AND EXISTS (SELECT 1 FROM "ReturnCreditRecovery" WHERE "journalId"=NEW."journalEntryId") THEN RAISE EXCEPTION 'Recovery journal history is immutable'; END IF;
 END IF;
 IF journal_id IS NOT NULL AND EXISTS (SELECT 1 FROM "ReturnCreditRecovery" WHERE "journalId"=journal_id) THEN RAISE EXCEPTION 'Recovery journal history is immutable'; END IF;
 IF TG_TABLE_NAME='SalesReturn' THEN
   return_id:=OLD.id;
   IF EXISTS (SELECT 1 FROM "SalesReturnCredit" c JOIN "ReturnCreditRecovery" e ON e."originalCreditId"=c.id WHERE c."salesReturnId"=return_id) AND
     (TG_OP='DELETE' OR (NEW."salesOrderId",NEW."customerId",NEW."returnDate",NEW."deliveryOrderId",NEW."returnLocationId") IS DISTINCT FROM (OLD."salesOrderId",OLD."customerId",OLD."returnDate",OLD."deliveryOrderId",OLD."returnLocationId") OR NEW.status NOT IN ('RECEIVED','COMPLETED')) THEN RAISE EXCEPTION 'Recovered return source is immutable'; END IF;
 END IF;
 IF TG_TABLE_NAME='SalesOrder' THEN
   IF NEW."customerId" IS DISTINCT FROM OLD."customerId" AND EXISTS (SELECT 1 FROM "SalesReturn" r JOIN "SalesReturnCredit" c ON c."salesReturnId"=r.id JOIN "ReturnCreditRecovery" e ON e."originalCreditId"=c.id WHERE r."salesOrderId"=OLD.id) THEN RAISE EXCEPTION 'Recovered order customer is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER recovery_journal_history BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION guard_recovery_sources();
CREATE TRIGGER recovery_journal_line_history BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION guard_recovery_sources();
CREATE TRIGGER recovery_return_history BEFORE UPDATE OR DELETE ON "SalesReturn" FOR EACH ROW EXECUTE FUNCTION guard_recovery_sources();
CREATE TRIGGER recovery_order_history BEFORE UPDATE ON "SalesOrder" FOR EACH ROW EXECUTE FUNCTION guard_recovery_sources();

-- Fingerprint includes intervening balances, allocations, events and price changes.
CREATE FUNCTION return_recovery_fingerprint(credit_id text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT md5(jsonb_build_object(
   'credit',(SELECT to_jsonb(c) FROM "SalesReturnCredit" c WHERE c.id=credit_id),
   'allocations',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "SalesReturnCreditAllocation" a WHERE a."creditId"=credit_id),
   'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM "Invoice" i WHERE i.id IN (SELECT "invoiceId" FROM "SalesReturnCreditAllocation" WHERE "creditId"=credit_id)),
   'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "ReturnCreditRecovery" e WHERE e."originalCreditId"=credit_id),
   'usage',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "SalesReturnCreditAllocation" a WHERE a."invoiceId" IN (SELECT "invoiceId" FROM "SalesReturnCreditAllocation" WHERE "creditId"=credit_id) AND return_credit_is_effective(a."creditId")),
   'prices',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "InvoicePriceAdjustment" p WHERE p."invoiceId" IN (SELECT "invoiceId" FROM "SalesReturnCreditAllocation" WHERE "creditId"=credit_id))
 )::text)
$$;

-- Single audited primitive shared by the release-packaged CLI and SQL contracts.
CREATE FUNCTION post_return_credit_recovery(credit_id text, event_kind "ReturnCreditRecoveryKind", event_date timestamp, actor_id text, event_reason text, event_evidence text, expected_fingerprint text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE c "SalesReturnCredit"%ROWTYPE; existing "ReturnCreditRecovery"%ROWTYPE; prior "ReturnCreditRecovery"%ROWTYPE; a record; event_id text; journal_id text; signature text; seq integer; entry_no text; yr integer; mon integer; invoice_id text;
BEGIN
 SELECT * INTO c FROM "SalesReturnCredit" WHERE id=credit_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Credit not found'; END IF;
 PERFORM id FROM "SalesReturn" WHERE id=c."salesReturnId" FOR UPDATE;
 PERFORM id FROM "SalesOrder" WHERE id=(SELECT "salesOrderId" FROM "SalesReturn" WHERE id=c."salesReturnId") FOR SHARE;
 FOR invoice_id IN SELECT DISTINCT "invoiceId" FROM "SalesReturnCreditAllocation" WHERE "creditId"=c.id ORDER BY "invoiceId" LOOP PERFORM id FROM "Invoice" WHERE id=invoice_id FOR UPDATE; END LOOP;
 signature:=md5(jsonb_build_array(credit_id,event_kind,event_date,actor_id,event_reason,event_evidence)::text);
 SELECT * INTO existing FROM "ReturnCreditRecovery" WHERE "originalCreditId"=credit_id AND kind=event_kind;
 IF FOUND THEN
   IF existing."requestSignature"<>signature THEN RAISE EXCEPTION 'Recovery retry instructions conflict'; END IF;
   RETURN existing.id;
 END IF;
 IF expected_fingerprint IS DISTINCT FROM return_recovery_fingerprint(credit_id) THEN RAISE EXCEPTION 'Recovery preview is stale; inspect again'; END IF;
 yr:=extract(year FROM event_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta'); mon:=extract(month FROM event_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta');
 PERFORM id FROM "FiscalPeriod" WHERE year=yr AND month=mon FOR SHARE;
 PERFORM id FROM "JournalEntry" WHERE id IN (c."journalId",c."reversalJournalId") OR ("referenceType"='SALES_INVOICE' AND "referenceId" IN (SELECT "invoiceId" FROM "SalesReturnCreditAllocation" WHERE "creditId"=c.id)) ORDER BY id FOR UPDATE;
 PERFORM validate_return_recovery(credit_id,event_kind,event_date,actor_id);
 SELECT * INTO prior FROM "ReturnCreditRecovery" WHERE "originalCreditId"=credit_id AND kind='REINSTATE';
 event_id:=gen_random_uuid()::text; journal_id:=gen_random_uuid()::text;
 INSERT INTO "SystemSequence" (id,key,value,"updatedAt") VALUES (gen_random_uuid()::text,'JOURNAL_ENTRY_'||yr,1,CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value="SystemSequence".value+1,"updatedAt"=CURRENT_TIMESTAMP RETURNING value INTO seq;
 entry_no:='JE - '||yr||' -'||lpad(seq::text,5,'0');
 INSERT INTO "JournalEntry" (id,"entryNumber","entryDate",description,reference,"referenceType","referenceId",status,"isAutoGenerated","createdById","approvedById","approvedAt","updatedAt") VALUES
 (journal_id,entry_no,event_date,CASE WHEN event_kind='REINSTATE' THEN 'Pemulihan kredit retur: ' ELSE 'Kompensasi pemulihan kredit retur: ' END||event_reason,'RETURN_CREDIT_RECOVERY:'||event_id,'MANUAL_ENTRY',event_id,'POSTED',true,actor_id,actor_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO "JournalLine" (id,"journalEntryId","accountId",debit,credit,currency,"exchangeRate")
 SELECT gen_random_uuid()::text,journal_id,"accountId",CASE WHEN event_kind='REINSTATE' THEN debit ELSE credit END,CASE WHEN event_kind='REINSTATE' THEN credit ELSE debit END,currency,"exchangeRate" FROM "JournalLine" WHERE "journalEntryId"=c."journalId";
 SET CONSTRAINTS invoice_return_credit_ledger,recovery_invoice_ledger,recovery_event_ledger DEFERRED;
 INSERT INTO "ReturnCreditRecovery" (id,"originalCreditId",kind,"compensatesId","postingDate",reason,evidence,"requestSignature","journalId","actorUserId") VALUES
 (event_id,c.id,event_kind,CASE WHEN event_kind='COMPENSATE' THEN prior.id END,event_date,event_reason,event_evidence,signature,journal_id,actor_id);
 FOR a IN SELECT "invoiceId",SUM("totalAmount") amount FROM "SalesReturnCreditAllocation" WHERE "creditId"=c.id GROUP BY "invoiceId" ORDER BY "invoiceId" LOOP
   UPDATE "Invoice" SET "creditedAmount"="creditedAmount"+CASE WHEN event_kind='REINSTATE' THEN a.amount ELSE -a.amount END,"updatedAt"=CURRENT_TIMESTAMP WHERE id=a."invoiceId";
   UPDATE "Invoice" SET status=CASE WHEN "remainingAmount"=0 THEN 'PAID'::"InvoiceStatus" WHEN "dueDate"<CURRENT_TIMESTAMP THEN 'OVERDUE'::"InvoiceStatus" WHEN "paidAmount"+"creditedAmount">0 THEN 'PARTIAL'::"InvoiceStatus" ELSE 'UNPAID'::"InvoiceStatus" END WHERE id=a."invoiceId";
 END LOOP;
 INSERT INTO "AuditLog" (id,"userId",action,"entityType","entityId",details,changes) VALUES
 (gen_random_uuid()::text,actor_id,'RETURN_CREDIT_'||event_kind,'SalesReturn',c."salesReturnId",event_reason,jsonb_build_object('eventId',event_id,'creditId',c.id,'journalId',journal_id,'totalAmount',c."totalAmount"::text,'taxAmount',c."taxAmount"::text,'evidence',event_evidence));
 SET CONSTRAINTS invoice_return_credit_ledger,recovery_invoice_ledger,recovery_event_ledger IMMEDIATE;
 RETURN event_id;
END $$;
