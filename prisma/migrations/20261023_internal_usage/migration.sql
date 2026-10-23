-- Additive: existing movements, balances, journals and permissions are unchanged.
CREATE TABLE "InternalUsage" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "unit" "Unit" NOT NULL,
    "locationName" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "stockBefore" DECIMAL(15,4) NOT NULL,
    "stockAfter" DECIMAL(15,4) NOT NULL,
    "inventoryAccountId" TEXT NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalUsage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InternalUsage_stock_check" CHECK ("stockBefore" > "stockAfter" AND "stockAfter" >= 0),
    CONSTRAINT "InternalUsage_accounts_check" CHECK ("inventoryAccountId" <> "expenseAccountId"),
    CONSTRAINT "InternalUsage_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InternalUsage_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InternalUsage_inventoryAccountId_fkey" FOREIGN KEY ("inventoryAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InternalUsage_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InternalUsage_number_key" ON "InternalUsage"("number");
CREATE UNIQUE INDEX "InternalUsage_requestId_key" ON "InternalUsage"("requestId");
CREATE UNIQUE INDEX "InternalUsage_movementId_key" ON "InternalUsage"("movementId");
CREATE UNIQUE INDEX "InternalUsage_journalId_key" ON "InternalUsage"("journalId");
CREATE INDEX "InternalUsage_createdAt_id_idx" ON "InternalUsage"("createdAt", "id");
CREATE INDEX "InternalUsage_department_idx" ON "InternalUsage"("department");
