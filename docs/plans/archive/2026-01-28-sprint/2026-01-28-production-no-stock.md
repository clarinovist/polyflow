# Brainstorming: Production Without Stock or BOM

**User Request:**
"I want to create a Work Order (WO) when I have no Raw Material stock, and I don't want to create a new BOM for it, but I still want to work on it."

## Analysis of Current System
1.  **BOM Requirement:** Currently, `ProductionOrderService` favors creating orders from a BOM. However, the schema allows creating *empty* orders or overriding materials.
2.  **Stock Validation:** `ProductionMaterialService.batchIssueMaterials` calls `InventoryService.validateAndLockStock`. This **blocks** issuance if stock is 0.

## Proposed Options

### Option A: "Force Release" (Negative Inventory)
*   **Concept:** Allow issuing materials even if system stock is 0.
*   **Mechanism:** Update `InventoryService` to allow negative stock if a specific flag (e.g., `allowNegative`) is passed.
*   **Pros:** Frictionless. "Just let me do my job."
*   **Cons:** Dirty data. Why is stock 0? Did we forget to receive it? It breaks costing assumptions (what is the cost of an item that doesn't exist?).

### Option B: "Ad-Hoc Adjustment" (The Honest Approach)
*   **Concept:** Validating that you *physically* have the item implies the system count is wrong. Fix it first.
*   **Mechanism:** In the "Issue Material" dialog, if stock is 0, offer a "Quick Adjust" button -> "I have this physically" -> System creates a "Spot Adjustment" -> Then Issues it.
*   **Pros:** Clean data. Accurate references.
*   **Cons:** One extra step for the user.

### Option C: "Free-Text" Production (No Material Tracking)
*   **Concept:** Just track the Output, ignore the Input.
*   **Mechanism:** Create a WO with *no* planned materials. Just record "Output produced".
*   **Pros:** Very fast for simple "job shop" tasks.
*   **Cons:** No inventory deduction for raw materials. COGS will be 0 (or just labor/machine cost).

### Option D: "Ad-Hoc Substitution" (The Flexible BOM)
*   **Concept:** "I don't have Material A (from BOM), but I have Material B."
*   **Mechanism:** When issuing, allow picking *any* material from the dropdown, not just the planned ones.
*   **Pros:** flexibility to use alternatives without changing master data.
*   **Cons:** Tracking variance becomes harder.

## Recommendation
**Combine B and D.**
1.  **Flexible Issue:** Allow adding *unplanned* materials during execution (Option D).
2.  **Quick Adjustment:** If they try to issue something with 0 stock, prompt: "System says 0. Do you want to auto-adjust stock to allow this?" (Option B).
