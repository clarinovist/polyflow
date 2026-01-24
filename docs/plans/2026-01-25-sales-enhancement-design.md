# Sales Workspace Enhancement Design
**Date:** 2026-01-25
**Status:** DRAFT

## 1. Overview
The Sales module requires a significant upgrade to meet the "Premium ERP" standard. The current state has missing pages, empty dashboards, and basic UI that lacks the "wow" factor.

## 2. Brand Identity & UI Polish
**Gap Analysis**: Current tables and lists are functional but "flat".
**Proposal**:
*   **Stats Cards**: Add high-level metrics at the top of *every* list page (Orders, Customers, etc.) to provide context.
*   **Visual Hierarchy**: Use `Card` layouts with distinct headers.
*   **Colors**: Strictly adhere to `design-tokens.json` (Primary `#18181b`, Muted `#f4f4f5`).

## 3. Component Specific Designs

### A. Sales Dashboard (`/sales/page.tsx`)
*   **Status**: Empty.
*   **Design**: "Hybrid" Layout.
    *   **Top**: 4 Stats Cards (Revenue, Orders, Pending Shipments, Active Customers).
    *   **Middle**: "Recent Orders" Table (Limit 5) + "Weekly Sales" Bar Chart.
    *   **Right/Bottom**: Quick Actions (New Quote, New Order).

### B. Sales Deliveries (`/sales/deliveries/page.tsx`)
*   **Status**: Missing (404).
*   **Design**: Standard List View.
    *   **Columns**: DO Number, SO Reference, Customer, Dispatch Date, Carrier, Status.
    *   **Features**: Status Badges (Pending/Shipped/Delivered), Search, Date Filter.

### C. Sales Invoices (`/sales/invoices/page.tsx`)
*   **Status**: Missing (Component `InvoiceTable` exists but is unused).
*   **Design**:
    *   Reuse `InvoiceTable` component.
    *   Add "Unpaid Invoices" and "Overdue Amount" kpi cards at the top.

### D. Sales Orders & Quotations (Polishing)
*   **Status**: Functional but basic.
*   **Improvement**:
    *   Add "Summary Row" above table: "Total Active Orders", "Draft Quotations".
    *   Ensure "Create New" button is prominent (Primary Color).

### E. Customers (Polishing)
*   **Status**: Empty state needs improvement.
*   **Improvement**:
    *   Better "Empty State" with illustration/icon.
    *   Add "Top Customers by Revenue" mini-table or highlight.

## 4. Technical Implementation
*   **Data Fetching**: Create/Update `src/actions/sales.ts` to support new aggregated metrics.
*   **Routing**: Create missing folders `sales/deliveries` and `sales/invoices`.
