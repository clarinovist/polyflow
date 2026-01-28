# Accounting Automation & Journal Entry Implementation Plan

**Goal:** Implement a standard manufacturing accounting workflow, including specific Chart of Accounts (COA) for plastic manufacturing and automated journal entry generation for key business events (Inventory, Production, Sales).
**Architecture:** Event-driven architecture where core services (`InventoryService`, `ProductionService`) trigger `AccountingService` to create journal entries based on predefined mapping rules.
**Tech Stack:** Next.js, Prisma, TypeScript, Shadcn UI.

## 1. Standard Manufacturing Chart of Accounts (COA)

We need to seed a COA tailored for plastic manufacturing (e.g., separating Raw Material, WIP, and Finished Goods inventory accounts).

### Task 1: Seed Manufacturing COA
**Files:**
- Create: `prisma/seed-coa.ts`
- Modify: `prisma/seed.ts`

### Task 1: Verify & Invoke Manufacturing COA Seed
**Files:**
- Modify: `prisma/seed.ts` (Ensure `seedCoA` is called)
- Verify: `prisma/seed-coa.ts` (Existing file is sufficient)

**Step 1: Check `prisma/seed-coa.ts`**
The existing file already contains a robust COA including:
- 11310: Raw Materials
- 11320: Work-in-Progress
- 53000: Manufacturing Overhead
- 51000: Direct Materials

We will use this existing file and ensure it is executed during the main seed process.
We will implement a granular COA suitable for plastic/chemical manufacturing:

**1. Assets (10000-19999)**
- **Current Assets**:
  - 10100: Cash on Hand
  - 10200: Bank - Operating Account
  - 12000: Accounts Receivable
  - **Inventory**:
    - 13100: Inventory - Raw Materials (Resins - PE, PP, HD)
    - 13200: Inventory - Additives (Masterbatch, Dyes)
    - 13300: Inventory - Packaging Materials (Cores, Sacks)
    - 13400: Inventory - Work in Progress (Extrusion Rolls)
    - 13500: Inventory - Finished Goods (Conversion Bags)
    - 13600: Inventory - Scrap / Regrind
    - 13900: Inventory - Consumables & Spares
- **Fixed Assets**:
  - 15100: Machinery & Equipment (Extruders, Mixers)
  - 15200: Accumulated Depreciation - Machinery
  - 15300: Factory Building / Leasehold Improvements

**2. Liabilities (20000-29999)**
- 21000: Accounts Payable (Trade)
- 21100: GR/IR Clearing (Goods Receipt / Invoice Receipt)
- 22000: Accrued Wages
- 22100: VAT Payable (PPN Keluaran)
- 22200: VAT Receivable (PPN Masukan)

**3. Equity (30000-39999)**
- 30000: Share Capital
- 31000: Retained Earnings
- 32000: Current Year Earnings

**4. Revenue (40000-49999)**
- 41000: Sales - Finished Goods
- 42000: Sales - Scrap / Waste
- 49000: Sales Returns & Allowances

**5. Cost of Goods Sold (50000-59999)**
- **Direct Costs**:
  - 51000: COGS - Raw Materials (Standard Cost)
  - 51100: Price Variance - Raw Materials
  - 52000: Direct Labor (Operator Wages)
- **Manufacturing Overhead (Allocated)**:
  - 55000: Applied Overhead - Electricity
  - 55100: Applied Overhead - Depreciation
  - 55200: Applied Overhead - Indirect Labor

**6. Operating Expenses (60000-69999)**
- **Factory Overhead (Actuals)**:
  - 60100: Factory Electricity (PLN)
  - 60200: Machine Maintenance & Spares
  - 60300: Factory Consumables (Cleaning, Oils)
  - 60400: Factory Rent / Lease
  - 60500: Depreciation Expense - Machinery
- **General & Admin**:
  - 61000: Office Salaries
  - 61100: Office Utilities & Internet
  - 61200: Professional Fees (Audit/Tax)
- **Selling & Marketing**:
  - 62000: Sales Commissions
  - 62100: Logistics & Delivery Costs

**Step 2: Create Seed Script**
Implement `seedManufacturingCOA` function to upsert these accounts.

## 2. Automated Journal Entry Triggers

Implement logic to automatically generate journals based on stock movements.

### Task 2: Inventory Accounting Integration
**Files:**
- Modify: `src/services/inventory-service.ts`
- Modify: `src/services/accounting-service.ts`

**Step 1: Define Posting Logic**
Create `AccountingService.recordInventoryMovement(movement: StockMovement)`:
- **Purchase Receipt (IN)**:
  - Debit: Inventory - RM (11000)
  - Credit: GR/IR Clearing (21100)
- **Production Issue (OUT)**:
  - Debit: Inventory - WIP (11100)
  - Credit: Inventory - RM (11000)
- **Production Output (IN)**:
  - Debit: Inventory - FG (11200)
  - Credit: Inventory - WIP (11100) (at standard cost)
- **Sales Shipment (OUT)**:
  - Debit: COGS (50000)
  - Credit: Inventory - FG (11200)

**Step 2: Hook into Stock Movement**
Call this method inside `InventoryService.createStockMovement` (asynchronously or within transaction).

## 3. Journal Entry Management UI

Replace placeholder pages with actual functionality.

### Task 3: Journal Entry List Page
**Files:**
- Modify: `src/app/[locale]/finance/journals/page.tsx`

**Step 1: Fetch Data**
Use `AccountingService.getJournals` with pagination and filtering (Status, Date Range).

**Step 2: Table Component**
Render a `DataTable` showing:
- Entry #
- Date
- Description
- Reference (SO/PO/WO #)
- Total Amount
- Status (Badge)
- Actions (View, Post, Void)

### Task 4: Journal Entry Detail View
**Files:**
- Create: `src/app/[locale]/finance/journals/[id]/page.tsx`

**Step 1: Layout**
- Header: Entry Info, Status, Actions (Post/Reverse).
- Content: Table of Debit/Credit lines.
- Sidebar/Footer: Approval info, Created By.

## 4. Verification

### Automated Tests
- Test COA seeding.
- Test `AccountingService.createJournalEntry` balance validation.
- Test `InventoryService` trigger -> Journal creation.

### Manual Verification
1. **Flow**: Receive Goods (PO).
   - Expect: Journal created (Dr Inventory, Cr GR/IR).
2. **Flow**: Issue Material to Production.
   - Expect: Journal created (Dr WIP, Cr Inventory).
3. **Flow**: Dashboard.
   - Expect: New journals appear in `finance/journals`.
