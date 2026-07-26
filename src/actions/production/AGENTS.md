# Production Module

## Purpose
Server actions for Bills of Materials (BOM), work orders, production execution, material consumption, MRP, and production reporting.

## Key Files

| File | Purpose |
|------|---------|
| `boms.ts` | BOM CRUD, duplication, cost calculation |
| `production-orders.ts` | Work order management |
| `production-execution.ts` | Production execution tracking |
| `production-materials.ts` | Material consumption recording |
| `production-demand.ts` | Demand planning |
| `production-mrp.ts` | Material Requirements Planning |
| `machines.ts` | Machine management |
| `machine-operators.ts` | Operator assignment |
| `production-shifts.ts` | Shift management |
| `production-inspection.ts` | Quality inspection |
| `production-issues.ts` | Production issue tracking |
| `downtime.ts` | Machine downtime tracking |
| `packing-report.ts` | Packing output reporting |

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
    revalidatePath("/production");
    return result;
  });
});
```

### BOM Rules
- One variant can have multiple BOMs, but only ONE is `isDefault`
- BOM items reference product variants with quantities
- Use `calculateBomCost()` for cost calculation
- Use `BomCostCascadeService` when costs change

### Production Order Lifecycle
```
DRAFT → PLANNED → IN_PROGRESS → COMPLETED → CLOSED
                  ↓
              CANCELLED
```

### Material Consumption
- Track actual vs planned consumption
- Record scrap/waste separately
- Use `execution-material-consumption.ts` for consumption logic

## Gotchas

| Issue | Solution |
|-------|----------|
| BOM cost mismatch | Run `BomCostCascadeService` to recalculate |
| Duplicate default BOM | `unsetOtherDefaultBoms()` handles this in transaction |
| Production order status stuck | Check if all materials are consumed |
| Machine not found | Ensure machine belongs to same tenant |
| Shift overlap | Check `shift-service.ts` for conflict detection |

## Service Layer
Business logic lives in `src/services/production/`:
- `production-service.ts` — Core production logic
- `bom-lifecycle-service.ts` — BOM lifecycle management
- `bom-cost-cascade-service.ts` — Cost propagation
- `execution-service.ts` — Production execution
- `material-service.ts` — Material management
- `order-service.ts` — Work order management
- `mrp-service.ts` — MRP calculations
