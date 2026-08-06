-- Add proof-of-payment photo fields to SalesRemittanceItem (marketing/sales
-- upload bukti transfer WA, finance verify before recordCustomerPayment runs)
ALTER TABLE "SalesRemittanceItem" ADD COLUMN "proofUrl" TEXT;
ALTER TABLE "SalesRemittanceItem" ADD COLUMN "proofStorageKey" TEXT;
ALTER TABLE "SalesRemittanceItem" ADD COLUMN "proofOriginalName" TEXT;
ALTER TABLE "SalesRemittanceItem" ADD COLUMN "proofMimeType" TEXT;
ALTER TABLE "SalesRemittanceItem" ADD COLUMN "proofSizeBytes" INTEGER;

-- Notify FINANCE users when a new remittance is submitted PENDING
ALTER TYPE "NotificationType" ADD VALUE 'REMITTANCE_PENDING';
