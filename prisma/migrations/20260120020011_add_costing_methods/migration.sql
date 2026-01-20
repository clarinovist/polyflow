-- CreateEnum
CREATE TYPE "CostingMethod" AS ENUM ('WEIGHTED_AVERAGE', 'STANDARD_COST');

-- DropForeignKey
ALTER TABLE "SalesOrder" DROP CONSTRAINT "SalesOrder_customerId_fkey";

-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "averageCost" DECIMAL(15,4);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "costingMethod" "CostingMethod" NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
ADD COLUMN     "standardCost" DECIMAL(15,4);

-- AlterTable
ALTER TABLE "SalesOrder" ALTER COLUMN "customerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
