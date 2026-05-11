# WO Pack Output UOM Implementation Plan

> For Hermes: use test-driven-development and systematic-debugging. Do not ship a UI-only label change. Inventory/costing must keep using authoritative base quantity.

Goal: allow operator to record Production Output for WO Pack in PACK while PolyFlow continues posting inventory, costing, and backflush in the variant base unit.

Architecture: keep `ProductVariant.primaryUnit` as the authoritative inventory/costing unit, use `salesUnit` + `conversionFactor` as the operator/display unit when appropriate, and convert operator-entered quantity into base quantity before stock movement and backflush. Persist both the entered quantity/unit and the computed base quantity so historical records remain auditable even if conversion changes later.

Tech stack: Next.js app router, React client components, Prisma, Zod, Vitest, TypeScript.

---

## Problem Statement

Current behavior:
- Production Output dialog reads `order.bom.productVariant.primaryUnit` and uses it as the only output unit.
- Backend accepts only one numeric `quantityProduced` field.
- Stock posting and backflush treat `quantityProduced` as already being in the base/BOM unit.

Business need:
- For packing workflows, operator wants to input output in PACK.
- Example: 1 PACK = 0.25 KG; input 100 PACK should post as 25 KG.

Non-goal:
- Do not switch warehouse/costing to PACK-only.
- Do not fake the UI by relabeling KG as PACK without changing downstream logic.

---

## Recommendation

Use this semantic model consistently:
- `primaryUnit` = authoritative base unit for inventory/costing/BOM math
- `salesUnit` = operator/display/transaction unit when alternate unit is needed
- `conversionFactor` = number of `primaryUnit` contained in 1 `salesUnit`

Example:
- `primaryUnit = KG`
- `salesUnit = PACK`
- `conversionFactor = 0.25`
- entered `100 PACK`
- stored base quantity = `25 KG`

For WO Pack specifically, prefer using `salesUnit` when all of these are true:
1. BOM category is `PACKING`
2. variant `salesUnit` exists and differs from `primaryUnit`
3. variant `conversionFactor > 0`

Fallback rule:
- if any of the above is not true, UI and backend continue using `primaryUnit`

---

## Files to Change

Primary files:
- `prisma/schema.prisma`
- `src/lib/schemas/production.ts`
- `src/actions/production/production.ts`
- `src/actions/production/production.ts:196-301` (`getProductionOrder` include shape)
- `src/components/production/order-detail/types.ts`
- `src/components/production/order-detail/AddOutputDialog.tsx`
- `src/app/planning/orders/[id]/production-order-detail.tsx:407-458` (execution history table)
- `src/services/production/execution-service.ts`
- `src/services/production/execution-output-posting.ts`
- `src/services/production/execution-material-consumption.ts`
- `src/services/__tests__/production-service.test.ts`

Supporting/reference files to inspect during implementation:
- `src/components/products/VariantFields.tsx:68-73, 224-293`
- `src/lib/schemas/product.ts:14-16`
- `src/actions/product.ts:282-293, 411-416`
- `src/app/planning/orders/[id]/page.tsx`

New files likely needed:
- `prisma/migrations/<timestamp>_production_execution_uom_audit/migration.sql`
- optional helper: `src/services/production/execution-unit-conversion.ts`
- optional focused tests: `src/services/production/__tests__/execution-unit-conversion.test.ts`

---

## Data Model Changes

### ProductionExecution additions

Add fields to preserve what the operator entered versus what the system posted:
- `enteredQuantity Decimal? @db.Decimal(15, 4)`
- `enteredUnit Unit?`
- `conversionFactorSnapshot Decimal? @db.Decimal(10, 4)`

Keep existing field:
- `quantityProduced Decimal @db.Decimal(15, 4)`

Interpretation after change:
- `quantityProduced` = authoritative base quantity in `primaryUnit`
- `enteredQuantity` = raw quantity typed by operator
- `enteredUnit` = unit seen/used by operator
- `conversionFactorSnapshot` = conversion at record time, used for history/audit

Why snapshot is required:
- product master conversion may change later
- old execution history must remain reconstructable

Migration notes:
- existing rows stay valid with null `entered*` fields
- history UI should fall back to showing base quantity for old rows

---

## API / Schema Contract Changes

### Current issue
`productionOutputSchema` only accepts `quantityProduced`.

### New contract
Extend `productionOutputSchema` in `src/lib/schemas/production.ts` with:
- `enteredQuantity: z.coerce.number().positive(...)`
- `enteredUnit: z.nativeEnum(Unit)`
- `baseQuantityProduced: z.coerce.number().positive(...)`
- `conversionFactorSnapshot: z.coerce.number().positive().optional()`

Then keep backward-compatible mapping in service layer:
- `quantityProduced` stored in `ProductionExecution` should become `baseQuantityProduced`
- reject inconsistent payloads where:
  - `enteredUnit === primaryUnit` but `baseQuantityProduced !== enteredQuantity`
  - `enteredUnit !== primaryUnit` and no valid conversion snapshot exists

Do not trust UI silently. Server should recompute/verify conversion using the order variant.

---

## UI / UX Changes

### AddOutputDialog behavior

File:
- `src/components/production/order-detail/AddOutputDialog.tsx`

Required behavior:
1. Read from `order.bom.productVariant`:
   - `primaryUnit`
   - `salesUnit`
   - `conversionFactor`
2. Compute whether alternate operator unit is available.
3. For packing orders with valid alternate unit:
   - input box uses `salesUnit`
   - header shows operator-facing total in `salesUnit`
   - helper text shows conversion preview, e.g. `1 PACK = 0.25 KG`
   - base preview shows computed quantity, e.g. `100 PACK = 25 KG`
4. For all other orders:
   - preserve current primary-unit behavior
5. Scrap stays in KG for now unless product/domain rules say otherwise

Recommended UI copy:
- total header: `Total Good`
- helper preview: `Posting to stock as 25.00 KG`
- tooltip/help text: `1 PACK = 0.25 KG`

Do not expose a free-form manual unit selector in v1 if not needed. For this use case, derived behavior is safer than operator choice.

---

## Service Logic Changes

### Rule
All inventory posting and BOM consumption must use base quantity only.

### Execution service

File:
- `src/services/production/execution-service.ts`

Required changes:
- accept `enteredQuantity`, `enteredUnit`, `baseQuantityProduced`, `conversionFactorSnapshot`
- persist all of them to `ProductionExecution`
- update production order `actualQuantity` using `baseQuantityProduced`
- pass base quantity only to:
  - `recordFinishedGoodsOutput()`
  - `backflushMaterials()`
  - journal trigger

### Output posting

File:
- `src/services/production/execution-output-posting.ts`

Required changes:
- no unit math here; function should receive already-converted base quantity
- rename local variables/comments to make base-unit semantics explicit

### Material backflush

File:
- `src/services/production/execution-material-consumption.ts`

Required changes:
- no unit math here; use base quantity only
- rename parameter/comments from generic `totalConsumed` source assumptions to “base quantity consumed” semantics where needed

### Server-side verification

Before creating execution row:
- fetch production order with BOM output variant
- if entered unit equals primary unit: base quantity must equal entered quantity
- if entered unit equals sales unit: expected base quantity = entered quantity * conversionFactor
- if entered unit is neither: reject
- if `conversionFactor <= 0`: reject

Tolerance:
- compare decimals with small tolerance, e.g. `0.0001`

---

## Query / Type Changes

### Production order fetch must include conversion fields

File:
- `src/actions/production/production.ts:199-297`

Ensure `getProductionOrder()` returns on `bom.productVariant` at least:
- `primaryUnit`
- `salesUnit`
- `conversionFactor`

### ExtendedProductionOrder type

File:
- `src/components/production/order-detail/types.ts`

Ensure type shape for `bom.productVariant` includes those fields explicitly so `AddOutputDialog` can use them without `any` assumptions.

### Execution history UI

File:
- `src/app/planning/orders/[id]/production-order-detail.tsx:421-454`

Recommended display for new rows:
- Output column shows operator-facing + base summary when `enteredUnit` differs from base unit
- Example:
  - `+100 PACK`
  - subtext: `posted as 25 KG`

Fallback for old rows:
- show current base quantity only

---

## Testing Strategy

Use strict TDD. No production code before failing tests.

Primary test file:
- `src/services/__tests__/production-service.test.ts`

Add coverage for at least these cases:

1. Packing conversion path
- Given `primaryUnit=KG`, `salesUnit=PACK`, `conversionFactor=0.25`
- When entered `100 PACK`
- Then `quantityProduced` stored/posted = `25`
- And FG stock movement quantity = `25`
- And backflush ratio uses `25`, not `100`

2. Base-unit direct path
- Given entered unit equals primary unit KG
- When entered `25 KG`
- Then stored/posted base quantity = `25`
- And no conversion distortion happens

3. Invalid unit mismatch rejected
- Given entered unit `PACK` but variant has no `salesUnit=PACK`
- Server should throw validation/business rule error

4. Invalid conversion rejected
- Given `conversionFactor=0`
- Request rejected

5. Execution history persistence
- New execution row stores:
  - `enteredQuantity`
  - `enteredUnit`
  - `conversionFactorSnapshot`
  - `quantityProduced` base qty

6. Backward compatibility
- Existing executions with null entered fields still render without crash in production detail page

Optional extra tests:
- rounding to 4 decimals
- PACKING category uses alternate unit, non-PACKING category falls back to base unit

---

## Validation Commands

Minimum verification after each code phase:

1. Unit/service tests
- `npx vitest run src/services/__tests__/production-service.test.ts`

2. Lint
- `npm run lint`

3. Build
- `npx next build`

4. If Prisma schema changes
- `npx prisma generate`
- `npx prisma migrate dev --name production-execution-uom-audit`

If implementation touches additional UI logic with extracted helpers, run focused tests for those files too.

---

## Rollout Plan

### Phase 0 — confirm semantics before coding
Decision to lock before implementation:
- authoritative base unit remains `primaryUnit`
- production alternate input unit uses `salesUnit`
- only packing workflow auto-prefers alternate unit in v1

Acceptance:
- written approval on semantics before code changes

### Phase 1 — persistence and contract foundation
Tasks:
1. Add new Prisma fields to `ProductionExecution`
2. Generate migration
3. Extend `productionOutputSchema`
4. Extend `getProductionOrder()` include + type definitions

Acceptance:
- build passes
- no runtime/type regressions

### Phase 2 — service conversion logic
Tasks:
1. Add failing service tests for conversion flow
2. Implement server-side conversion verification
3. Persist entered/base fields
4. Ensure stock posting and backflush use base quantity only

Acceptance:
- production-service tests pass
- base quantity used everywhere downstream

### Phase 3 — UI changes in AddOutputDialog
Tasks:
1. Add alternate-unit computation from variant data
2. Send both entered and base quantities in payload
3. Show conversion preview in dialog
4. Preserve fallback behavior when no alternate unit is configured

Acceptance:
- manual QA on KG-only and PACK-with-conversion cases
- no UI regression for non-packing orders

### Phase 4 — execution history display
Tasks:
1. Update execution table display
2. Show entered quantity when available
3. Keep backward-compatible fallback for historical rows

Acceptance:
- old rows render
- new rows display operator-facing quantity plus base posting summary

### Phase 5 — QA / rollout checklist
Tasks:
1. Create one PACK-enabled test product/variant
2. Verify dialog shows PACK and conversion helper
3. Submit output and inspect DB row
4. Verify stock movement quantity in base unit
5. Verify actual quantity on order reflects base unit
6. Verify execution history shows entered unit clearly

Acceptance:
- example case `100 PACK @ 0.25 KG` posts exactly `25 KG`

---

## Suggested Task Breakdown (execution-ready)

### Task 1: Add failing tests for conversion-aware production output
Objective: prove current production service cannot safely support PACK input yet.

Files:
- Modify: `src/services/__tests__/production-service.test.ts`

Steps:
1. Add a failing test for `100 PACK -> 25 KG`
2. Add a failing test for invalid unit mismatch rejection
3. Run:
   - `npx vitest run src/services/__tests__/production-service.test.ts`
4. Expected before implementation:
   - tests fail because service has no entered/base unit handling

### Task 2: Extend ProductionExecution persistence model
Objective: make execution rows auditable.

Files:
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_production_execution_uom_audit/migration.sql`

Steps:
1. Add `enteredQuantity`, `enteredUnit`, `conversionFactorSnapshot`
2. Run:
   - `npx prisma generate`
   - `npx prisma migrate dev --name production-execution-uom-audit`
3. Verify Prisma client types update cleanly

### Task 3: Extend server schema contract
Objective: make API payload explicitly carry entered/base quantities.

Files:
- Modify: `src/lib/schemas/production.ts`
- Modify: `src/actions/production/production.ts`

Steps:
1. Add new fields to `productionOutputSchema`
2. Keep server action validation strict
3. Re-run service tests and expect they still fail for service logic, not schema shape

### Task 4: Implement conversion verification in ProductionService
Objective: server becomes source of truth for conversion correctness.

Files:
- Modify: `src/services/production/execution-service.ts`
- Optional create: `src/services/production/execution-unit-conversion.ts`

Steps:
1. Fetch output variant and its unit config
2. Verify entered/base quantity relationship
3. Persist entered fields + base `quantityProduced`
4. Update `actualQuantity` using base quantity
5. Re-run tests until green

### Task 5: Keep downstream posting strictly base-unit only
Objective: prevent future regressions from mixed-unit assumptions.

Files:
- Modify: `src/services/production/execution-output-posting.ts`
- Modify: `src/services/production/execution-material-consumption.ts`

Steps:
1. Clarify comments/variable names to reflect base quantity
2. Ensure no alternate-unit math leaks downstream
3. Re-run service tests

### Task 6: Expose unit-conversion data to UI
Objective: AddOutputDialog has the data it needs.

Files:
- Modify: `src/actions/production/production.ts:199-297`
- Modify: `src/components/production/order-detail/types.ts`

Steps:
1. Ensure `salesUnit` + `conversionFactor` are present in order payload
2. Type them explicitly in `ExtendedProductionOrder`
3. Verify production detail page still renders

### Task 7: Update AddOutputDialog UX
Objective: operator can input PACK safely.

Files:
- Modify: `src/components/production/order-detail/AddOutputDialog.tsx`

Steps:
1. Add derived flags for alternate unit availability
2. Compute base total from entered values
3. Show helper text and base posting preview
4. Submit both entered/base quantities
5. Preserve current behavior for non-conversion cases

### Task 8: Update execution history table
Objective: history remains understandable after mixed-unit input.

Files:
- Modify: `src/app/planning/orders/[id]/production-order-detail.tsx:421-454`

Steps:
1. Display entered quantity/unit when available
2. Show subtext for base posted quantity
3. Fall back for old rows

### Task 9: Final verification
Objective: confirm feature works end-to-end without breaking production flow.

Steps:
1. Run:
   - `npx vitest run src/services/__tests__/production-service.test.ts`
   - `npm run lint`
   - `npx next build`
2. Manual QA on one KG-only item and one PACK-enabled item
3. Verify DB row + stock movement quantities

---

## Risks and Mitigations

Risk 1: operator-facing PACK input accidentally posts PACK as KG
- Mitigation: server-side recomputation/verification, not UI trust

Risk 2: historical execution rows lack new fields
- Mitigation: nullable migration + UI fallback

Risk 3: conversion semantics misunderstood (`1 PACK = 0.25 KG` vs inverse)
- Mitigation: standardize preview text in product form and production dialog; document that `conversionFactor` means base unit per sales unit

Risk 4: non-packing flows regress
- Mitigation: keep alternate-unit behavior opt-in and derived only when valid

Risk 5: future product master change rewrites historical meaning
- Mitigation: persist `conversionFactorSnapshot`

---

## Product / Ops Acceptance Criteria

Feature is done only if all are true:
- packing operator can enter output in PACK
- system clearly shows PACK-to-KG conversion before submit
- stock movement posts in KG/base unit
- BOM consumption/backflush uses KG/base unit
- execution history shows what operator entered and what stock received
- KG-only products still behave exactly as before

---

## Recommended Reply to Stakeholders

“Bisa, tapi implementasinya harus conversion-aware. Output operator bisa diinput dalam PACK, lalu sistem auto-konversi ke KG sebagai unit dasar untuk warehouse dan costing. Jadi misalnya 100 PACK dengan 250 gr/pack akan diposting sebagai 25 KG. Ini lebih aman daripada hanya mengganti label satuan di layar.”

---

## Execution Note

This plan is intentionally biased toward safety and auditability. If later needed, we can simplify UI polish, but we should not simplify the data contract or inventory posting rules.