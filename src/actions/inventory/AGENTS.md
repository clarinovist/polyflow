# Inventory Module

## Purpose
Server actions for stock management, transfers, adjustments, stock opname, deliveries, and inventory analytics.

## Key Files

| File | Purpose |
|------|---------|
| `inventory.ts` | Core inventory operations (stats, transfer, adjust, batches) |
| `locations.ts` | Warehouse/location management |
| `deliveries.ts` | Delivery tracking and management |
| `opname.ts` | Stock opname (physical count) |
| `product-360.ts` | 360° product inventory view |
| `stock-import.ts` | Bulk stock import from CSV |

## Patterns

### Action Structure
```typescript
"use server";
import { withTenant } from "@/lib/core/tenant";
import { safeAction, ValidationError } from "@/lib/errors/errors";
import { requireAuth } from "@/lib/tools/auth-checks";

export const myAction = withTenant(async function myAction(data: InputType) {
  return safeAction(async () => {
    const session = await requireAuth();
    // ... business logic
    revalidatePath("/inventory");
    return result;
  });
});
```

### Stock Movement Rules
- Every movement must have a **reference** (source transaction)
- Movement types: `RECEIPT`, `TRANSFER`, `ADJUSTMENT`, `CONSUMPTION`, `RETURN`, `OPNAME`
- Use `InventoryMovementService` for all movements
- Use `InventoryCoreService` for queries and stats

### Reservation System
- Reservations lock stock for pending orders
- Can be cancelled or fulfilled
- Check `ReservationService` for reservation lifecycle

## Gotchas

| Issue | Solution |
|-------|----------|
| Negative stock | Service layer prevents — check `allowNegative` flag |
| Duplicate opname count | Check `opname.test.ts` for validation rules |
| Location not found | Ensure location exists in tenant's database |
| Stock import fails | Validate CSV format with `stock-import-validator.ts` |
| Transfer between locations | Both locations must belong to same tenant |

## Service Layer
Business logic lives in `src/services/inventory/`:
- `core-service.ts` — Core inventory operations
- `movement-service.ts` — Stock movements
- `query-service.ts` — Inventory queries
- `reservation-service.ts` — Stock reservations
- `stock-opname-service.ts` — Physical count processing
- `analytics-service.ts` — Inventory analytics
