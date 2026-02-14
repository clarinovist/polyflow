# Closing the Books Implementation Plan

**Goal:** Implement an automated "Closing the Books" process that generates closing journal entries to reset nominal accounts (Revenue/Expense) and transfer net income to Retained Earnings when a fiscal period is closed.

**Architecture:** 
1.  **Backend Calculation**: Logic to compute net income and aggregate balances for all REVENUE and EXPENSE accounts for a specific period.
2.  **Automated Journal Entry**: A new function in `journals-service.ts` to create a "Closing Entry" with `referenceType: 'MANUAL_ENTRY'` and a specific description.
3.  **UI Integration**: Enhance the `PeriodManagementClient` to show a summary before closing and trigger the entry generation during the `closePeriod` action.

**Tech Stack:** Next.js (App Router), Prisma, Tailwind CSS, Lucide Icons, Sonner (Toasts).

---

## Proposed Changes

### [Accounting Services]

#### [MODIFY] [src/services/accounting/reports-service.ts](file:///Users/nugroho/Documents/polyflow/src/services/accounting/reports-service.ts)
- Add a helper function `getClosingBalances(startDate: Date, endDate: Date)` that returns a simplified list of account IDs and their net balances for nominal accounts.

#### [MODIFY] [src/services/accounting/journals-service.ts](file:///Users/nugroho/Documents/polyflow/src/services/accounting/journals-service.ts)
- Add `createClosingJournalEntry(periodId: string, userId: string)`:
    - Fetches account balances for the period.
    - Creates a balanced journal entry:
        - Reverses Revenue (Debit) and Expenses (Credit).
        - Directs the net difference to "Current Year Earnings" (33000).

### [Server Actions]

#### [MODIFY] [src/actions/finance/period-actions.ts](file:///Users/nugroho/Documents/polyflow/src/actions/finance/period-actions.ts)
- Update `closePeriod` to:
    1. Call `createClosingJournalEntry`.
    2. Mark the period as `CLOSED`.
    3. Use a Prisma transaction to ensure atomicity.

### [UI Components]

#### [MODIFY] [src/components/finance/periods/PeriodManagementClient.tsx](file:///Users/nugroho/Documents/polyflow/src/components/finance/periods/PeriodManagementClient.tsx)
- Implement a `ClosingConfirmationModal`:
    - Displays Net Income, Total Revenue, and Total Expense for the period.
    - Requires user confirmation before calling the updated `closePeriod` action.

---

## Verification Plan

### Automated Tests
- No existing unit tests for period closing found. 
- **Action**: Create `tests/accounting/closing.test.ts` to verify that `createClosingJournalEntry` creates a balanced entry and resets simulated account balances.

### Manual Verification
1.  **Preparation**: Create several "POSTED" journal entries for Revenue and Expense in an "OPEN" period.
2.  **Execution**: Navigate to `Finance > Fiscal Periods`, select the period, and click "Close".
3.  **Validation**:
    - Verify the pop-up shows the correct Net Income.
    - Verify a new Journal Entry is created with reference "CLOSING-[PeriodName]".
    - Verify the Profit & Loss report for that period now shows 0 (or balanced at the end).
    - Verify the Balance Sheet now shows the amount in "Current Year Earnings" instead of a calculated plug figure.
