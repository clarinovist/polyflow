# Fix Broken Purchasing Links
**Goal:** Resolve 404 errors by updating hardcoded paths that point to the non-existent `/dashboard/purchasing` directory.
**Root Cause:** The "Purchasing" module was refactored into "Planning", "Warehouse", and "Finance" workspaces, but internal links and `revalidatePath` calls were not updated.

## Mappings
| Old Path | New Path |
| :--- | :--- |
| `/dashboard/purchasing` | `/planning/purchase-orders` |
| `/dashboard/purchasing/orders` | `/planning/purchase-orders` |
| `/dashboard/purchasing/receipts` | `/warehouse/incoming` |
| `/dashboard/purchasing/invoices` | `/finance/invoices/purchase` |

## Task List
### 1. Update Server Actions (revalidatePath)
- [ ] `src/actions/purchasing.ts`
- [ ] `src/actions/finance.ts`

### 2. Update Components (basePath & href)
- [ ] `src/components/planning/purchasing/GoodsReceiptForm.tsx`
- [ ] `src/components/planning/purchasing/GoodsReceiptTable.tsx`
- [ ] `src/components/planning/purchasing/PurchaseOrderDetailClient.tsx`
- [ ] `src/components/planning/purchasing/PurchaseInvoiceDetailClient.tsx`
- [ ] `src/components/planning/purchasing/PurchaseInvoiceTable.tsx`
- [ ] `src/components/planning/purchasing/GoodsReceiptDetailClient.tsx`

### 3. Verify
- [ ] Run `npm run lint`
- [ ] Run `npm run build`
