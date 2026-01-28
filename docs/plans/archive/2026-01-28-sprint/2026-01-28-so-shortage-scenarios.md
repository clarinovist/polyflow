# Brainstorming: Sales Order Shortage Scenarios

## Stock Validation Logic

### 1. Make to Stock (MTS) - *Current*
*   **Goal:** Sell items currently sitting in the warehouse.
*   **Logic:**
    1.  Check Finished Goods Inventory.
    2.  If `Available >= Request`: Reserve stock -> `CONFIRMED`.
    3.  If `Available < Request`: Reserve what we can -> Create **URGENT Purchase Request** for the rest -> `CONFIRMED`.

### 2. Make to Order (MTO) - *Current*
*   **Goal:** Produce items specifically for this order.
*   **Logic:**
    1.  **Skip** Finished Goods Stock Check (because we know we don't have it).
    2.  Update Status: `IN_PRODUCTION`.
    3.  **Gap:** It does **NOT** check if we have the *Raw Materials* (Wood, Fabric, Glue) to build it.
    4.  **Result:** Production Manager sees the order, tries to schedule it, and *then* realizes materials are missing (potentially days later).

### 3. Make to Order (MTO) - *Proposed Improvement*
*   **Logic:**
    1.  On Confirm, run **BOM Explosion** (simulate manufacturing).
    2.  Check Inventory for *Raw Materials*.
    3.  If valid, `CONFIRMED`.
    4.  If Raw Materials missing, automatically create **Purchase Request** for the missing parts.

## Scenarios & Mitigation Strategies
(Rest of the document remains the same...)
### Scenario 1: The "Orphaned Request" (Cancellation)
**Context:** A Sales Order (MTS) creates an automated Purchase Request (PR). The customer later cancels the Sales Order.
**Risk:** The PR remains active. Procurement might convert it to a Purchase Order and buy stock we no longer need immediately.
**Mitigation:**
*   **Auto-Cancel PR:** When canceling an SO, check for linked *Open* Purchase Requests and auto-cancel them.
*   **Notifier:** Alert the Procurement team: "SO #123 was cancelled, but PR #456 is still active. Please review."

### Scenario 2: The "Double Dip" (Timing Issue)
**Context:** Active PR exists for an SO. Meanwhile, a warehouse admin "found" stock or processed a return, increasing inventory.
**Risk:** Data says we have stock now, but the PR is still open. We might buy more than needed.
**Mitigation:**
*   **Allocation Check:** Before converting PR to PO, re-check valid inventory.
*   **Soft Reservations:** Ensure the "found" stock isn't immediately reserved by *another* new order before we can cancel the PR.

### Scenario 3: Make to Order (MTO) Raw Material Gap
**Context:** Sales confirmed a custom Furniture order (MTO). It goes to Production.
**Risk:** We don't realize we are out of Wood/Fabric until the Production Manager tries to schedule it 3 days later.
**Mitigation:**
*   **BOM Explosion Check:** On Order Confirmation, optionally run a "BOM Explosion" check (simplified MRP) and generate PRs for missing *Raw Materials* immediately.

### Scenario 4: Credit Limit Deadlock
**Context:** Customer orders 100 items. Stock is 0. System blocks confirmation due to Credit Limit.
**Risk:** We can't Create PR (because we can't confirm). We can't fulfill because we have no stock. Sales is stuck.
**Mitigation:**
*   **"Credit Hold" Status:** Allow confirmation to a special `CREDIT_HOLD` status that reserves stock (or creates PRs) but blocks Shipment until payment is resolved.

### Scenario 5: Partial Fulfillment Priority
**Context:** User creates SO #1 for 10 units (Stock 0 -> PR created). User creates SO #2 for 5 units. Vendor delivers 15 units.
**Risk:** Who gets the stock? Does it mistakenly go to SO #2 because they shouted louder?
**Mitigation:**
*   **Reservation Queue:** The "Waiting" reservation system we implemented handles this. The stock should fill the oldest "Waiting" reservation first. (Need to verify FIFO logic in `InventoryService`).

## Recommended Next Steps
1.  **Validate MTO Logic:** Decide if we want auto-PRs for MTO raw materials now or keep it in the Planning stage.
2.  **Implement Cancellation Hook:** Add logic to warn about open PRs when canceling an SO.
3.  **Confirm FIFO:** Ensure incoming stock allocates to the oldest Waiting reservations first.
