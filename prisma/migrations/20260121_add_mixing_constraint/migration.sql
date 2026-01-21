DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'chk_inventory_no_negative_mixing'
	) THEN
		ALTER TABLE "Inventory"
		ADD CONSTRAINT chk_inventory_no_negative_mixing
			CHECK (NOT ("locationId" = '0c882912-ebec-44e4-8431-bae328a11436' AND "quantity" < 0));
	END IF;
END;
$$;
