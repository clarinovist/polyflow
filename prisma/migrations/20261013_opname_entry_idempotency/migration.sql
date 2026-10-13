-- Retry stock-opname detail writes safely when the first response is lost.
-- Existing rows remain valid because the client mutation ID is nullable.
ALTER TABLE "StockOpnameEntry"
ADD COLUMN "clientMutationId" TEXT;

CREATE UNIQUE INDEX "StockOpnameEntry_opnameItemId_clientMutationId_key"
ON "StockOpnameEntry"("opnameItemId", "clientMutationId");
