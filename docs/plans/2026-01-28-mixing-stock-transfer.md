# Mixing Work Order Stock Transfer Implementation Plan
**Goal:** Enable "Transfer Stock" workflow for Mixing Work Orders (replacing "Issue Material") even when a specific machine hasn't been assigned yet.
**Architecture:** Update the `isMixing` detection logic in the client component to verify order characteristics (BOM name/Order Number) in addition to Machine Type. Update the `BatchIssueMaterialDialog` to allow stock transfers to the Production Location.
**Tech Stack:** React, Next.js, Prisma, Server Actions.

### Task 1: Update Mixing Detection Logic
**Files:**
- Modify: `src/components/production/order-detail/BatchIssueMaterialDialog.tsx`
- Modify: `src/components/production/order-detail/types.ts` (if needed)

**Step 1: Write the failing test (Conceptual)**
*Note: Since we don't have a rigid test suite, we simulate the condition.*
Condition: Order has no machine assigned, but BOM name includes "Mixing".
Expected: Dialog shows "Transfer Material".
Actual: Dialog shows "Issue Material".

**Step 2: Update `isMixing` logic in `BatchIssueMaterialDialog.tsx`**
Currently:
```typescript
const isMixing = order.machine?.type === 'MIXER';
```

Proposal:
```typescript
const isMixing = order.machine?.type === 'MIXER' || 
                 (order.bom?.name || '').toLowerCase().includes('mix') || 
                 (order.orderNumber || '').includes('MIX');
```
*Refinement:* We should also check if `order.bom.productVariant.name` implies mixing.

**Step 3: Handle Unassigned Machine in Transfer Logic**
In `onSubmit`:
We need to ensure `order.location.id` is a valid destination.
If `isMixing` is true, strict validation that `sourceLocationId !== destinationLocationId`.

**Step 4: Verify UI Changes**
- Dialog Title: "Transfer Materials to Mixing Area"
- Button Label: "Move Stock to Mixing"
- Warning Text: "Items will be MOVED to {order.location.name}"

### Task 2: Validate Transfer Execution
**Files:**
- Modify: `src/app/[locale]/planning/orders/[id]/page.tsx` (ensure BOM data is sufficient)

**Step 1: Ensure Backend Support**
Verify `transferStockBulk` in `src/actions/inventory.ts` supports the transfer. (Already exists).

**Step 2: Verify `ProductionOrderDetail` props**
Ensure `order.bom` is passed with name. (Already exists).

### Task 3: UX Improvements
**Files:**
- Modify: `src/components/production/order-detail/BatchIssueMaterialDialog.tsx`

**Step 1: Add Staging Location Warning**
If `isMixing` is true but `order.location.id` is a Warehouse (not a Production/Staging area), warn the user.
"Warning: You are transferring stock to main Warehouse location. Please ensure this Order is set to a Production Staging location."

**Step 2: Commit & Verify**
```bash
npm run type-check # implicit in build but good to run fast
npm run lint
npm run build
git add src/components/production/order-detail/BatchIssueMaterialDialog.tsx
git commit -m "feat: enable stock transfer for unassigned mixing orders"
```
