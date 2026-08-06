-- Migration: PurchaseRemittance + PurchaseRemittanceItem (mirror SalesRemittance —
-- procurement/warehouse ajukan bukti bayar supplier, finance verifikasi)
-- Date: 2026-08-06
-- Reuses existing "RemittanceStatus" enum (PENDING/VERIFIED/REJECTED, created in
-- 20260802_sales_collection) — no new enum needed.

-- CreateTable PurchaseRemittance
CREATE TABLE "PurchaseRemittance" (
    "id" TEXT NOT NULL,
    "remittanceNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable PurchaseRemittanceItem
CREATE TABLE "PurchaseRemittanceItem" (
    "id" TEXT NOT NULL,
    "remittanceId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "method" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "paymentId" TEXT,
    "proofUrl" TEXT,
    "proofStorageKey" TEXT,
    "proofOriginalName" TEXT,
    "proofMimeType" TEXT,
    "proofSizeBytes" INTEGER,

    CONSTRAINT "PurchaseRemittanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRemittance_remittanceNumber_key" ON "PurchaseRemittance"("remittanceNumber");
CREATE INDEX "PurchaseRemittance_userId_status_idx" ON "PurchaseRemittance"("userId", "status");
CREATE UNIQUE INDEX "PurchaseRemittanceItem_paymentId_key" ON "PurchaseRemittanceItem"("paymentId");

-- AddForeignKey
ALTER TABLE "PurchaseRemittance" ADD CONSTRAINT "PurchaseRemittance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRemittanceItem" ADD CONSTRAINT "PurchaseRemittanceItem_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "PurchaseRemittance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseRemittanceItem" ADD CONSTRAINT "PurchaseRemittanceItem_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
