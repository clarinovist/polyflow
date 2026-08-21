-- Soft-hide archive support for ProductVariant.
-- Nullable timestamp: NULL = active, non-NULL = archived (hidden from active
-- catalog and new-transaction dropdowns; historical records untouched).
-- Mirrors the existing Bom.archivedAt pattern.

ALTER TABLE "ProductVariant" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "ProductVariant_archivedAt_idx" ON "ProductVariant"("archivedAt");
