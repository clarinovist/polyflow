-- AlterTable: add salesRepId to SalesOrder (nullable, FK to User)
ALTER TABLE "SalesOrder" ADD COLUMN "salesRepId" TEXT;

-- CreateIndex
CREATE INDEX "SalesOrder_salesRepId_idx" ON "SalesOrder"("salesRepId");

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
