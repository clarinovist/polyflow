Manual migration folder to add constraint preventing negative inventory for Mixing Warehouse.

This change was applied directly to the running DB during incident response. If you use Prisma Migrate in CI, ensure you add an equivalent migration or run the SQL below.

SQL:

ALTER TABLE "Inventory" ADD CONSTRAINT chk_inventory_no_negative_mixing CHECK (NOT ("locationId" = '0c882912-ebec-44e4-8431-bae328a11436' AND "quantity" < 0));
