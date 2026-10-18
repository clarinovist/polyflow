-- Repair a migration-history gap: production already has these enum/columns,
-- but empty databases replayed from migrations do not. Preserve existing values.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='PpnMode' AND n.nspname=current_schema()) THEN
        CREATE TYPE "PpnMode" AS ENUM ('INCLUDE', 'EXCLUDE');
    END IF;
END $$;
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "ppnMode" "PpnMode" NOT NULL DEFAULT 'EXCLUDE';
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "ppnMode" "PpnMode" NOT NULL DEFAULT 'EXCLUDE';
