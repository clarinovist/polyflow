# Sales Workspace Detailed Implementation Plan
**Goal:** Upgrade Sales Workspace to "Premium ERP" standard with functional Dashboard, Deliveries, and Invoices pages.
**Architecture:** Next.js App Router with Server Actions (Prisma) and Shadcn UI components.
**Tech Stack:** TypeScript, Prisma, TailwindCSS, Shadcn UI, Recharts, Vitest (for testing).

## Phase 1: Core Functionality (Dashboard & Deliveries)

### Task 1.1: Sales Dashboard Stats & Structure
**Files:**
- Create: `src/actions/sales-dashboard.ts`
- Modify: `src/app/[locale]/sales/page.tsx`

**Step 1: Write the failing test**
```typescript
// tests/sales/dashboard.test.ts
import { describe, it, expect } from 'vitest';
// Note: Actual integration test might be complex, so we might mock the DB or just test the logic function if isolated.
// For this plan, we will focus on verifying the action existence first.
```

**Step 2: Define Server Actions**
- Create `getSalesDashboardStats` to fetch:
  - Total Revenue (Month): `Sum(Invoice.totalAmount)`
  - Active Orders Count: `Count(SalesOrder.status != COMPLETED)`
  - Pending Deliveries: `Count(DeliveryOrder.status == PENDING)`
  - Active Customers: `Count(Customer.isActive == true)`

**Step 3: Implement Dashboard UI**
- Layout: Grid of 4 `StatsCard`.
- Layout: "Recent Orders" section using `SalesOrderTable` (compact mode).
- Verify: `npm run dev` and check `/sales`.

### Task 1.2: Sales Deliveries Page
**Files:**
- Create: `src/app/[locale]/sales/deliveries/page.tsx`
- Create: `src/actions/deliveries.ts`

**Step 1: Define Server Actions**
- Create `getDeliveryOrders` fetching logic.

**Step 2: Implement Page UI**
- Reuse `DataTable` pattern.
- Columns: DO Number, SO Ref, Customer, Date, Status.
- Verify: Check `/sales/deliveries` loads.

## Phase 2: Missing Features (Invoices)

### Task 2.1: Sales Invoices Page
**Files:**
- Create: `src/app/[locale]/sales/invoices/page.tsx`
- Create: `src/actions/invoices.ts`

**Step 1: Define Server Actions**
- Create `getSalesInvoices`.

**Step 2: Implement Page UI**
- Import `InvoiceTable` from `src/components/sales/InvoiceTable.tsx`.
- Add "Unpaid Amounts" summary card at top.

## Phase 3: UX/UI Polish

### Task 3.1: Sales Orders Improvements
**Files:**
- Modify: `src/app/[locale]/sales/orders/page.tsx`

**Step 1: Add Summary Cards**
- Add row of cards: "All Orders", "Pending", "Completed", "Returns".

### Task 3.2: Customers Improvements
**Files:**
- Modify: `src/app/[locale]/sales/customers/page.tsx`

**Step 1: Enhance List View**
- Add "New Customer" primary button with icon.
- Improve table empty state.

## Execution Order
1.  Verify DB Schema supports `DeliveryOrder` and `Invoice`.
2.  Execute Phase 1 (Dashboard -> Deliveries).
3.  Execute Phase 2 (Invoices).
4.  Execute Phase 3 (Polish).
