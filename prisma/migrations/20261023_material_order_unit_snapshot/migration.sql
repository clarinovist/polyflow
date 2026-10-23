-- Preserve legacy requests without inferring historical units from today's master.
-- New requests capture the variant's base unit through the service transaction.
ALTER TABLE "MaterialOrderItem" ADD COLUMN "quantityUnit" "Unit";
