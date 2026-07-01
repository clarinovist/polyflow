-- Create customer-specific product pricing table.
-- ProductVariant remains the master SKU; SalesOrderItem/SalesQuotationItem keep price snapshots.
CREATE TABLE "CustomerProductPrice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProductPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerProductPrice_customerId_productVariantId_key"
    ON "CustomerProductPrice"("customerId", "productVariantId");

CREATE INDEX "CustomerProductPrice_customerId_idx"
    ON "CustomerProductPrice"("customerId");

CREATE INDEX "CustomerProductPrice_productVariantId_idx"
    ON "CustomerProductPrice"("productVariantId");

ALTER TABLE "CustomerProductPrice"
    ADD CONSTRAINT "CustomerProductPrice_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerProductPrice"
    ADD CONSTRAINT "CustomerProductPrice_productVariantId_fkey"
    FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
