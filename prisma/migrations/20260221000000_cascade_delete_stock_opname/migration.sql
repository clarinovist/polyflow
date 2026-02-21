-- DropForeignKey
ALTER TABLE "StockOpnameItem" DROP CONSTRAINT "StockOpnameItem_opnameId_fkey";

-- AddForeignKey
ALTER TABLE "StockOpnameItem" ADD CONSTRAINT "StockOpnameItem_opnameId_fkey" FOREIGN KEY ("opnameId") REFERENCES "StockOpname"("id") ON DELETE CASCADE ON UPDATE CASCADE;
