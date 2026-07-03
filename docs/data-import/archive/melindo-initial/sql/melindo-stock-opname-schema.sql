SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('StockOpname','StockOpnameItem')
ORDER BY table_name, ordinal_position;