-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "hourlyRate" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "costPerHour" DECIMAL(10,2) NOT NULL DEFAULT 0;
