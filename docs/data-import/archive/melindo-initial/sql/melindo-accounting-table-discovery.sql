SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND (
    table_name ILIKE '%Journal%'
    OR table_name ILIKE '%Invoice%'
    OR table_name ILIKE '%Payment%'
    OR table_name ILIKE '%SalesOrder%'
    OR table_name ILIKE '%PurchaseOrder%'
    OR table_name ILIKE '%Inventory%'
    OR table_name ILIKE '%Stock%'
    OR table_name ILIKE '%Asset%'
    OR table_name ILIKE '%Receivable%'
    OR table_name ILIKE '%Payable%'
    OR table_name ILIKE '%Location%'
  )
ORDER BY table_name;