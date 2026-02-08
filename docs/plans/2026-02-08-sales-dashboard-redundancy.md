# Brainstorming: Sales Dashboard Redundancy Analysis

**Date:** 2026-02-08
**Topic:** Redundancy between Sales Dashboard and Sales Analytics

## Problem Statement
The user observed that the Sales Dashboard (`/sales`) and Sales Analytics (`/sales/analytics`) seem redundant. Both display key metrics like Revenue and Active Customers, leading to confusion about their distinct purposes.

## Current State Analysis

| Feature | Sales Dashboard (`/sales`) | Sales Analytics (`/sales/analytics`) |
| :--- | :--- | :--- |
| **Primary Goal** | Operational Overview (Day-to-day) | Strategic Insight (Performance Review) |
| **Key Metrics** | Revenue, Active Orders, Pending Deliveries, Active Customers | Revenue, Total Orders, Avg Order Value |
| **Charts** | None (Mockup only: "Mock +0%") | Revenue Trend, Top Products, Top Customers |
| **Lists** | Recent 5 Orders (Table) | Top Products list, Top Customers list |
| **Actions** | "New Order", "New Quotation" buttons | "Download Report" button |
| **Navigation** | Default landing page for Sales module | Separate tab/page |

**Identified Redundancy:**
-   **Revenue Metric:** Duplicated effectively.
-   **Customers Metric:** Duplicated concept (Active Base vs Top Customers).
-   **General "Overview" Feel:** Both try to summarize "how are we doing?".

## Proposed Solutions

### Option 1: Unified "Sales Command Center" (Recommended)
Consolidate both pages into a single, powerful Sales Overview.

-   **Structure:**
    1.  **Top Bar:** Page Title + Month Picker (Global Filter) + Action Buttons ("New Order").
    2.  **KPI Row:** Revenue (from Analytics), Pending Deliveries (Operational), Active Orders (Operational).
    3.  **Charts Section:** Revenue Trend (Collapsible or compact).
    4.  **Lists Section:**
        -   Left: Recent Orders (Operational - for quick access).
        -   Right: Top Products (Analytical - for insight).
-   **Pros:** Single source of truth. Reduces navigation clicks. Clear context.
-   **Cons:** Page might become vertically long. Requires careful layout to avoid clutter.

### Option 2: Distinct Roles (Operational vs Analytical)
Keep separate but sharpen the distinction.

-   **Dashboard Changes:**
    -   Remove "Revenue" and "Active Customers" cards.
    -   Focus strictly on **TASKS**: "Orders Pending Approval", "Shipments Due Today", "Invoices Overdue".
    -   Keep "Recent Orders".
-   **Analytics Changes:**
    -   Keep as the sole source for "Performance" (Revenue, Trends).
-   **Pros:** Clear separation of concerns (Work vs Review).
-   **Cons:** Limits quick visibility of financial health on the main landing page.

### Option 3: Analytics as Default
Make `/sales/analytics` the default landing page for `/sales`.

-   **Changes:**
    -   Add "New Order" buttons to Analytics page.
    -   Add "Recent Orders" table to Analytics page.
    -   Delete the old Dashboard page.
-   **Pros:** Simplifies codebase.
-   **Cons:** "Analytics" might feel too heavy for a user just wanting to create an order.

## Recommendation
**Proceed with Option 1 (Unified Command Center).**
It aligns best with the user's observation of redundancy and leverages the new "Month Picker" to make the dashboard dynamic and powerful. It transforms the "static" operational dashboard into a data-driven workspace.
