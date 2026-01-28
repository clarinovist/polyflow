# PolyFlow ERP System 🏭

**Modern ERP for Plastic Converting Manufacturing**

PolyFlow is a comprehensive Enterprise Resource Planning (ERP) system specifically designed for plastic converting and manufacturing operations. Built with **Next.js 16**, **Prisma**, and **PostgreSQL**, it provides real-time inventory management, production tracking, and multi-location stock control.

---

## 🎯 Project Overview

**PolyFlow** streamlines the complete plastic manufacturing workflow—from raw materials through mixing, extrusion, and finishing—to final goods distribution. The system features a modern, multi-portal architecture:

- **Admin Dashboard**: Comprehensive management of products, inventory, and analytics.
- **Finance Dashboard**: Specialized workspace for accounting, invoicing, and cost reporting.
- **Operator Kiosk Portal**: Simplified, touch-friendly interface for production floor execution.
- **Warehouse Portal**: Focused material fulfillment queue for warehouse staff.

The system handles:

- **Multi-location inventory tracking** across warehouse and production floors
- **Complex product variants** with dual-unit management (KG, ROLL, BAL, PCS, ZAK)
- **Bill of Materials (BOM)** for production recipes and mixing formulas
- **Stock movements** with full audit trail (transfers, adjustments, in/out)
- **Machine master data** for production floor tracking
- **Real-time dashboard** with low-stock alerts and movement history

---

## 🏗️ System Architecture

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js (App Router) | 16.1.1 |
| **Language** | TypeScript | ^5 |
| **Database ORM** | Prisma | 5.22.0 |
| **Database** | PostgreSQL | - |
| **UI Components** | Radix UI + TailwindCSS | v4 |
| **Forms** | React Hook Form + Zod | ^7.69 |
| **Styling** | TailwindCSS | v4 |
| **Icons** | Lucide React | ^0.562 |

### Key Features

✅ **Product Management**
- Multi-variant products with SKU tracking
- Support for RAW_MATERIAL, INTERMEDIATE, PACKAGING, WIP, FINISHED_GOOD, SCRAP
- Dual-unit logic (primary unit + sales unit with conversion factors)
- Price tracking (cost, buy price, sell price)

✅ **Inventory Management**
- Real-time stock tracking across multiple locations
- Low-stock threshold alerts (`minStockAlert`)
- Stock movements with full audit trail
- Internal transfers between locations
- Stock adjustments (in/out) with reason tracking

✅ **Production Support**
- Bill of Materials (BOM) for production recipes
- Scrap percentage tracking
- Machine master data (MIXER, EXTRUDER, REWINDER, PACKER, GRANULATOR)
- Machine status tracking (ACTIVE, MAINTENANCE, BROKEN)
- **NEW**: Independent Operator Kiosk Portal for floor staff
- **NEW**: Warehouse Portal for streamlined material fulfillment
- **NEW**: Automatic FIFO (First-In-First-Out) material issuance logic

✅ **Dashboard & Analytics**
- Real-time KPI cards (Sales, Purchasing, Production, Inventory, Cashflow)
- Quick action shortcuts
- Movement history tracking
- Location-based filtering
- **NEW**: Comprehensive Analytics & Reporting Module
- **NEW**: Executive Dashboard with Plastic Manufacturing KPIs (Yield Rate, Scrap, Downtime)

✅ **Finance & Costing**
- Automatic Production Costing (COGM)
- WIP (Work-in-Progress) Valuation
- Accounts Receivable (AR) & Accounts Payable (AP) Overdue Tracking
- Detailed Order Cost Breakdown (Material vs. Conversion)

✅ **PolyFlow Design System**
- Centralized design tokens and semantic color system
- Full dark mode support
- Modern aesthetics with glassmorphism and subtle animations
- Standardized UI components (Buttons, Inputs, Cards)
- **NEW**: Enhanced Login Experience with Role Selection and Password Visibility Toggle

---

## 📁 Project Structure

```
polyflow/
├── prisma/
│   ├── schema.prisma          # Database schema with 10+ models
│   └── seed.ts                # Production cycle seed data
├── src/
│   ├── actions/               # Server Actions (Auth -> Validation -> Service)
│   │   ├── inventory.ts       # Inventory operations
│   │   ├── production.ts      # Production workflow
│   │   ├── finance.ts         # Finance & Costing
│   │   └── dashboard.ts       # Aggregated KPIs
│   ├── services/              # Core Business Logic (Layered Architecture)
│   │   ├── inventory-service.ts
│   │   ├── production-service.ts
│   │   ├── purchase-service.ts
│   │   └── finance/           # Finance sub-services
│   ├── app/
│   │   ├── dashboard/
│   │   │   ├── page.tsx       # Executive Summary
│   │   │   ├── products/      # Product management pages
│   │   │   ├── inventory/     # Inventory Analysis
│   │   │   ├── production/    # Production Management
│   │   │   └── finance/       # Financial Reports
│   │   ├── kiosk/             # Operator Floor Portal
│   │   └── warehouse/         # Warehouse Operations Portal
│   ├── components/
│   │   ├── layout/            # Layout & Navigation
│   │   ├── production/        # Kiosk & Dashboard components
│   │   └── ui/                # Zinc Design System components
│   └── lib/
│       ├── prisma.ts          # Prisma client singleton
│       └── schemas/           # Domain-specific Zod schemas
│       └── design-tokens.ts   # UI Design Tokens
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ 
- **PostgreSQL** database
- **npm** or **pnpm**

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd polyflow
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/polyflow"
   ```

4. **Initialize database**
   ```bash
   npx prisma@5.22.0 migrate dev
   npx prisma@5.22.0 db seed
   ```

5. **Run development server**
   ```bash
   npm run dev
   ```

6. **Open browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

---

## 📊 Database Schema

### Core Models

| Model | Purpose | Key Relations |
|-------|---------|---------------|
| **Product** | Master product catalog | → ProductVariant[] |
| **ProductVariant** | SKU-level variants | → Inventory[], BOM[], BomItem[] |
| **Inventory** | Stock quantities by location | ← ProductVariant, Location |
| **Location** | Warehouses & production areas | → Inventory[], Machine[], StockMovement[] |
| **StockMovement** | Audit trail for all movements | ← ProductVariant, Location (from/to), User |
| **Bom** | Production recipes | ← ProductVariant, → BomItem[] |
| **Machine** | Production equipment | ← Location |
| **User** | System users | → StockMovement[] (createdBy) |
| **Contact** | Suppliers & customers | - |

### Key Enums

- **ProductType**: `RAW_MATERIAL`, `INTERMEDIATE`, `PACKAGING`, `WIP`, `FINISHED_GOOD`, `SCRAP`
- **Unit**: `KG`, `ROLL`, `BAL`, `PCS`, `ZAK`
- **MovementType**: `IN`, `OUT`, `TRANSFER`, `ADJUSTMENT`
- **MachineType**: `MIXER`, `EXTRUDER`, `REWINDER`, `PACKER`, `GRANULATOR`
- **Role**: `ADMIN`, `WAREHOUSE`, `PRODUCTION`, `SALES`, `FINANCE`, `PPIC`, `PROCUREMENT`

---

## 🎨 Key UI Pages

### 1. **Dashboard** (`/dashboard`)
- KPI cards: Products, Total Stock, Low Stock, Recent Movements
- Quick actions: Create Product, Stock Adjustment, Internal Transfer
- Real-time stats using Server Actions

### 2. **Product Management** (`/dashboard/products`)
- Product listing with variant details
- Create/Edit forms with dynamic variant fields
- SKU validation and duplicate checking
- Inventory protection (prevent deletion of items with stock)

### 3. **Inventory Dashboard** (`/dashboard/inventory`)
- Filterable by location and product type
- Stock quantity display with unit labels
- Low-stock highlighting (quantity < minStockAlert)
- Threshold adjustment via dialog

### 4. **Internal Transfer** (`/dashboard/inventory/transfer`)
- Move stock between locations
- Real-time source stock validation
- Automatic inventory updates via transaction
- Movement record creation

### 5. **Stock Adjustment** (`/dashboard/inventory/adjustment`)
- IN/OUT adjustments with reason tracking
- Validation to prevent negative stock
- Movement history logging

### 6. **Movement History** (`/dashboard/inventory/history`)
- Complete audit trail
- Filter by movement type
- Display source/destination locations
- User attribution

---

## 🔧 Development Workflows

### Adding a New Product

1. Navigate to `/dashboard/products/create`
2. Fill in product details (name, type)
3. Add one or more variants with:
   - Name & SKU code
   - Units (primary + sales)
   - Conversion factor
   - Prices (buy/sell)
   - Min stock alert threshold
4. Submit → Atomic create via Prisma transaction

### Transferring Stock

1. Navigate to `/dashboard/inventory/transfer`
2. Select source & destination locations
3. Choose product variant
4. Enter quantity
5. Submit → Transaction:
   - Validates source stock
   - Decrements source inventory
   - Increments (or creates) destination inventory
   - Logs movement record

### Stock Adjustment

1. Navigate to `/dashboard/inventory/adjustment`
2. Select location and product variant
3. Choose IN or OUT adjustment type
4. Enter quantity and reason
5. Submit → Transaction updates inventory + logs movement

---

## 📈 Recent Development History

### Week of Jan 19-24, 2026

### Week of Jan 26-30, 2026

1. **Multi-Stage MRP & Procurement Aggregation** (Jan 28, 2026)
   - **Recursive MRP Engine**: Implemented multi-level BOM explosion to handle nested production dependencies (e.g., Extrusion -> Mixing -> Raw Materials).
   - **Hierarchical Work Orders**: Automated creation of parent-child Work Order trees for complex products.
   - **Smart Procurement**: Automatic "Make vs. Buy" decision logic (BOM = Produce, No BOM = Buy).
   - **Purchase Request Aggregation**: Added capability to consolidate multiple PRs into a single Purchase Order for efficient supplier management.
   - **Enhanced Planning UI**: Visual indicators for production vs. procurement requirements and multi-select PR consolidation.

2. **Finance & Costing Module - PHASE 4 COMPLETED** (Jan 24, 2026)
   - Implemented `CostReportingService` for automated COGM and WIP valuation.
   - Added `getExecutiveStats` with real-time manufacturing KPIs (Yield, Scrap, Downtime).
   - Implemented automated status updates for Overdue Invoices (Sales & Purchase).
   - Verified project readiness for full Accounting module integration.

2. **Mobile Responsiveness Audit & Fixes** (Jan 23, 2026)
   - Optimized `SidebarNav` with mobile-first toggle and overlay.
   - Ensured all data tables support horizontal overflow on small screens.
   - Refined Dashboard grid systems for vertical stacking on mobile.

3. **Modular Monolith Refactoring** (Jan 23, 2026)
   - Extracted logic into `ProductionService` and `InventoryService`.
   - Split global `zod-schemas.ts` into domain-specific files in `src/lib/schemas/`.
   - Enforced strict inventory boundaries (no direct table access from other modules).

4. **Warehouse Portal & FIFO Implementation** (Jan 22, 2026)
   - Created a dedicated `/warehouse` portal for material fulfillment.
   - Implemented automatic **First-In-First-Out (FIFO)** material issuance logic.
   - Secured the new portal with Role-Based Access Control (RBAC).

2. **Operator Kiosk Evolution** (Jan 21, 2026)
   - Moved Kiosk out of the dashboard to a top-level `/kiosk` route.
   - Implemented an **Operator Selection Gate** with session persistence.
   - Added machine-level job filtering and mobile-responsive floor UI.

3. **Order Release Validation** (Jan 21, 2026)
   - Enforced mandatory Machine and BOM fields before an order can be "Released".
   - Automated redirection and UI simplification for production detail views.

### Week of Jan 13-15, 2026

1. **Inventory Planning & Control (IPC) Foundations** (Jan 14, 2026)
   - Implemented `updateStockReservation` server action.
   - Created `calculateAvailableStock()` utility.
   - Added Reorder Point and Inventory Valuation features.
   - Updated `InventoryTable.tsx` with "Reserved" and "Available" columns.

2. **UI Layout & Dark Mode Fixes** (Jan 14, 2026)
   - Fixed search input overflow in sidebar.
   - Applied proper flexbox alignment and text truncation.
   - Ensured dark mode consistency across Inventory Table components.
   - Fixed Recharts `ResponsiveContainer` dimension errors.

3. **Master Data & Stock Opname Refactor** (Jan 14, 2026)
   - Refactored Products, BOMs, Resources pages for design consistency.
   - Updated Stock Opname module (List, Create, Detail, Counter).
   - Applied Zinc-first aesthetic with semantic color tokens.

4. **PolyFlow Design System & Dark Mode** (Jan 13, 2026)
   - Created comprehensive `DESIGN_SYSTEM.md` documentation.
   - Implemented centralized design tokens in `src/lib/design-tokens.ts`.
   - Refactored entire application to use semantic colors and dark mode.
   - Added `ThemeProvider` for consistent theme management.

5. **Analytics & Reporting Module** (Jan 13, 2026)
   - Built backend server actions for comprehensive data analytics.
   - Implemented frontend dashboards for Sales, Inventory, Production, and Finance reports.
   - Added visual charts and summary cards for business insights.

6. **Login Page Redesign** (Jan 13, 2026)
   - Completely redesigned authentication interface with modern split-screen layout.
   - Added branded panels with glassmorphism effects.
   - Enhanced user experience with improved form layouts and transitions.

7. **Dashboard Refactor** (Jan 13, 2026)
   - Refined main dashboard with new 3-column grid layout.
   - Optimized data fetching and component rendering.
   - Integrated widgets for production orders and inventory status.

8. **Compact Transfer Form UI** (Jan 13, 2026)
   - Implemented compact header design for transfer cards.
   - Added sticky footer with symmetrical alignment.
   - Custom thin scrollbar styling for manifest item list.

---

## 📝 License

This project is private and proprietary.

---

## 👤 Author

**Nugroho**  
Building modern ERP solutions for manufacturing operations.

---

## 🔗 Additional Resources

- [Design System Guide](./DESIGN_SYSTEM.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)
- [Radix UI Components](https://www.radix-ui.com/)

---

**Last Updated**: January 24, 2026
