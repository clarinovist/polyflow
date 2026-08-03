# Purchasing Module

## Purpose

Server actions for purchase orders, goods receipt, purchase invoices, returns, supplier management, and purchasing analytics.

## Key Files

| File                      | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `purchasing.ts`           | Purchase order CRUD, receiving, invoicing |
| `purchase-returns.ts`     | Purchase return processing                |
| `supplier.ts`             | Supplier management                       |
| `supplier-360.ts`         | 360° supplier view                        |
| `supplier-product.ts`     | Supplier-product mapping                  |
| `purchasing-analytics.ts` | Purchasing analytics                      |
| `purchasing-dashboard.ts` | Dashboard data                            |
| `mobile-dashboard.ts`     | Mobile dashboard                          |

## Authorization Matrix

All exported actions use typed helpers from `src/lib/auth/purchasing-access.ts`.
Bare `requireAuth()` is NOT allowed at action boundaries — use the specific helper.

| Helper                        | Roles                           | Used for                                      |
| ----------------------------- | ------------------------------- | --------------------------------------------- |
| `requirePurchasingAccess`     | ADMIN, PROCUREMENT, PLANNING    | Read PO/invoice/GR/returns, supplier list     |
| `requirePurchasingApprover`   | ADMIN, PROCUREMENT              | Supplier CRUD, approve/reject/consolidate PR  |
| `requirePurchasingFinance`    | ADMIN, FINANCE                  | Create invoice, record payment, due date edit |
| `requirePurchasingCreator`    | ADMIN, PROCUREMENT, PLANNING, WAREHOUSE, PRODUCTION | Create purchase request |
| `requirePurchasingAnalyticsRead` | ADMIN, PROCUREMENT, PLANNING, FINANCE | Analytics read-only (spend, ranking) |

### Per-action guard map

**supplier.ts**
- `getSuppliers`, `getSupplierById`, `getNextSupplierCode` → `requirePurchasingAccess`
- `createSupplier`, `updateSupplier`, `deleteSupplier` → `requirePurchasingApprover`

**supplier-360.ts**
- All 5 actions → `requirePurchasingAccess`

**purchase-returns.ts**
- `getPurchaseReturns`, `getPurchaseReturnById` → `requirePurchasingAccess`
- `createPurchaseReturnAction`, `updatePurchaseReturnAction`, `confirmPurchaseReturnAction`, `shipPurchaseReturnAction`, `completePurchaseReturnAction`, `cancelPurchaseReturnAction` → `requirePurchasingAccess`

**purchasing.ts**
- `createPurchaseOrder`, `updatePurchaseOrder`, `updatePurchaseOrderStatus`, `deletePurchaseOrder` → `requirePurchasingAccess`
- `getPurchaseOrders`, `getPurchaseOrderById`, `getGoodsReceiptById`, `getGoodsReceipts`, `getPurchaseInvoiceById`, `getPurchaseInvoices` → `requirePurchasingAccess`
- `getPurchaseRequests` → `requireAuth` + inline role-based ownership (ADMIN/PROCUREMENT see all; PLANNING/WAREHOUSE/PRODUCTION see own only)
- `createManualPurchaseRequest` → `requirePurchasingCreator`
- `consolidatePurchaseRequests`, `approvePurchaseRequest`, `rejectPurchaseRequest` → `requirePurchasingApprover`
- `createPurchaseInvoice`, `recordPurchasePayment` → `requirePurchasingFinance`
- `updatePurchaseInvoiceDueDate`, `approveWalkInPurchaseInvoice`, `rejectWalkInPurchaseInvoice` → `requirePurchasingFinance`
- `createGoodsReceipt`, `createWalkInGoodsReceipt` → `requireWarehouseResourcePermission('/warehouse/incoming')` — DO NOT CHANGE

**purchasing-dashboard.ts**
- `getPurchasingShiftBoard`, `getPurchasingDashboardStats`, `getSuggestedReorderForPurchasing` → `requirePurchasingAccess`

**mobile-dashboard.ts**
- `getPurchasingMobileOverview` → `requirePurchasingAccess`

### Cross-portal exceptions

- **Finance opening-balance page** (`src/app/finance/opening-balance/page.tsx`) imports `getSuppliers` → allowed via `requirePurchasingAccess` (ADMIN, PROCUREMENT, PLANNING). Finance users with only FINANCE role are blocked; if this becomes a real issue, consider `requirePurchasingAnalyticsRead` for `getSuppliers`.
- **Warehouse incoming pages** import `createGoodsReceipt` / `createWalkInGoodsReceipt` → guarded by `requireWarehouseResourcePermission`, not purchasing roles. DO NOT CHANGE.
- **Production order detail** imports `createManualPurchaseRequest` → guarded by `requirePurchasingCreator` (includes PRODUCTION).

## Patterns

### Action Structure

```typescript
'use server';
import { withTenant } from '@/lib/core/tenant';
import { safeAction } from '@/lib/errors/errors';
import { requirePurchasingAccess } from '@/lib/auth/purchasing-access';

export const myAction = withTenant(async function myAction(data: InputType) {
    return safeAction(async () => {
        const session = await requirePurchasingAccess();
        // ... business logic
        revalidatePath('/purchasing');
        return result;
    });
});
```

### Purchase Order Lifecycle

```
PR: OPEN → APPROVED (wajib) / REJECTED (wajib alasan) → CONVERTED
PO: DRAFT → SENT → PARTIAL_RECEIVED → RECEIVED
                  ↓
              CANCELLED
```

- Purchase Request WAJIB di-approve (ADMIN/PROCUREMENT) sebelum dikonversi ke PO. Tidak ada approval PO terpisah.
- Approver metadata: `reviewedById`, `reviewedAt`, `rejectionReason` (wajib untuk REJECTED).
- Warehouse boleh membuat Goods Receipt dari PO DRAFT, SENT, atau PARTIAL_RECEIVED.
- Purchase Invoice boleh dibuat sebelum full receipt — dibatasi kuantitas diterima yang belum ditagihkan.

### Receiving Flow

1. Create PO with items and quantities
2. Receive goods (partial or full)
3. Generate purchase invoice
4. Record payment

### Walk-in Receipts

For immediate purchases without PO:

- Use `walk-in-receipt-service.ts`
- Creates receipt + invoice in one step

## Gotchas

| Issue                            | Solution                                       |
| -------------------------------- | ---------------------------------------------- |
| PR tidak bisa approve            | Hanya ADMIN/PROCUREMENT; self-approval PROCUREMENT dilarang |
| PR reject tanpa alasan           | `rejectionReason` wajib non-kosong (service invariant) |
| PR tidak bisa convert ke PO      | PR harus status APPROVED dulu; konsolidasi hanya APPROVED |
| Partial receipt mismatch         | Use `receipts-service.ts` for partial handling |
| Invoice not linking              | Ensure invoice references correct PO           |
| Supplier product mapping         | Use `supplier-product.ts` for mapping          |
| Return quantity exceeds received | Check `returns-service.ts` validation          |

## Service Layer

Business logic lives in `src/services/purchasing/`:

- `purchase-service.ts` — Core purchasing logic
- `orders-service.ts` — PO management
- `receipts-service.ts` — Goods receipt processing
- `invoices-service.ts` — Invoice management
- `returns-service.ts` — Return processing
- `walk-in-receipt-service.ts` — Walk-in receipts
- `requests-service.ts` — Purchase requests
