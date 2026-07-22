-- CreateEnum
CREATE TYPE "ProductionPriority" AS ENUM ('URGENT', 'NORMAL', 'LOW');

-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN "priority" "ProductionPriority" NOT NULL DEFAULT 'NORMAL';
