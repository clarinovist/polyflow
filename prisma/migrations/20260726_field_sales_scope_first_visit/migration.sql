-- Migration: Field Sales Scope, Customer Ownership, and First Visit
-- Date: 2026-07-26

-- 1. New enums
CREATE TYPE "CustomerLifecycleStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE', 'MERGED');
CREATE TYPE "SalesVisitExtraReason" AS ENUM ('TOKO_BARU', 'DEKAT_RUTE', 'PERMINTAAN_DADAKAN', 'TOKO_TUTUP_GANTI');
CREATE TYPE "SalesVisitReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- 2. Customer: add lifecycle, attribution, and source fields
ALTER TABLE "Customer" ADD COLUMN "lifecycleStatus" "CustomerLifecycleStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Customer" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Customer" ADD COLUMN "verifiedAt" TIMESTAMPTZ;
ALTER TABLE "Customer" ADD COLUMN "verifiedById" TEXT;
ALTER TABLE "Customer" ADD COLUMN "mergedIntoId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "source" TEXT;

-- 3. SalesVisit: add EC metadata, route link, idempotency key
ALTER TABLE "SalesVisit" ADD COLUMN "clientVisitId" TEXT;
ALTER TABLE "SalesVisit" ADD COLUMN "routePlanItemId" TEXT;
ALTER TABLE "SalesVisit" ADD COLUMN "isExtraCall" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesVisit" ADD COLUMN "extraReason" "SalesVisitExtraReason";
ALTER TABLE "SalesVisit" ADD COLUMN "reviewStatus" "SalesVisitReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED';

-- 4. Create CustomerSalesAssignment table
CREATE TABLE "CustomerSalesAssignment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMPTZ,
    "assignedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CustomerSalesAssignment_pkey" PRIMARY KEY ("id")
);

-- 5. Foreign keys
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesVisit" ADD CONSTRAINT "SalesVisit_routePlanItemId_fkey" FOREIGN KEY ("routePlanItemId") REFERENCES "SalesRoutePlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerSalesAssignment" ADD CONSTRAINT "CustomerSalesAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerSalesAssignment" ADD CONSTRAINT "CustomerSalesAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerSalesAssignment" ADD CONSTRAINT "CustomerSalesAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Indexes
CREATE UNIQUE INDEX "CustomerSalesAssignment_one_active_primary" ON "CustomerSalesAssignment"("customerId") WHERE "isPrimary" = true AND "unassignedAt" IS NULL;
CREATE INDEX "CustomerSalesAssignment_userId_unassignedAt_idx" ON "CustomerSalesAssignment"("userId", "unassignedAt");
CREATE INDEX "CustomerSalesAssignment_customerId_unassignedAt_idx" ON "CustomerSalesAssignment"("customerId", "unassignedAt");
CREATE UNIQUE INDEX "SalesVisit_userId_clientVisitId_key" ON "SalesVisit"("userId", "clientVisitId");
CREATE INDEX "SalesVisit_routePlanItemId_idx" ON "SalesVisit"("routePlanItemId");
CREATE INDEX "SalesVisit_isExtraCall_checkInTime_idx" ON "SalesVisit"("isExtraCall", "checkInTime");
