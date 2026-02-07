# 2026-02-07-accounting-module-fixes Implementation Plan
**Goal:** Fix opening balance synchronization with Balance Sheet, add edit/delete for opening balances, remove specific invalid entry (Agus), and improve journal input formatting.
**Architecture:** 
The fix involves ensuring that system-generated opening balance journal entries are automatically posted. Deletion logic will be added to the opening balance actions to cleanly remove all related records (SO, Invoice, Journals). The UI for Manual Journals will be enhanced with a professional accounting-style numeric input to prevent data entry errors.

**Tech Stack:** Next.js (App Router), Prisma, Tailwind CSS, Zod, React Hook Form.

### Task 1: Fix Opening Balance Journal Status
**Files:**
- Modify: `src/actions/finance/opening-balance.ts`
- Modify: `src/services/accounting/journals-service.ts`

**Step 1: Update journal service to allow status override for auto-generated entries**
In `createJournalEntry`, optionally allow passing `POSTED` status for system actions.

**Step 2: Update opening balance actions to post journals**
Call `postJournal` immediately after creating opening balance entries in `src/actions/finance/opening-balance.ts`.

### Task 2: Implement Deletion and Editing for Opening Balances
**Files:**
- Modify: `src/actions/finance/opening-balance.ts`
- Modify: `src/components/finance/OpeningBalanceHistory.tsx`

**Step 1: Add deleteOpeningBalance action**
Implement a server action that deletes the Invoice, SalesOrder/PurchaseOrder, and associated Journal Entries for a given opening balance ID.

**Step 2: Add Delete button to History UI**
Update `OpeningBalanceHistory.tsx` to include a delete icon/button with a confirmation dialog.

### Task 3: Remove "Agus" Entry (1.9jt)
**Step 1: Execute deletion**
Use the newly created delete functionality or a targeted script to remove INV-02 for customer Agus.

### Task 4: Accounting Format for Journal Inputs
**Files:**
- Modify: `src/components/finance/accounting/manual-journal-form.tsx`

**Step 1: Create or use a NumericFormat input**
Implement a wrapper around `Input` that uses `Intl.NumberFormat` to display live thousands separators while the user types, ensuring they don't add extra zeros by mistake.
