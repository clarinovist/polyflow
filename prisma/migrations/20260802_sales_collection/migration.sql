-- Migration: Collection activity + sales remittance (Gap 06 - collection & AR per sales)
-- Date: 2026-08-02

-- CreateEnum
CREATE TYPE "CollectionActivityType" AS ENUM ('CALL', 'VISIT', 'PROMISE_TO_PAY', 'PARTIAL_COLLECTED', 'DISPUTE', 'UNREACHABLE');
CREATE TYPE "RemittanceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable CollectionActivity
CREATE TABLE "CollectionActivity" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CollectionActivityType" NOT NULL,
    "activityDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promisedDate" TIMESTAMP(3),
    "promisedAmount" DECIMAL(15,2),
    "outcome" TEXT,
    "notes" TEXT,
    "visitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable SalesRemittance
CREATE TABLE "SalesRemittance" (
    "id" TEXT NOT NULL,
    "remittanceNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable SalesRemittanceItem
CREATE TABLE "SalesRemittanceItem" (
    "id" TEXT NOT NULL,
    "remittanceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "method" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "paymentId" TEXT,

    CONSTRAINT "SalesRemittanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionActivity_invoiceId_idx" ON "CollectionActivity"("invoiceId");
CREATE INDEX "CollectionActivity_userId_activityDate_idx" ON "CollectionActivity"("userId", "activityDate");
CREATE INDEX "CollectionActivity_promisedDate_idx" ON "CollectionActivity"("promisedDate");
CREATE UNIQUE INDEX "SalesRemittance_remittanceNumber_key" ON "SalesRemittance"("remittanceNumber");
CREATE INDEX "SalesRemittance_userId_status_idx" ON "SalesRemittance"("userId", "status");
CREATE UNIQUE INDEX "SalesRemittanceItem_paymentId_key" ON "SalesRemittanceItem"("paymentId");

-- AddForeignKey
ALTER TABLE "CollectionActivity" ADD CONSTRAINT "CollectionActivity_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollectionActivity" ADD CONSTRAINT "CollectionActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesRemittance" ADD CONSTRAINT "SalesRemittance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesRemittanceItem" ADD CONSTRAINT "SalesRemittanceItem_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "SalesRemittance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesRemittanceItem" ADD CONSTRAINT "SalesRemittanceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
