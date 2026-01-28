# Feature: MTO Auto-Purchasing

**Goal:** Automatically create Purchase Requests (PR) for missing Raw Materials when a Make-to-Order (MTO) Sales Order is confirmed.

## Current Behavior
- **MTO Confirm:** Sets status to `IN_PRODUCTION`. logic ends.
- **Risk:** Production starts without verifying raw material availability.

## New Behavior
- **MTO Confirm:**
    1.  Calculates Raw Material requirements (BOM Explosion).
    2.  Checks Available Stock (Physical - Reserved).
    3.  If Shortage exists, creates `PurchaseRequest` (Priority: URGENT, Notes: "Auto-generated for MTO SO...").
    4.  Sets status to `IN_PRODUCTION`.

## Implementation Details

### 1. `SalesService.confirmOrder`
- Modify the `MTO` branch logic.
- Reuse `MrpService.simulateMaterialRequirements`?
    - *Issue:* `MrpService` currently checks *Physical Stock* only, ignoring Reservations.
    - *Decision:* We will call `MrpService.simulateMaterialRequirements`, but we should preferably enhance it or perform a quick check.
    - *Refinement:* For this iteration, we will use `MrpService` for the BOM structure, but we might need to manually check reservations if `MrpService` is too basic.
    - *Better Approach:* Let's use `MrpService` as the standard calculator. If it needs reservation logic, we update `MrpService`.
    - *Plan:* Update `MrpService.simulateMaterialRequirements` to optionally account for reservations, OR just accept physical check for now (User asked for "mitigation", physical check is a huge step up from nothing).
    - *Safe Bet:* Use `MrpService` as is for BOM explosion. It returns `shortageQty`. If `shortageQty > 0`, create PR.

### 2. Purchase Request Creation
- Use `PurchaseService.createPurchaseRequest`.
- Group all shortages into one PR.

## Verification
- Test MTO Confirm with Safe Stock -> No PR.
- Test MTO Confirm with Low Stock -> PR Created.
