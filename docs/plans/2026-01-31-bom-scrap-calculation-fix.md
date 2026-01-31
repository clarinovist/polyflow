# BOM Scrap Calculation Fix Implementation Plan

**Goal:** Ensure that `scrapPercentage` defined in the Bill of Materials (BOM) is correctly accounted for in UI summaries, MRP simulations, and Production Order creation.

**Architecture:** 
- Update UI components to include scrap in cost calculations.
- Update `MrpService` to include scrap in material requirement calculations and planned material quantities.
- Use the existing `calculateBomCost` utility where applicable.

**Tech Stack:** Next.js (React), TypeScript, Prisma, Tailwind CSS.

---

## Proposed Changes

### [BOM Components]

#### [MODIFY] [BOMForm.tsx](file:///Users/nugroho/Documents/polyflow/src/components/production/bom/BOMForm.tsx)
- Update "Total Formula Investment" calculation to include scrap.
- Ensure `lineCost` also includes scrap.

#### [MODIFY] [BOMDetails.tsx](file:///Users/nugroho/Documents/polyflow/src/components/production/bom/BOMDetails.tsx)
- Add "Scrap %" column to the ingredients table.
- Update "Total Formula Cost" calculation to include scrap.

---

### [MRP Service]

#### [MODIFY] [mrp-service.ts](file:///Users/nugroho/Documents/polyflow/src/services/mrp-service.ts)
- Update `explodeRecursively` to include scrap in material requirement quantities.
- Update `createWorkOrderHierarchy` to include scrap in `plannedMaterials` quantities.

---

## Verification Plan

### Automated Tests
- Run existing BOM tests: `npm test tests/actions/boms.test.ts`
- Create a new test case for BOM with scrap and verify `standardCost` update.

### Manual Verification
1. Create a BOM with 10% scrap on a material.
2. Verify "Total Formula Investment" in the form shows the increased cost.
3. Save and view details, verify the cost is consistent.
4. Create a Sales Order for the product.
5. Check Planning -> Simulate, verify "Needed Qty" includes the 10% scrap.
6. Convert SO to WO, verify the created Production Order has higher "Planned Quantity" for that material.
