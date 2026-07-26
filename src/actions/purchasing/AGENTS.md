# Purchasing Module

## Purpose
Server actions for purchase orders, goods receipt, purchase invoices, returns, supplier management, and purchasing analytics.

## Key Files

| File | Purpose |
|------|---------|
| `purchasing.ts` | Purchase order CRUD, receiving, invoicing |
| `purchase-returns.ts` | Purchase return processing |
| `supplier.ts` | Supplier management |
| `supplier-360.ts` | 36° supplier view |
| `supplier-product.ts` | Supplier-product mapping |
| `purchasing-analytics.ts` | Purchasing analytics |
| `purchasing-dashboard.ts` | Dashboard data |

## Patterns

### Action Structure
```typescript
"use server";
import { withTenant } from "@/lib/core/tenant";
import { safeAction, BusinessRuleError, NotFoundError } from "@/lib/errors/errors";
import { requireAuth } from "@/lib/tools/auth-checks";

export const myAction = withTenant(async function myAction(data: InputType) {
  return safeAction(async () => {
    const session = await requireAuth();
    // ... business logic
    revalidatePath("/purchasing");
    return result;
  });
});
```

### Purchase Order Lifecycle
```
DRAFT → APPROVED → ORDERED → RECEIVED → INVOICED → CLOSED
                  ↓
              CANCELLED
```

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

| Issue | Solution |
|-------|----------|
| PO won't approve | Check approval permissions |
| Partial receipt mismatch | Use `receipts-service.ts` for partial handling |
| Invoice not linking | Ensure invoice references correct PO |
| Supplier product mapping | Use `supplier-product.ts` for mapping |
| Return quantity exceeds received | Check `returns-service.ts` validation |

## Service Layer
Business logic lives in `src/services/purchasing/`:
- `purchase-service.ts` — Core purchasing logic
- `orders-service.ts` — PO management
- `receipts-service.ts` — Goods receipt processing
- `invoices-service.ts` — Invoice management
- `returns-service.ts` — Return processing
- `walk-in-receipt-service.ts` — Walk-in receipts
- `requests-service.ts` — Purchase requests
