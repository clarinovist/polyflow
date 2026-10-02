-- Preserve the business cutoff separately from the actual completion timestamp.
ALTER TABLE "StockOpname"
ADD COLUMN "effectiveDate" TIMESTAMP(3);

CREATE INDEX "StockOpname_locationId_effectiveDate_idx"
ON "StockOpname"("locationId", "effectiveDate");
