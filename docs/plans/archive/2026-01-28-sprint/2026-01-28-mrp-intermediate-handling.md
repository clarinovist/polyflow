## ERP Manufacturing Best Practices
Based on industry standards (SAP, Odoo, Oracle NetSuite):

1.  **Multi-Level Hierarchy**: Products are structured as nested BOMs. A Finished Good contains Intermediate Goods, which in turn contain Raw Materials.
2.  **Specialized Replenishment**:
    - **Procure (Buy)**: Triggered for `RAW_MATERIAL` or `PACKAGING`. Results in a **Purchase Request**.
    - **Produce (Make)**: Triggered for `INTERMEDIATE` or `FINISHED_GOOD` if a BOM exists. Results in a **Work Order**.
3.  **Recursive Explosion**: The MRP engine should look through all levels of the BOM to find the root shortages.
4.  **Just-In-Time (JIT)**: Planning should account for lead times at each level (e.g., Mixing takes 2 hours, Packaging takes 1 hour).

## Proposed Approaches

### Option 1: Recursive BOM Explosion (Full MRP)
The simulation deep-dives into the entire product structure.
- **Pros**: Perfectly accurate; identifies the real Raw Material shortages at the very bottom.
- **Cons**: More complex implementation; might generate a lot of nested Work Orders if automated.
- **Logic**: 
  - If shortage of Item A -> Has BOM? 
    - Yes: Add Item A to "Production Plan", explode Item A's BOM.
    - No: Add Item A to "Purchase Plan".

### Option 2: Intermediate-Aware Single Level (Categorized Requirements)
The simulation stays one level deep but checks the `ProductType` or existence of a BOM for each item.
- **Pros**: Simpler; matches the current "Incoming Requests" UI which is SO-centric.
- **Cons**: Planner still needs to manually create the Mixing order for the intermediate good.
- **Logic**:
  - If shortage of Item A -> Has BOM?
    - Yes: Label as "Shortage (Produce Internal)". **Don't trigger PR**.
    - No: Label as "Shortage (Procure)". **Trigger PR**.

### Option 3: "Make or Buy" Intelligence
Use a specific flag or the `ProductType` to decide the procurement path.
- **Current schema** has `ProductType`: `RAW_MATERIAL`, `INTERMEDIATE`, `PACKAGING`, `WIP`, `FINISHED_GOOD`.
- **Logic**: Only `RAW_MATERIAL` and `PACKAGING` trigger PRs. Anything else requires a Work Order.

## Recommendation
I recommend **Approach 1 (Recursive BOM Explosion)** combined with **ProductType Logic**. This is the standard "Best Practice" for ERPs.

### Proposed Architecture for PolyFlow:

1.  **Recursive Simulation**:
    - Refactor `simulateMaterialRequirements` to be a recursive function.
    - If a component has its own BOM and is short -> "Produce it" (Look into *its* materials).
    - If a component has NO BOM and is short -> "Buy it" (Add to PR list).

2.  **Planner's View (Simulation Result)**:
    - Group requirements by **Procurement Type**:
        - **Materials to Purchase**: (e.g., Chemicals, Bags).
        - **Intermediate to Produce**: (e.g., Premix, Masterbatch).

3.  **Action from Incoming Requests**:
    - Clicking "Process" will:
        - Create the **Main Work Order** (Finished Good).
        - Create **Automatic Sub-Work Orders** (for Intermediate Goods) if they don't exist yet.
        - Create **Purchase Requests** for truly missing Raw Materials.

Does this align with your vision for PolyFlow?
