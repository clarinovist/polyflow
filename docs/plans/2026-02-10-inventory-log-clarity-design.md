
# Design Alternatives: Inventory Log Clarity

## Context
Users are currently confused by "OUT" movements from the "Mixing Area" for production work orders, as they expect to see a direct link to the "Raw Material Warehouse" source.

## Proposed Approaches

### 1. Visual "Source Link" (UI Enhancement)
Add a secondary "Original Source" indicator in the Location columns of the History table.
- **Implementation**: Modify the `StockMovement` table component to display `fromLocation` and a small badge showing the `fromLocation` of the preceding `TRANSFER` movement for that same batch/WO.
- **Trade-offs**: 
    - (+) Immediate clarity.
    - (-) Increases complexity of the frontend query (need to look up related movements).

### 2. Grouped Workflow View (UI Component Change)
Change the flat table into a grouped list by `Reference` / `Work Order`.
- **Implementation**: Group rows by their reference number. The header shows the Work Order, and expanding it shows the logical flow: `Raw Material` -> `Mixing Area` (Transfer) followed by `Mixing Area` -> `Production` (Backflush).
- **Trade-offs**:
    - (+) Most intuitive for production tracking.
    - (-) Larger UI refactor; might not work well with global filters (like filtering by just "Backflush").

### 3. Smart Status Labels (Text Mapping)
Replace generic "OUT" and "IN" with domain-specific terms.
- **Implementation**: Map `StockMovement.type` to more descriptive labels based on the `reference` or `productionOrderId`. "OUT" becomes "Production Use", "TRANSFER" becomes "Staged for Production".
- **Trade-offs**:
    - (+) Simplest to implement.
    - (-) Doesn't explicitly show the "path" of the material, just the specific event.

## Recommendation
I recommend **Approach 2 (Grouped Workflow View)** if you prioritize a professional ERP experience, or **Approach 1** for a quick but effective visual aid.
