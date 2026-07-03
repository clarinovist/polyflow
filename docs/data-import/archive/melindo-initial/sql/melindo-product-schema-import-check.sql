SELECT current_database() AS db;

SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='ProductVariant'
ORDER BY ordinal_position;

SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='Product'
ORDER BY ordinal_position;
