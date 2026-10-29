CREATE TABLE "AtkCostCorrection" (
    "id" TEXT PRIMARY KEY,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('REFUND', 'COMPENSATION')),
    "requestId" TEXT NOT NULL UNIQUE,
    "requestHash" TEXT NOT NULL,
    "sourceMovementId" TEXT NOT NULL REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "sourceJournalId" TEXT NOT NULL REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "journalId" TEXT NOT NULL UNIQUE REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "reversalOfId" TEXT UNIQUE REFERENCES "AtkCostCorrection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "amount" DECIMAL(15,2) NOT NULL CHECK ("amount" > 0),
    "historicalUnitCost" DECIMAL(15,4) NOT NULL CHECK ("historicalUnitCost" > 0),
    "expectedLoss" DECIMAL(15,2) NOT NULL,
    "originalLoss" DECIMAL(15,2) NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "postingDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "backupReference" TEXT NOT NULL,
    "evidenceSnapshot" JSONB NOT NULL,
    CONSTRAINT "AtkCostCorrection_sourceMovementId_kind_key" UNIQUE ("sourceMovementId", "kind"),
    CONSTRAINT "AtkCostCorrection_kind_reversal_check" CHECK (("kind" = 'REFUND' AND "reversalOfId" IS NULL) OR ("kind" = 'COMPENSATION' AND "reversalOfId" IS NOT NULL)),
    CONSTRAINT "AtkCostCorrection_amount_check" CHECK ("originalLoss" > "expectedLoss" AND "expectedLoss" > 0 AND "amount" = "originalLoss" - "expectedLoss")
);
CREATE TABLE "AtkCostEvidence" (
    "id" TEXT PRIMARY KEY,
    "correctionId" TEXT NOT NULL REFERENCES "AtkCostCorrection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "movementId" TEXT NOT NULL REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "journalId" TEXT NOT NULL REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AtkCostEvidence_correctionId_movementId_key" UNIQUE ("correctionId", "movementId")
);
CREATE INDEX "AtkCostEvidence_journalId_idx" ON "AtkCostEvidence"("journalId");
CREATE INDEX "AtkCostEvidence_movementId_idx" ON "AtkCostEvidence"("movementId");

-- Evidence and postings cannot be rewritten/voided/deleted behind the correction.
-- Corrections are reversed only by append-only compensation documents.
CREATE FUNCTION guard_atk_cost_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id TEXT;
BEGIN
    IF TG_TABLE_NAME IN ('AtkCostCorrection', 'AtkCostEvidence') THEN
        RAISE EXCEPTION 'ATK correction documents are immutable; use compensation';
    ELSIF TG_TABLE_NAME = 'StockMovement' THEN
        IF EXISTS (SELECT 1 FROM "AtkCostEvidence" WHERE "movementId" = OLD.id)
            OR EXISTS (SELECT 1 FROM "AtkCostCorrection" WHERE "sourceMovementId" = OLD.id) THEN
            RAISE EXCEPTION 'ATK correction evidence is protected; review recovery first';
        END IF;
    ELSE
        IF TG_TABLE_NAME = 'JournalLine' THEN
            IF TG_OP = 'INSERT' THEN target_id := NEW."journalEntryId";
            ELSE target_id := OLD."journalEntryId"; END IF;
        ELSE target_id := OLD.id; END IF;
        IF EXISTS (SELECT 1 FROM "AtkCostEvidence" WHERE "journalId" = target_id)
            OR EXISTS (SELECT 1 FROM "AtkCostCorrection" WHERE "journalId" = target_id OR "sourceJournalId" = target_id) THEN
            RAISE EXCEPTION 'ATK correction journal is protected; use compensation';
        END IF;
        IF TG_TABLE_NAME = 'JournalLine' AND TG_OP = 'UPDATE' THEN
            IF NEW."journalEntryId" <> OLD."journalEntryId" THEN
                IF EXISTS (SELECT 1 FROM "AtkCostEvidence" WHERE "journalId" = NEW."journalEntryId")
                    OR EXISTS (SELECT 1 FROM "AtkCostCorrection" WHERE "journalId" = NEW."journalEntryId") THEN
                    RAISE EXCEPTION 'Cannot add lines to an ATK correction journal';
                END IF;
            END IF;
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
-- Ownership checks complement foreign keys: compensation must refer to exactly
-- the same source/amount, never another item's refund.
CREATE FUNCTION validate_atk_cost_correction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "AtkCostCorrection"%ROWTYPE;
BEGIN
    IF NEW."kind" = 'COMPENSATION' THEN
        SELECT * INTO parent FROM "AtkCostCorrection" WHERE id = NEW."reversalOfId";
        IF NOT FOUND OR parent.kind <> 'REFUND' OR parent."sourceMovementId" <> NEW."sourceMovementId"
            OR parent."sourceJournalId" <> NEW."sourceJournalId" OR parent.amount <> NEW.amount
            OR parent."expectedLoss" <> NEW."expectedLoss" OR parent."originalLoss" <> NEW."originalLoss"
            OR parent."historicalUnitCost" <> NEW."historicalUnitCost" THEN
            RAISE EXCEPTION 'Compensation must match its original refund';
        END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "JournalEntry" WHERE id = NEW."sourceJournalId" AND "referenceId" = NEW."sourceMovementId" AND status = 'POSTED' AND "isAutoGenerated" AND "referenceType" = 'STOCK_ADJUSTMENT')
        OR NOT EXISTS (SELECT 1 FROM "JournalEntry" WHERE id = NEW."journalId" AND "referenceId" = NEW.id AND status = 'POSTED' AND "isAutoGenerated" AND "referenceType" = 'STOCK_ADJUSTMENT') THEN
        RAISE EXCEPTION 'Correction journals must be attributed to their exact source';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "atk_correction_ownership" BEFORE INSERT ON "AtkCostCorrection" FOR EACH ROW EXECUTE FUNCTION validate_atk_cost_correction();

-- Only pairs declared by the immutable snapshot can be inserted. The deferred
-- document check requires every declared pair before commit, so a later append
-- is either a duplicate (UNIQUE) or outside this closed set (rejected here).
CREATE FUNCTION validate_atk_evidence_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "AtkCostCorrection"%ROWTYPE;
BEGIN
    SELECT * INTO STRICT c FROM "AtkCostCorrection" WHERE id = NEW."correctionId";
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(c."evidenceSnapshot"->'moves') m
        JOIN jsonb_array_elements(c."evidenceSnapshot"->'journals') j
            ON j->>'referenceId' = m->>'id'
        JOIN "StockMovement" actual ON actual.id = m->>'id'
        JOIN "StockMovement" source ON source.id = c."sourceMovementId"
        JOIN "JournalEntry" journal ON journal.id = j->>'id' AND journal."referenceId" = actual.id
        WHERE m->>'id' = NEW."movementId" AND j->>'id' = NEW."journalId"
            AND actual."productVariantId" = source."productVariantId"
    ) THEN RAISE EXCEPTION 'ATK evidence pair is outside the immutable source set'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "atk_evidence_pair" BEFORE INSERT ON "AtkCostEvidence" FOR EACH ROW EXECUTE FUNCTION validate_atk_evidence_pair();

CREATE FUNCTION validate_atk_complete_document() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    c "AtkCostCorrection"%ROWTYPE;
    source "StockMovement"%ROWTYPE;
    original "JournalEntry"%ROWTYPE;
    posting "JournalEntry"%ROWTYPE;
    inv TEXT;
    loss TEXT;
    n INTEGER;
    expected_count INTEGER;
    expected_debit NUMERIC;
BEGIN
    SELECT * INTO STRICT c FROM "AtkCostCorrection" WHERE id = NEW.id;
    SELECT * INTO STRICT source FROM "StockMovement" WHERE id = c."sourceMovementId";
    SELECT * INTO STRICT original FROM "JournalEntry" WHERE id = c."sourceJournalId";
    SELECT * INTO STRICT posting FROM "JournalEntry" WHERE id = c."journalId";
    IF c."rulesVersion" <> 'constant-cost-refund-v1' OR source.type <> 'ADJUSTMENT'
        OR source.quantity <= 0 OR source."fromLocationId" IS NULL OR source."toLocationId" IS NOT NULL
        OR source."productionOrderId" IS NOT NULL OR source."productionExecutionId" IS NOT NULL
        OR source."salesOrderId" IS NOT NULL OR source."reversalOfId" IS NOT NULL
        OR source."companyOwned" = false OR source."packagingOwnerCustomerId" IS NOT NULL
        OR NOT EXISTS (SELECT 1 FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId" WHERE v.id = source."productVariantId" AND v."archivedAt" IS NULL AND p."productType" = 'OPERATIONAL')
        OR NOT EXISTS (SELECT 1 FROM "Location" WHERE id = source."fromLocationId" AND "locationType" = 'INTERNAL' AND "packagingOwnerCustomerId" IS NULL)
        OR (SELECT count(*) FROM "JournalEntry" WHERE "referenceId" = source.id) <> 1
        OR c."expectedLoss" <> round(source.quantity * c."historicalUnitCost", 2)
        OR posting."entryDate" <> c."postingDate" THEN
        RAISE EXCEPTION 'ATK correction source, cost or posting date is invalid';
    END IF;
    IF date_trunc('month', source."createdAt" + interval '7 hours') <> date_trunc('month', c."postingDate" + interval '7 hours')
        OR date_trunc('month', original."entryDate" + interval '7 hours') <> date_trunc('month', c."postingDate" + interval '7 hours')
        OR NOT EXISTS (SELECT 1 FROM "FiscalPeriod" WHERE year = extract(year FROM c."postingDate" + interval '7 hours')
            AND month = extract(month FROM c."postingDate" + interval '7 hours') AND status = 'OPEN') THEN
        RAISE EXCEPTION 'ATK correction requires the same OPEN source and posting period';
    END IF;
    SELECT count(*) INTO n FROM "JournalLine" WHERE "journalEntryId" = original.id;
    IF n <> 2 THEN RAISE EXCEPTION 'ATK original journal must have two lines'; END IF;
    SELECT l."accountId" INTO inv FROM "JournalLine" l JOIN "Account" a ON a.id = l."accountId"
        WHERE l."journalEntryId" = original.id AND l.debit = 0 AND l.credit = c."originalLoss"
            AND l.currency = 'IDR' AND l."exchangeRate" = 1
            AND a.type = 'ASSET' AND a.category = 'CURRENT_ASSET' AND a."isActive" AND NOT a."isCashAccount" AND a.currency = 'IDR';
    SELECT l."accountId" INTO loss FROM "JournalLine" l JOIN "Account" a ON a.id = l."accountId"
        WHERE l."journalEntryId" = original.id AND l.credit = 0 AND l.debit = c."originalLoss"
            AND l.currency = 'IDR' AND l."exchangeRate" = 1
            AND a.type = 'EXPENSE' AND a.category::text IN ('OPERATING_EXPENSE', 'OTHER_EXPENSE') AND a."isActive" AND a.currency = 'IDR';
    IF inv IS NULL OR loss IS NULL OR inv = loss THEN RAISE EXCEPTION 'ATK original journal accounts or amounts invalid'; END IF;
    SELECT count(*) INTO n FROM "JournalLine" WHERE "journalEntryId" = posting.id;
    expected_debit := CASE WHEN c.kind = 'REFUND' THEN c.amount ELSE 0 END;
    IF n <> 2 OR NOT EXISTS (SELECT 1 FROM "JournalLine" WHERE "journalEntryId" = posting.id AND "accountId" = inv
        AND debit = expected_debit AND credit = c.amount - expected_debit AND currency = 'IDR' AND "exchangeRate" = 1)
        OR NOT EXISTS (SELECT 1 FROM "JournalLine" WHERE "journalEntryId" = posting.id AND "accountId" = loss
        AND credit = expected_debit AND debit = c.amount - expected_debit AND currency = 'IDR' AND "exchangeRate" = 1) THEN
        RAISE EXCEPTION 'ATK posting must be the exact two-line refund or compensation';
    END IF;
    IF c.kind = 'COMPENSATION' AND EXISTS (SELECT 1 FROM "AtkCostCorrection" p WHERE p.id = c."reversalOfId"
        AND date_trunc('month', p."postingDate" + interval '7 hours') <> date_trunc('month', c."postingDate" + interval '7 hours')) THEN
        RAISE EXCEPTION 'ATK compensation must remain in the original refund period';
    END IF;
    IF jsonb_typeof(c."evidenceSnapshot"->'moves') IS DISTINCT FROM 'array'
        OR jsonb_typeof(c."evidenceSnapshot"->'journals') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'ATK snapshot must declare the complete evidence set';
    END IF;
    expected_count := jsonb_array_length(c."evidenceSnapshot"->'moves');
    SELECT count(*) INTO n FROM "AtkCostEvidence" WHERE "correctionId" = c.id;
    IF expected_count < 2 OR expected_count > 100 OR n <> expected_count
        OR jsonb_array_length(c."evidenceSnapshot"->'journals') <> n
        OR (SELECT count(DISTINCT m->>'id') FROM jsonb_array_elements(c."evidenceSnapshot"->'moves') m) <> n
        OR (SELECT count(DISTINCT j->>'id') FROM jsonb_array_elements(c."evidenceSnapshot"->'journals') j) <> n
        OR (SELECT count(*) FROM "StockMovement" WHERE "productVariantId" = source."productVariantId") <> n
        OR NOT EXISTS (SELECT 1 FROM "AtkCostEvidence" WHERE "correctionId" = c.id AND "movementId" = source.id AND "journalId" = original.id) THEN
        RAISE EXCEPTION 'ATK correction evidence must be complete, unique and source-owned';
    END IF;
    IF (SELECT count(*) FROM "Inventory" WHERE "productVariantId" = source."productVariantId") <> 1
        OR NOT EXISTS (SELECT 1 FROM "Inventory" i WHERE i."productVariantId" = source."productVariantId"
            AND i."locationId" = source."fromLocationId" AND i."averageCost" = c."historicalUnitCost" AND i.quantity >= 0
            AND i.quantity = (SELECT sum(m.quantity) FROM "AtkCostEvidence" e JOIN "StockMovement" m ON m.id = e."movementId" WHERE e."correctionId" = c.id AND m.id <> source.id) - source.quantity) THEN
        RAISE EXCEPTION 'ATK stock quantity and cost do not match complete source evidence';
    END IF;
    -- The permitted evidence set is one loss plus constant-price receipts only.
    IF EXISTS (SELECT 1 FROM "AtkCostEvidence" e JOIN "StockMovement" m ON m.id = e."movementId"
        JOIN "JournalEntry" j ON j.id = e."journalId"
        WHERE e."correctionId" = c.id AND m.id <> source.id AND (
            m.type <> 'PURCHASE' OR m.quantity <= 0 OR m.cost IS DISTINCT FROM c."historicalUnitCost"
            OR m."toLocationId" IS DISTINCT FROM source."fromLocationId" OR m."fromLocationId" IS NOT NULL
            OR m."createdAt" >= source."createdAt" OR m."productionOrderId" IS NOT NULL OR m."productionExecutionId" IS NOT NULL
            OR m."salesOrderId" IS NOT NULL OR m."reversalOfId" IS NOT NULL OR m."companyOwned" = false OR m."packagingOwnerCustomerId" IS NOT NULL
            OR j.status <> 'POSTED' OR NOT j."isAutoGenerated" OR j."referenceType" <> 'GOODS_RECEIPT'
            OR (SELECT count(*) FROM "JournalEntry" allj WHERE allj."referenceId" = m.id) <> 1
            OR (SELECT count(*) FROM "JournalLine" WHERE "journalEntryId" = j.id) <> 2
            OR NOT EXISTS (SELECT 1 FROM "JournalLine" WHERE "journalEntryId" = j.id AND "accountId" = inv
                AND debit = round(m.quantity * c."historicalUnitCost", 2) AND credit = 0 AND currency = 'IDR' AND "exchangeRate" = 1)
            OR NOT EXISTS (SELECT 1 FROM "JournalLine" l JOIN "Account" a ON a.id = l."accountId" WHERE l."journalEntryId" = j.id
                AND a.type = 'LIABILITY' AND a."isActive" AND a.currency = 'IDR' AND l.debit = 0 AND l.credit = round(m.quantity * c."historicalUnitCost", 2)
                AND l.currency = 'IDR' AND l."exchangeRate" = 1)
        )) THEN RAISE EXCEPTION 'ATK acquisition evidence does not prove the correction cost'; END IF;
    RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "atk_document_complete" AFTER INSERT ON "AtkCostCorrection"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_atk_complete_document();
CREATE TRIGGER "atk_movement_evidence" BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION guard_atk_cost_evidence();
CREATE TRIGGER "atk_journal_evidence" BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION guard_atk_cost_evidence();
CREATE TRIGGER "atk_line_evidence" BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION guard_atk_cost_evidence();
CREATE TRIGGER "atk_correction_immutable" BEFORE UPDATE OR DELETE ON "AtkCostCorrection" FOR EACH ROW EXECUTE FUNCTION guard_atk_cost_evidence();
CREATE TRIGGER "atk_evidence_immutable" BEFORE UPDATE OR DELETE ON "AtkCostEvidence" FOR EACH ROW EXECUTE FUNCTION guard_atk_cost_evidence();
