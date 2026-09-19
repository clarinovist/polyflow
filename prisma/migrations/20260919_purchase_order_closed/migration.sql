-- Additive and safe for each tenant database, including empty tables.
-- Keep this enum value on rollback; CLOSED must not be reclassified as RECEIVED.
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
