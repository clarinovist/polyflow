#!/bin/bash
# Diagnostic script: Cek data AR/AP di database Melindo Rafia
# Jalankan di VPS nugrohopramono:
#   bash /tmp/melindo-ar-ap-diagnostic.sh

echo "============================================"
echo "  MELINDO RAFIA — AR/AP DIAGNOSTIC"
echo "============================================"
echo ""

DB="melindo_rafia"
USER="polyflow"

echo "1. INVOICE TABLE (Piutang/AR):"
echo "--------------------------------------------"
docker exec polyflow-db psql -U $USER -d $DB -c "
SELECT 
  status, 
  COUNT(*) as count,
  COALESCE(SUM(\"totalAmount\"), 0) as total_amount
FROM \"Invoice\"
GROUP BY status
ORDER BY count DESC;
" 2>&1

echo ""
echo "2. TOP 10 INVOICES (UNPAID/PARTIAL/OVERDUE):"
echo "--------------------------------------------"
docker exec polyflow-db psql -U $USER -d $DB -c "
SELECT 
  i.\"invoiceNumber\",
  i.status,
  i.\"totalAmount\",
  i.\"paidAmount\",
  i.\"invoiceDate\",
  i.\"dueDate\",
  so.\"orderNumber\",
  c.name as customer_name
FROM \"Invoice\" i
LEFT JOIN \"SalesOrder\" so ON i.\"salesOrderId\" = so.id
LEFT JOIN \"Customer\" c ON so.\"customerId\" = c.id
WHERE i.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
ORDER BY i.\"invoiceDate\" DESC
LIMIT 10;
" 2>&1

echo ""
echo "3. PURCHASE INVOICE TABLE (Hutang/AP):"
echo "--------------------------------------------"
docker exec polyflow-db psql -U $USER -d $DB -c "
SELECT 
  status, 
  COUNT(*) as count,
  COALESCE(SUM(\"totalAmount\"), 0) as total_amount
FROM \"PurchaseInvoice\"
GROUP BY status
ORDER BY count DESC;
" 2>&1

echo ""
echo "4. TOP 10 PURCHASE INVOICES (UNPAID/PARTIAL/OVERDUE):"
echo "--------------------------------------------"
docker exec polyflow-db psql -U $USER -d $DB -c "
SELECT 
  pi.\"invoiceNumber\",
  pi.status,
  pi.\"totalAmount\",
  pi.\"paidAmount\",
  pi.\"invoiceDate\",
  pi.\"dueDate\",
  po.\"orderNumber\",
  s.name as supplier_name
FROM \"PurchaseInvoice\" pi
LEFT JOIN \"PurchaseOrder\" po ON pi.\"purchaseOrderId\" = po.id
LEFT JOIN \"Supplier\" s ON po.\"supplierId\" = s.id
WHERE pi.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
ORDER BY pi.\"invoiceDate\" DESC
LIMIT 10;
" 2>&1

echo ""
echo "5. TENANT CONFIG:"
echo "--------------------------------------------"
docker exec polyflow-db psql -U $USER -d polyflow -c "
SELECT subdomain, \"dbUrl\" FROM \"Tenant\" WHERE subdomain = 'melindo';
" 2>&1

echo ""
echo "6. SALES ORDER COUNT (cek apakah SO ada tapi Invoice kosong):"
echo "--------------------------------------------"
docker exec polyflow-db psql -U $USER -d $DB -c "
SELECT 
  COUNT(*) as total_so,
  COUNT(DISTINCT so.\"customerId\") as unique_customers,
  SUM(so.\"totalAmount\") as total_amount
FROM \"SalesOrder\" so;
" 2>&1

echo ""
echo "7. PURCHASE ORDER COUNT:"
echo "--------------------------------------------"
docker exec polyflow-db psql -U $USER -d $DB -c "
SELECT 
  COUNT(*) as total_po,
  COUNT(DISTINCT po.\"supplierId\") as unique_suppliers,
  SUM(po.\"totalAmount\") as total_amount
FROM \"PurchaseOrder\" po;
" 2>&1

echo ""
echo "============================================"
echo "  DIAGNOSTIC SELESAI"
echo "============================================"
