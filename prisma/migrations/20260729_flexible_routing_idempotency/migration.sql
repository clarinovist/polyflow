ALTER TABLE "ProductionRun" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "ProductionRun_idempotencyKey_key" ON "ProductionRun"("idempotencyKey");
