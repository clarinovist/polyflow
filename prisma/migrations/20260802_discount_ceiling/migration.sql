-- Migration: Discount ceiling for sales price control
-- Date: 2026-08-02

ALTER TABLE "Customer"
  ADD COLUMN "maxDiscountPercent" DECIMAL(5,2);
