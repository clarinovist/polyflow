# Recursive MRP & Purchase Request Aggregation - Final Implementation

**Date:** 2026-01-28
**Status:** Implemented

This document summarizes the final implementation of the Multi-Stage MRP and Purchase Request Aggregation features in PolyFlow.

## 1. Multi-Stage (Recursive) MRP

The Material Requirements Planning (MRP) engine has been upgraded to support recursive Bill of Materials (BOM) explosion. This ensures that shortages in intermediate goods correctly trigger production orders for those intermediates, rather than purchase requests.

### Core Logic (`MrpService`)

1.  **Recursive Explosion**: The `simulateMaterialRequirements` method (and its helper `explodeRecursively`) now traverses the entire BOM tree.
2.  **Make vs. Buy Decision**:
    *   **MAKE (Intermediate/Finished Grid)**: If an item has a BOM, it is flagged as `hasBom: true` (Produce). A shortage results in a nested **Work Order**.
    *   **BUY (Raw Material/Packaging)**: If an item has *no* BOM, it is flagged as `hasBom: false` (Buy). A shortage results in a **Purchase Request**.
3.  **Traceability**:
    *   `ProductionOrder` model now includes `parentOrderId`.
    *   When processing an incoming request, the system creates a hierarchy of Work Orders (e.g., Parent: Extrusion -> Child: Mixing).

### UI Changes (`ProductionPlanningDialog`)

*   **Badges**: Items in the planning table now display clear indicators:
    *   `[FACTORYICON] PRODUCE`: For items that will generate a Work Order.
    *   `[CARTICON] BUY`: For items that will generate a Purchase Request.

## 2. Purchase Request Aggregation

To improve procurement efficiency, we implemented a mechanism to consolidate multiple Purchase Requests (PRs) into a single Purchase Order (PO).

### Core Logic (`PurchaseService`)

1.  **Multi-Selection**: Users can select multiple "OPEN" Purchase Requests from the list.
2.  **Consolidation (`consolidateRequestsToOrder`)**:
    *   **Aggregation**: Items with the same `productVariantId` are summed up into a single line item.
    *   **Traceability**: The resulting PO notes allow traceability back to original requests (e.g., "Consolidated from PR-001, PR-002").
    *   **Status Update**: Original PRs are marked as `CONVERTED` and linked to the new PO.

### UI Changes (`RequestList`)

*   **Checkboxes**: Added to the `PurchaseRequest` list to allow multi-selection.
*   **Consolidate Button**: Appears when multiple items are selected.
*   **Dialog**: Revised "Convert to PO" dialog to support bulk processing.

## 3. Workflow Summary

1.  **Sales Order** confirmed (MTS) -> Shortages identified.
2.  **Planner** runs "Incoming Request" simulation.
3.  **Planner** clicks "Process":
    *   -> Creates **Work Order Hierarchy** (Parent + Child WOs).
    *   -> Creates **Purchase Requests** for raw materials.
4.  **Purchasing** goes to "Purchase Requests".
5.  **Purchasing** selects multiple PRs -> Clicks **Consolidate**.
6.  **Result**: A single **Purchase Order** sent to the supplier.
