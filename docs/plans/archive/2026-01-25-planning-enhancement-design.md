# Planning Workspace Enhancement Design (Premium)

**Goal**: Transform the Planning Workspace (PPIC & Procurement) into a high-performance, visually stunning command center. Focus on clarity, data density (without clutter), and actionable insights.

## 1. Planning Dashboard (`/planning`)
**Current**: Empty.
**Design Concept**: "Mission Control".
- **Hero Stats**:
    - **Production Efficiency**: Percentage gauge (Actual vs Planned).
    - **Active Jobs**: Number of jobs currently "Running".
    - **Procurement Health**: Open POs / Delayed deliveries.
    - **Critical Shortages**: Number of items from MRP with shortages.
- **Main Widgets**:
    - **Production Timeline**: A mini gantt-chart view of the next 3 days.
    - **Material Alerts**: List of critical low-stock raw materials.
    - **Machine Status**: Grid of colored dots/icons representing machine states (Running, Idle, Down).

## 2. Production Schedule (`/planning/schedule`)
**Current**: Functional matrix.
**Enhancements**:
- **Visual Polish**: Use clearer colors for status (e.g., solid pills vs outlines).
- **Interactivity**: Click on a job to open a "Quick View" drawer instead of tooltip (for better mobile/tablet use).
- **Drag & Drop (Future)**: *Note explicitly that this is a future goal.*
- **Timeline Header**: Make the date headers sticky and more distinct.

## 3. Material Requirements (MRP) (`/planning/mrp`)
**Current**: Functional table + summary.
**Enhancements**:
- **Visual Hierarchy**: Make the "Shortage" column scream for attention (red background for critical).
- **Action Buttons**: "Create PO" button should be prominent for items with shortages.
- **Grouping**: Group by "Material Category" if available (or just flat list with filter chips).

## 4. Production Orders (`/planning/orders`)
**Current**: Standard table.
**Enhancements**:
- **Stats Cards**:
    - "Ready to Release": Count of DRAFT orders.
    - "In Progress": Count of active orders.
    - "Late": Count of orders past due date.
- **Progress Bars**: Visual progress bar for "Completed Qty / Planned Qty" in the table row.

## 5. Procurement (`/planning/purchase-orders` & `/planning/suppliers`)
**Current**: Standard tables.
**Enhancements**:
- **Purchase Orders**:
    - Status Pipeline view option (Draft -> Sent -> Partial -> Closed).
    - "Spending" mini-chart (optional, nice to have).
- **Suppliers**:
    - reliability score (mock data for now) - "5 Stars".
    - "Active Contracts" badge.

## Design Language (PolyFlow Premium)
- **Colors**:
    - **Production/Schedule**: Blues and Indigos (Calm, structured).
    - **Shortages/Alerts**: Amber and Red (Urgent).
    - **Success/On-Track**: Emerald and Teal.
    - **Backgrounds**: Subtle gradients or patterns for header cards to differentiate from white tables.
- **Typography**: Inter/Geist Mono for numbers and codes.
- **Components**:
    - `StatsCard` (Reusable).
    - `StatusBadge` (Premium pill shape).
    - `ProgressBar` (Slim, rounded).

## Phased Rollout
1.  **Dashboard**: Create the "Mission Control" from scratch.
2.  **Order Polish**: Add stats and progress bars to P.O. and Production Orders.
3.  **Schedule & MRP**: Refine visual styles.
