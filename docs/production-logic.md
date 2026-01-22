# Production Module Business Logistics & Rules

## 1. Production Start & Execution
- **Trigger:** Button "START JOB" on Kiosk/Operator Interface.
- **Validation:** 
  - Checks if Machine/Operator/Shift is assigned (Optional depending on strictness).
  - **Does NOT check** if material has been issued.
  - **Does NOT check** if stock is sufficient at the moment of start.
- **Status Change:** Updates Order Status from `RELEASED` to `IN_PROGRESS`.
- **Stock Impact:** ZERO. Starting a job does not deduct any inventory.

## 2. Material Issuance (Pengambilan Bahan)
- **Concept:** Trust-based / Actual-based.
- **Trigger:** Specific action "Material Issue" / "Ambil Bahan" by Warehouse/Production Admin.
- **Mechanism:**
  - Uses `batchIssueMaterials` function.
  - **Deduction:** Inventory is deducted immediately upon this transaction.
  - **Costing:** COGS (HPP) is calculated based on this actual issuance, not the BOM standard.
- **Validation:**
  - **Strict Stock:** Cannot issue if system stock (Quantity in Inventory table) < Requested Quantity.
  - **No Over-Issue Blocking:** System allows issuing MORE than the planned BOM quantity.
  - **Partial Issue:** Allowed. Can issue 10kg now, 20kg later. System accumulates total.

## 3. Substitutions & Plan Changes
- **Adding Items:** Allowed at any time during production.
- **Removing Items:**
  - Allowed **ONLY IF** that specific item has **0 issued quantity**.
  - If an item has already been partially issued, it cannot be removed from the plan (but you can stop issuing the rest).
- **Effect:** Useful for ad-hoc substitutions (e.g., ran out of Brand A, added Brand B as new material).

## 4. Production Output & Scrap
- **Output Entry:** Operator enters "Good Qty" and "Scrap/Reject Qty".
- **Stock Impact:**
  - **Good Qty:** Increases stock of Finished Good (FG).
  - **Scrap:** Increases stock of Scrap Item (e.g., SCRAP-PRONGKOL) in Scrap Warehouse.
- **Completion:** Order can be marked `COMPLETED` even if:
  - Material Issued < Standard BOM (Efficiency/Savings).
  - Material Issued > Standard BOM (Waste/Over-usage).
