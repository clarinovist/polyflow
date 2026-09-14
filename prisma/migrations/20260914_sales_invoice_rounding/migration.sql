-- No default/backfill: historical invoices retain their original amounts and policy.
ALTER TABLE "Invoice" ADD COLUMN "roundingAmount" DECIMAL(15,2);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_roundingAmount_check"
CHECK ("roundingAmount" IS NULL OR (
    "roundingAmount" >= 0 AND "roundingAmount" < 500
    AND "totalAmount" >= "roundingAmount"
    AND MOD("totalAmount", 500) = 0
));
