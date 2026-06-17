SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN (
    'JournalEntry','JournalLine','Invoice','Payment','SalesOrder','SalesOrderItem',
    'PurchaseInvoice','PurchasePayment','PurchaseOrder','PurchaseOrderItem',
    'Inventory','StockMovement','Location','FixedAsset'
  )
ORDER BY table_name, ordinal_position;