# Brainstorming: Auto-Purchase vs. Waiting Reservations

**Goal:** Determine the best workflow for handling Sales Orders with insufficient stock, specifically evaluating an "Auto-Purchase" approach as an alternative to the "Waiting" reservation system.

## Context
The current "Waiting Reservation" implementation has faced persistent technical hurdles (Prisma validation errors). The user has suggested an alternative: automatically creating a Purchase trigger when stock is low, similar to a "Quotation" model, which avoids creating `StockReservation` records for out-of-stock items.

## Options

### Option A: Auto-Draft Purchase Order (The "Drop-Ship" Style)
When a Sales Order is confirmed and stock is insufficient:
1.  **Calculate Shortage:** Determine how many items are missing.
2.  **Find Supplier:** Look up the `preferredSupplierId` for the missing items.
3.  **Create PO:** Automatically create a **Draft Purchase Order** for that supplier with the shortage quantity.
4.  **Sales Order Status:** Mark SO as `CONFIRMED` (or a new `WAITING_FOR_STOCK` status).
5.  **No Reservation:** Do *not* create a `WAITING` reservation in the `StockReservation` table.
6.  **UI:** The user sees a link "Linked PO: #PO-1234" on the Sales Order.

*   **Pros:** Automation, uses existing `PurchaseOrder` table, no "Waiting" enum errors.
*   **Cons:** What if an item has no supplier? What if multiple items need different suppliers? (Might generate multiple POs).

### Option B: Purchase Request (Internal Quotation)
Similar to Option A, but instead of a full PO, we create a "Purchase Request" (new entity or specific status).
1.  **Trigger:** Shortage detected on SO Confirmation.
2.  **Action:** Create a `PurchaseRequest` record.
3.  **Workflow:** Purchasing team reviews Requests -> Converts to PO.
4.  **Resemblance:** Matches the "Quotations" model the user mentioned (a pre-order document).

*   **Pros:** Cleaner separation of duty. Purchasing team validates before PO creation.
*   **Cons:** Requires creating a new table/model `PurchaseRequest`.

### Option C: Fix the "Waiting" Logic (Defensive Programming)
Stick to the original plan but ensure it works.
1.  **Status:** We implemented "Defensive Programming" (string literals).
2.  **Action:** Verify if the previous fix works after a full server restart.
3.  **Workflow:** Items show as "Waiting" in Inventory.

*   **Pros:** Accurate inventory forecasting.
*   **Cons:** Technical fragility in the current Next.js dev environment.

## Recommendation
**Option A (Auto-Draft PO)** seems to closest to the user's request ("auto create order in purchase") without adding excessive complexity (like new tables in Option B). It leverages the existing Purchasing module effectively.
