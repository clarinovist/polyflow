-- Migration: SalesTarget + CommissionScheme/CommissionTier (Gap 04 - target & komisi)
-- Date: 2026-08-02

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('SALES_ORDER', 'ISSUED_INVOICE', 'PAID_INVOICE');

-- CreateTable SalesTarget
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "revenueTarget" DECIMAL(15,2) NOT NULL,
    "visitTarget" INTEGER,
    "orderTarget" INTEGER,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable CommissionScheme
CREATE TABLE "CommissionScheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "basis" "CommissionBasis" NOT NULL DEFAULT 'PAID_INVOICE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable CommissionTier
CREATE TABLE "CommissionTier" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "minAchievementPercent" DECIMAL(5,2) NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_userId_periodYear_periodMonth_key" ON "SalesTarget"("userId", "periodYear", "periodMonth");
CREATE INDEX "SalesTarget_periodYear_periodMonth_idx" ON "SalesTarget"("periodYear", "periodMonth");
CREATE INDEX "CommissionTier_schemeId_idx" ON "CommissionTier"("schemeId");

-- AddForeignKey
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionTier" ADD CONSTRAINT "CommissionTier_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "CommissionScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
