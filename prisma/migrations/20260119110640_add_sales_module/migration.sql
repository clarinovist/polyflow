-- CreateEnum
CREATE TYPE "SalesOrderType" AS ENUM ('MAKE_TO_STOCK', 'MAKE_TO_ORDER');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "salesOrderId" TEXT;

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "orderType" "SalesOrderType" NOT NULL DEFAULT 'MAKE_TO_STOCK',
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceLocationId" TEXT,
    "totalAmount" DECIMAL(15,2),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "deliveredQty" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "SalesOrderItem_salesOrderId_idx" ON "SalesOrderItem"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_salesOrderId_idx" ON "Invoice"("salesOrderId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
