CREATE TABLE IF NOT EXISTS "StockOpnameEntry" (
    "id" TEXT NOT NULL,
    "opnameItemId" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "StockOpnameEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockOpnameEntry_opnameItemId_createdAt_idx"
    ON "StockOpnameEntry"("opnameItemId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "StockOpnameEntry" ADD CONSTRAINT "StockOpnameEntry_opnameItemId_fkey"
    FOREIGN KEY ("opnameItemId") REFERENCES "StockOpnameItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "StockOpnameEntry" ADD CONSTRAINT "StockOpnameEntry_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
