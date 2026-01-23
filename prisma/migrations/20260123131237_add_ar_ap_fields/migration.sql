-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'OVERDUE';

-- AlterEnum
ALTER TYPE "PurchaseInvoiceStatus" ADD VALUE 'OVERDUE';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "termOfPaymentDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PurchaseInvoice" ADD COLUMN     "termOfPaymentDays" INTEGER NOT NULL DEFAULT 0;
