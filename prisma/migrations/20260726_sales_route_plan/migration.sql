-- CreateEnum
CREATE TYPE "SalesRoutePlanStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "SalesRoutePlan" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SalesRoutePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRoutePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRoutePlanItem" (
    "id" TEXT NOT NULL,
    "routePlanId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isExtraCall" BOOLEAN NOT NULL DEFAULT false,
    "extraReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesRoutePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesRoutePlan_date_userId_key" ON "SalesRoutePlan"("date", "userId");

-- CreateIndex
CREATE INDEX "SalesRoutePlan_date_idx" ON "SalesRoutePlan"("date");

-- CreateIndex
CREATE INDEX "SalesRoutePlan_userId_idx" ON "SalesRoutePlan"("userId");

-- CreateIndex
CREATE INDEX "SalesRoutePlanItem_routePlanId_idx" ON "SalesRoutePlanItem"("routePlanId");

-- CreateIndex
CREATE INDEX "SalesRoutePlanItem_customerId_idx" ON "SalesRoutePlanItem"("customerId");

-- AddForeignKey
ALTER TABLE "SalesRoutePlan" ADD CONSTRAINT "SalesRoutePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRoutePlanItem" ADD CONSTRAINT "SalesRoutePlanItem_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "SalesRoutePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRoutePlanItem" ADD CONSTRAINT "SalesRoutePlanItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
