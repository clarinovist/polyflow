-- Additive: preserve all historical totals and leave unknown allocations NULL.
ALTER TABLE "Invoice" ADD COLUMN "commercialSnapshot" JSONB;

-- An issued snapshot cannot be replaced, erased, or manufactured from today's SO.
-- Draft synchronization may change snapshot and total together, never on recognition.
CREATE FUNCTION protect_invoice_commercial_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."commercialSnapshot" IS NOT NULL AND OLD.status <> 'DRAFT' THEN
            RAISE EXCEPTION 'Issued invoice snapshot must be retained; cancel instead' USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'DRAFT' AND NEW."commercialSnapshot" IS DISTINCT FROM OLD."commercialSnapshot" THEN
        RAISE EXCEPTION 'Issued invoice commercial snapshot is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status <> 'DRAFT'
       AND NEW."commercialSnapshot" IS DISTINCT FROM OLD."commercialSnapshot" THEN
        RAISE EXCEPTION 'Synchronize invoice snapshot before recognition' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."commercialSnapshot" IS NOT NULL AND OLD.status <> 'DRAFT'
       AND (NEW.status = 'DRAFT' OR NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount"
            OR NEW."roundingAmount" IS DISTINCT FROM OLD."roundingAmount"
            OR NEW."salesOrderId" IS DISTINCT FROM OLD."salesOrderId") THEN
        RAISE EXCEPTION 'Issued invoice commercial amount is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW."commercialSnapshot" IS NOT NULL AND (
        NEW."commercialSnapshot"->>'version' IS DISTINCT FROM '1'
        OR jsonb_typeof(NEW."commercialSnapshot"->'items') IS DISTINCT FROM 'array'
        OR NEW."commercialSnapshot"->>'commercialTotal' IS NULL
        OR (NEW."commercialSnapshot"->>'commercialTotal')::numeric + COALESCE(NEW."roundingAmount", 0) <> NEW."totalAmount"
    ) THEN
        RAISE EXCEPTION 'Invoice snapshot does not match commercial total' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_commercial_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION protect_invoice_commercial_snapshot();
