-- AlterTable
ALTER TABLE "StockOpname" ADD COLUMN "opnameNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StockOpname_opnameNumber_key" ON "StockOpname"("opnameNumber");
