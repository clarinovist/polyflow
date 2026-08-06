ALTER TABLE "ProductionOrder" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "ProductionOrder_clientRequestId_key" ON "ProductionOrder"("clientRequestId");
