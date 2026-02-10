
# Implementation Plan: Void Production Execution & Material Return

## Goal
Provide a way to undo production output logs (backflush) and return materials to the raw material warehouse.

## User Review Required
> [!IMPORTANT]
> The "Void" action will delete or mark as void the production record and reverse the stock movement. The user must manually handle the final transfer back to the Raw Material Warehouse after the stock is "returned" to the Mixing Area by the void action.

## Proposed Changes

### 1. Backend Service (`ProductionExecutionService`)
#### [MODIFY] [execution-service.ts](file:///Users/nugroho/Documents/polyflow/src/services/production/execution-service.ts)
- Add `static async voidExecution(executionId: string, userId: string)`:
    - Transaction block:
        - Find the `ProductionExecution` record and its related `StockMovement` records.
        - Create reversing `StockMovement` (Type: `IN`, Location: `Mixing Area`).
        - Delete or mark as `VOIDED` the `MaterialIssue` records associated with the order/execution.
        - Delete or mark as `VOID` the `ProductionExecution` record.
        - Update the `ProductionOrder` output quantity (subtract the voided amount).

### 2. Server Actions (`src/actions/production.ts`)
#### [NEW] [void-execution action](file:///Users/nugroho/Documents/polyflow/src/actions/production.ts)
- Create a server action to trigger the `voidExecution` service method.

### 3. Frontend UI (`src/app/production/history/page.tsx`)
#### [MODIFY] [history/page.tsx](file:///Users/nugroho/Documents/polyflow/src/app/production/history/page.tsx)
- Add an "Actions" column to the Output Logs table.
- Add a "Void" button with a confirmation dialog.

## Verification Plan
1. Record a production output for a test work order.
2. Verify stock is reduced from `Mixing Area`.
3. Click "Void" on the history log.
4. Verify stock is returned to `Mixing Area`.
5. Verify `MaterialIssue` records are removed.
6. Manually perform a `TRANSFER` from `Mixing Area` -> `Raw Material Warehouse` to complete the "NV 2 Return" process.
