# Production Dispatch Portal Actions Implementation

This plan details the steps to make the "Dispatch Shortcuts" and "Manage Detail" buttons functional within the Production Superintendent Portal.

## User Review Required

> [!IMPORTANT]
> **Rescheduling Logic**: Rescheduling an order will update its `plannedStartDate`. If an order is already `IN_PROGRESS`, rescheduling might be restricted or restricted to future completions.
> **Machine Reassignment**: Moving a work center will update the `machineId`. This is allowed for `RELEASED` orders.

## Proposed Changes

### Core Logic

#### [MODIFY] [production.ts](file:///Users/nugroho/Documents/polyflow/src/lib/schemas/production.ts)
- Update `updateProductionOrderSchema` to include `plannedStartDate: z.date().optional()`.

#### [MODIFY] [production.ts](file:///Users/nugroho/Documents/polyflow/src/actions/production.ts)
- Ensure `updateProductionOrder` correctly handles `plannedStartDate`.

---

### UI Components

#### [NEW] [ReassignMachineDialog.tsx](file:///Users/nugroho/Documents/polyflow/src/components/production/dispatch/ReassignMachineDialog.tsx)
- A dialog to select a new machine for a production order.

#### [NEW] [RescheduleOrderDialog.tsx](file:///Users/nugroho/Documents/polyflow/src/components/production/dispatch/RescheduleOrderDialog.tsx)
- A dialog to select a new planned start date.

---

### Integration

#### [MODIFY] [page.tsx](file:///Users/nugroho/Documents/polyflow/src/app/production/dispatch/page.tsx)
- Integrate the new dialogs.
- Link "Manage Detail" to `/dashboard/production/orders/[id]`.
- (Optional) Implement a simple way to record handover notes if desired, or keep as a functional text area.

## Verification Plan

### Automated Tests
- N/A (Manual verification focus)

### Manual Verification
1. Login as PRODUCTION.
2. Go to `/production/dispatch`.
3. Click "Move Work Center" on an order -> Select new machine -> Verify update.
4. Click "Reschedule Order" -> Select new date -> Verify update.
5. Click "Manage Detail" -> Verify navigation to dashboard detail page.
