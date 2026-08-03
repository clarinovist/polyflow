-- AlterTable: add review metadata columns to PurchaseRequest
ALTER TABLE "PurchaseRequest" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "PurchaseRequest" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseRequest" ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "PurchaseRequest_reviewedById_idx" ON "PurchaseRequest"("reviewedById");
CREATE INDEX "PurchaseRequest_createdById_idx" ON "PurchaseRequest"("createdById");
CREATE INDEX "PurchaseRequest_status_idx" ON "PurchaseRequest"("status");
CREATE INDEX "PurchaseRequest_createdAt_idx" ON "PurchaseRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
