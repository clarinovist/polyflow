CREATE TYPE "BarterSettlementStatus" AS ENUM ('POSTED', 'VOIDED');
CREATE TYPE "BarterLeg" AS ENUM ('AR_OFFSET', 'AP_OFFSET', 'AP_CASH');

CREATE TABLE "BarterPartner" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BarterPartner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BarterSettlement" (
    "id" TEXT NOT NULL,
    "settlementNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadFingerprint" TEXT NOT NULL,
    "barterPartnerId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "barterAmount" DECIMAL(15,2) NOT NULL,
    "cashAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "receivableBefore" DECIMAL(15,2) NOT NULL,
    "payableBefore" DECIMAL(15,2) NOT NULL,
    "receivableAfter" DECIMAL(15,2) NOT NULL,
    "payableAfter" DECIMAL(15,2) NOT NULL,
    "barterDate" TIMESTAMP(3) NOT NULL,
    "cashPaymentDate" TIMESTAMP(3),
    "cashMethod" TEXT,
    "cashAccountId" TEXT,
    "cashReferenceNumber" TEXT,
    "notes" TEXT NOT NULL,
    "status" "BarterSettlementStatus" NOT NULL DEFAULT 'POSTED',
    "arPaymentId" TEXT NOT NULL,
    "arPaymentNumber" TEXT NOT NULL,
    "apOffsetPaymentId" TEXT NOT NULL,
    "apOffsetPaymentNumber" TEXT NOT NULL,
    "apCashPaymentId" TEXT,
    "apCashPaymentNumber" TEXT,
    "offsetJournalId" TEXT,
    "offsetJournalNumber" TEXT,
    "cashJournalId" TEXT,
    "cashJournalNumber" TEXT,
    "createdById" TEXT NOT NULL,
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BarterSettlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BarterSettlement_amounts_check" CHECK (
        "barterAmount" > 0
        AND "cashAmount" >= 0
        AND "receivableBefore" >= "barterAmount"
        AND "payableBefore" >= "barterAmount" + "cashAmount"
        AND "receivableAfter" = "receivableBefore" - "barterAmount"
        AND "payableAfter" = "payableBefore" - "barterAmount" - "cashAmount"
        AND "barterAmount" <= 9999999999999.99
        AND "cashAmount" <= 9999999999999.99
    ),
    CONSTRAINT "BarterSettlement_cash_fields_check" CHECK (
        ("cashAmount" = 0 AND "cashPaymentDate" IS NULL AND "cashMethod" IS NULL AND "cashAccountId" IS NULL AND "apCashPaymentId" IS NULL AND "apCashPaymentNumber" IS NULL AND "cashJournalId" IS NULL AND "cashJournalNumber" IS NULL)
        OR
        ("cashAmount" > 0 AND "cashPaymentDate" IS NOT NULL AND "cashMethod" IS NOT NULL AND "cashAccountId" IS NOT NULL AND "apCashPaymentId" IS NOT NULL AND "apCashPaymentNumber" IS NOT NULL)
    ),
    CONSTRAINT "BarterSettlement_void_fields_check" CHECK (
        ("status" = 'POSTED' AND "voidedById" IS NULL AND "voidedAt" IS NULL AND "voidReason" IS NULL)
        OR
        ("status" = 'VOIDED' AND "voidedById" IS NOT NULL AND "voidedAt" IS NOT NULL AND COALESCE(length(trim("voidReason")), 0) > 0)
    )
);

ALTER TABLE "Payment" ADD COLUMN "barterSettlementId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "barterLeg" "BarterLeg";

CREATE UNIQUE INDEX "BarterPartner_customerId_key" ON "BarterPartner"("customerId");
CREATE UNIQUE INDEX "BarterPartner_supplierId_key" ON "BarterPartner"("supplierId");
CREATE INDEX "BarterPartner_isActive_idx" ON "BarterPartner"("isActive");

CREATE UNIQUE INDEX "BarterSettlement_settlementNumber_key" ON "BarterSettlement"("settlementNumber");
CREATE UNIQUE INDEX "BarterSettlement_idempotencyKey_key" ON "BarterSettlement"("idempotencyKey");
CREATE INDEX "BarterSettlement_barterPartnerId_status_idx" ON "BarterSettlement"("barterPartnerId", "status");
CREATE INDEX "BarterSettlement_customerId_barterDate_idx" ON "BarterSettlement"("customerId", "barterDate");
CREATE INDEX "BarterSettlement_supplierId_barterDate_idx" ON "BarterSettlement"("supplierId", "barterDate");
CREATE INDEX "BarterSettlement_invoiceId_idx" ON "BarterSettlement"("invoiceId");
CREATE INDEX "BarterSettlement_purchaseInvoiceId_idx" ON "BarterSettlement"("purchaseInvoiceId");
CREATE INDEX "BarterSettlement_arPaymentId_idx" ON "BarterSettlement"("arPaymentId");
CREATE INDEX "BarterSettlement_apOffsetPaymentId_idx" ON "BarterSettlement"("apOffsetPaymentId");
CREATE INDEX "BarterSettlement_apCashPaymentId_idx" ON "BarterSettlement"("apCashPaymentId");

CREATE UNIQUE INDEX "Payment_barterSettlementId_barterLeg_key" ON "Payment"("barterSettlementId", "barterLeg");
CREATE INDEX "Payment_barterSettlementId_idx" ON "Payment"("barterSettlementId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_barter_fields_check" CHECK (
    ("barterSettlementId" IS NULL AND "barterLeg" IS NULL)
    OR
    ("barterSettlementId" IS NOT NULL AND "barterLeg" IS NOT NULL)
);

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_barter_leg_check" CHECK (
    "barterLeg" IS NULL
    OR ("barterLeg" = 'AR_OFFSET' AND "invoiceId" IS NOT NULL AND "purchaseInvoiceId" IS NULL AND "method" = 'Barter')
    OR ("barterLeg" = 'AP_OFFSET' AND "invoiceId" IS NULL AND "purchaseInvoiceId" IS NOT NULL AND "method" = 'Barter')
    OR ("barterLeg" = 'AP_CASH' AND "invoiceId" IS NULL AND "purchaseInvoiceId" IS NOT NULL AND "method" <> 'Barter')
);

ALTER TABLE "BarterPartner" ADD CONSTRAINT "BarterPartner_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BarterPartner" ADD CONSTRAINT "BarterPartner_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BarterPartner" ADD CONSTRAINT "BarterPartner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BarterPartner" ADD CONSTRAINT "BarterPartner_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BarterSettlement" ADD CONSTRAINT "BarterSettlement_barterPartnerId_fkey" FOREIGN KEY ("barterPartnerId") REFERENCES "BarterPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BarterSettlement" ADD CONSTRAINT "BarterSettlement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BarterSettlement" ADD CONSTRAINT "BarterSettlement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BarterSettlement" ADD CONSTRAINT "BarterSettlement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BarterSettlement" ADD CONSTRAINT "BarterSettlement_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BarterSettlement" ADD CONSTRAINT "BarterSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BarterSettlement" ADD CONSTRAINT "BarterSettlement_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_barterSettlementId_fkey" FOREIGN KEY ("barterSettlementId") REFERENCES "BarterSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "assert_barter_settlement_complete"(settlement_id TEXT)
RETURNS VOID AS $$
DECLARE
    current_row "BarterSettlement"%ROWTYPE;
    leg_count INTEGER;
BEGIN
    SELECT * INTO current_row FROM "BarterSettlement" WHERE "id" = settlement_id;
    IF NOT FOUND OR current_row."status" <> 'POSTED' THEN
        RETURN;
    END IF;
    IF current_row."offsetJournalId" IS NULL OR current_row."offsetJournalNumber" IS NULL THEN
        RAISE EXCEPTION 'Posted barter settlement must have an offset journal snapshot';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "Payment"
        WHERE "id" = current_row."arPaymentId"
          AND "barterSettlementId" = current_row."id"
          AND "barterLeg" = 'AR_OFFSET'
          AND "invoiceId" = current_row."invoiceId"
          AND "amount" = current_row."barterAmount"
    ) OR NOT EXISTS (
        SELECT 1 FROM "Payment"
        WHERE "id" = current_row."apOffsetPaymentId"
          AND "barterSettlementId" = current_row."id"
          AND "barterLeg" = 'AP_OFFSET'
          AND "purchaseInvoiceId" = current_row."purchaseInvoiceId"
          AND "amount" = current_row."barterAmount"
    ) THEN
        RAISE EXCEPTION 'Posted barter settlement must have matching AR and AP offset legs';
    END IF;
    SELECT COUNT(*) INTO leg_count FROM "Payment" WHERE "barterSettlementId" = current_row."id";
    IF leg_count <> (CASE WHEN current_row."cashAmount" > 0 THEN 3 ELSE 2 END) THEN
        RAISE EXCEPTION 'Posted barter settlement has an invalid payment leg count';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "JournalEntry"
        WHERE "id" = current_row."offsetJournalId"
          AND "entryNumber" = current_row."offsetJournalNumber"
          AND "referenceType" = 'BARTER_SETTLEMENT'
          AND "referenceId" = current_row."id"
          AND "status" = 'POSTED'
    ) THEN
        RAISE EXCEPTION 'Posted barter settlement offset journal does not match';
    END IF;
    IF current_row."cashAmount" > 0 THEN
        IF current_row."cashJournalId" IS NULL OR current_row."cashJournalNumber" IS NULL THEN
            RAISE EXCEPTION 'Posted barter settlement with cash must have a cash journal snapshot';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM "Payment"
            WHERE "id" = current_row."apCashPaymentId"
              AND "barterSettlementId" = current_row."id"
              AND "barterLeg" = 'AP_CASH'
              AND "purchaseInvoiceId" = current_row."purchaseInvoiceId"
              AND "amount" = current_row."cashAmount"
        ) OR NOT EXISTS (
            SELECT 1 FROM "JournalEntry"
            WHERE "id" = current_row."cashJournalId"
              AND "entryNumber" = current_row."cashJournalNumber"
              AND "referenceType" = 'PURCHASE_PAYMENT'
              AND "referenceId" = current_row."apCashPaymentId"
              AND "status" = 'POSTED'
        ) THEN
            RAISE EXCEPTION 'Posted barter settlement cash payment or journal does not match';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "validate_barter_settlement_complete"()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM "assert_barter_settlement_complete"(NEW."id");
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "BarterSettlement_complete_check"
AFTER INSERT OR UPDATE ON "BarterSettlement"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_barter_settlement_complete"();

CREATE OR REPLACE FUNCTION "validate_barter_payment_parent"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP <> 'INSERT' AND OLD."barterSettlementId" IS NOT NULL THEN
        PERFORM "assert_barter_settlement_complete"(OLD."barterSettlementId");
    END IF;
    IF TG_OP <> 'DELETE' AND NEW."barterSettlementId" IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW."barterSettlementId" IS DISTINCT FROM OLD."barterSettlementId") THEN
        PERFORM "assert_barter_settlement_complete"(NEW."barterSettlementId");
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "Payment_barter_parent_check"
AFTER INSERT OR UPDATE OR DELETE ON "Payment"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_barter_payment_parent"();

CREATE OR REPLACE FUNCTION "validate_barter_journal_parent"()
RETURNS TRIGGER AS $$
DECLARE
    settlement_id TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        IF OLD."referenceType" = 'BARTER_SETTLEMENT' THEN
            PERFORM "assert_barter_settlement_complete"(OLD."referenceId");
        ELSIF OLD."referenceType" = 'PURCHASE_PAYMENT' THEN
            SELECT "id" INTO settlement_id FROM "BarterSettlement" WHERE "apCashPaymentId" = OLD."referenceId";
            IF settlement_id IS NOT NULL THEN
                PERFORM "assert_barter_settlement_complete"(settlement_id);
            END IF;
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "JournalEntry_barter_parent_check"
AFTER UPDATE OR DELETE ON "JournalEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_barter_journal_parent"();
