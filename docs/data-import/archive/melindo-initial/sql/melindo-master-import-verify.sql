SELECT current_database() AS db;

SELECT 'Customer total' AS metric, COUNT(*)::text AS value FROM "Customer"
UNION ALL
SELECT 'Supplier total', COUNT(*)::text FROM "Supplier";
