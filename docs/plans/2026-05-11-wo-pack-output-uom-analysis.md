# WO Pack Output UOM Analysis Plan

> Context: user request from operations asking whether Production Output for WO Pack can be entered/displayed in PACK instead of KG, or at least auto-converted from KG to PACK.

## Goal
Clarify current PolyFlow behavior for Production Output UOM, identify whether PACK/KG conversion support already exists, and define the safest implementation path.

## Current Question
Example case from ops:
- Product handled operationally in PACK
- Warehouse/base stock may already be tracked in KG
- Desired behavior: 25 KG with 250 gr per PACK should become 100 PACK

## Audit Scope
1. Production Output dialog UI
2. Production output validation schema and action
3. Production execution service and stock posting
4. Product/variant data model for unit conversion
5. Existing usage of `salesUnit` and `conversionFactor`

## Repo State Before Work
Untracked files already present before this audit:
- docs/plans/2026-05-09-melindo-fresh-start-evaluation.md
- docs/plans/2026-05-09-melindo-opening-balance-input-checklist.md
- docs/plans/2026-05-09-melindo-transactional-reset-plan.md
- docs/runbooks/2026-05-09-draft-opening-balance-rafia-only.md
- docs/runbooks/2026-05-09-melindo-audit-fresh-start-suitability.md
- docs/runbooks/2026-05-09-melindo-transactional-reset-execution.md
- scripts/melindo-reset-preflight.sql
- scripts/melindo-reset-transactional.sql

## Confirmed Findings

### 1. Production Output UI currently uses `primaryUnit`, not `salesUnit`
Main file:
- `src/components/production/order-detail/AddOutputDialog.tsx`

Observed behavior:
- UOM is derived from `order.bom.productVariant.primaryUnit`
- Header `Total Good` displays that unit directly
- Input placeholder also uses that same unit
- Scrap inputs are explicitly hardcoded as `kg`

Implication:
- If the variant primary unit is KG, output dialog will show KG
- There is no operator-facing toggle for PACK vs KG
- There is no conversion logic in this dialog today

### 2. Production Output payload only carries one quantity field
Files:
- `src/lib/schemas/production.ts`
- `src/actions/production/production.ts`
- `src/services/production/execution-service.ts`

Observed behavior:
- `productionOutputSchema` accepts only `quantityProduced` plus scrap fields
- No `enteredUnit`, `displayUnit`, `convertedQuantity`, or `conversionFactorSnapshot`
- `ProductionExecution` table stores only `quantityProduced` and scrap quantities

Implication:
- System currently records a single numeric quantity only
- There is no audit trail for “entered as PACK but stored as KG”

### 3. Stock posting and backflush assume the recorded quantity is already in the BOM/base unit
Files:
- `src/services/production/execution-output-posting.ts`
- `src/services/production/execution-material-consumption.ts`
- `src/services/production/execution-service.ts`

Observed behavior:
- `recordFinishedGoodsOutput()` posts `quantityProduced` directly into inventory movement
- `backflushMaterials()` uses `totalConsumed` based directly on `quantityProduced + scrap`
- Ratios are calculated against BOM output quantity / planned quantity

Implication:
- If UI sends PACK while downstream logic assumes KG, inventory and costing will be wrong
- A UI-only label fix would be dangerous

### 4. ProductVariant already has conversion fields, but they are not used in production output flow
Files:
- `prisma/schema.prisma`
- `src/lib/schemas/product.ts`
- `src/actions/product.ts`
- `src/components/products/VariantFields.tsx`

Observed behavior:
- `ProductVariant` has:
  - `primaryUnit`
  - `salesUnit`
  - `conversionFactor`
- Product form preview says: `1 {salesUnit} = {conversionFactor} {primaryUnit}`
- These fields appear to be designed mainly for product/sales setup, not production execution

Implication:
- Data model foundation for unit conversion already exists
- But production flow has not been wired to use it

### 5. Unit enum already supports PACK
File:
- `prisma/schema.prisma`

Observed values:
- `KG`
- `ROLL`
- `BAL`
- `PACK @map("PCS")`
- `ZAK`

Implication:
- No schema-level blocker to represent PACK
- Main gap is process logic and persistence strategy, not enum availability

## Root Cause Summary
The issue is not that PolyFlow cannot represent PACK.
The real problem is:
1. Production Output flow is based on a single quantity in `primaryUnit`
2. Existing unit conversion fields on product variants are not integrated into production execution
3. Inventory/costing/backflush all assume the submitted quantity is already in the base/BOM unit

## Recommendation

### Recommended path: keep stock/base production math in `primaryUnit`, allow operational input in alternate unit
For this case:
- Keep inventory/base math in KG if BOM/costing/warehouse already operate in KG
- Allow operator to input/display PACK when variant has:
  - `primaryUnit = KG`
  - `salesUnit = PACK`
  - `conversionFactor = 0.25`
- Convert before posting stock movement and backflush

This is the safest option because:
- inventory and costing stay internally consistent
- operator experience matches floor reality
- no fake relabeling of KG as PACK

## Avoid

### Option to avoid: UI-only relabel
Example bad fix:
- Change `KG` label to `PACK` in dialog
- Keep backend storing same raw number unchanged

Risk:
- 100 PACK could be posted as 100 KG by mistake
- stock, COGS, and consumption become invalid

### Option to avoid: switching `primaryUnit` ad hoc just for one workflow
Risk:
- affects BOM math, stock ledger, warehouse views, and any code assuming base unit semantics

## Safe Implementation Shape

### Phase 1 — analysis/decision
Decide semantic rule first:
- `primaryUnit` = base inventory/costing unit
- `salesUnit` = alternate operational/display unit
- `conversionFactor` = how many `primaryUnit` units are in 1 `salesUnit`

For example:
- `primaryUnit = KG`
- `salesUnit = PACK`
- `conversionFactor = 0.25`
- entered `100 PACK` => stored `25 KG`

### Phase 2 — UI changes
Likely file:
- `src/components/production/order-detail/AddOutputDialog.tsx`

Needed changes:
- detect alternate unit availability from product variant
- show operator-facing unit selector or auto-use operational unit for certain categories/processes
- display conversion helper text
- preview both entered qty and converted base qty

### Phase 3 — schema/action changes
Likely files:
- `src/lib/schemas/production.ts`
- `src/actions/production/production.ts`

Needed changes:
- extend payload with explicit input unit context
- validate conversion assumptions early

### Phase 4 — service changes
Likely files:
- `src/services/production/execution-service.ts`
- `src/services/production/execution-output-posting.ts`
- `src/services/production/execution-material-consumption.ts`

Needed changes:
- convert entered quantity to base quantity before stock posting/backflush
- keep base quantity as authoritative for inventory
- optionally persist original entered quantity/unit for auditability

### Phase 5 — persistence improvement (recommended)
Likely schema change:
- `ProductionExecution` add fields like:
  - `enteredQuantity`
  - `enteredUnit`
  - `conversionFactorSnapshot`

Reason:
- preserves historical truth even if product conversion changes later
- allows reporting “operator entered 100 PACK = 25 KG”

## Key Files Identified
- `src/components/production/order-detail/AddOutputDialog.tsx`
- `src/lib/schemas/production.ts`
- `src/actions/production/production.ts`
- `src/services/production/execution-service.ts`
- `src/services/production/execution-output-posting.ts`
- `src/services/production/execution-material-consumption.ts`
- `src/components/products/VariantFields.tsx`
- `src/components/products/ProductForm.tsx`
- `src/lib/schemas/product.ts`
- `src/actions/product.ts`
- `prisma/schema.prisma`

## Recommendation to Product/Operations Right Now
Short answer to ops:
- Yes, conceptually this can be supported.
- But current implementation still follows base unit from the product/BOM, and production posting is not yet wired for PACK-to-KG conversion.
- So the safe solution is not just changing the label; it needs conversion-aware production logic.

## Next Step
If approved, next deliverable should be an implementation plan with exact field changes, migration strategy, test cases, and rollout notes.