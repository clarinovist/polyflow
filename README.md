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
- **Standard Cost History** with change tracking and trend charts

✅ **Inventory Management**
- Real-time stock tracking across multiple locations
- Low-stock threshold alerts (`minStockAlert`)
- Stock movements with full audit trail
- Internal transfers between locations
- Stock adjustments (in/out) with reason tracking
- **Stock Opname** with session management, auto-numbering, and delete for OPEN sessions
- **Horizontal tab-based warehouse navigator** for maximum table width

✅ **Production Support**
- Bill of Materials (BOM) for production recipes with **Cost/Unit sorting**
- Scrap percentage tracking
- Machine master data (MIXER, EXTRUDER, REWINDER, PACKER, GRANULATOR)
- Machine status tracking (ACTIVE, MAINTENANCE, BROKEN)
- Independent Operator Kiosk Portal for floor staff
- Warehouse Portal for streamlined material fulfillment
- Automatic FIFO (First-In-First-Out) material issuance logic

✅ **Sales & Distribution**
- Sales Quotations with multi-item support
- Sales Orders with tax and discount handling
- **Delivery Orders** with packing list management
- Sales Invoice generation and tracking
- Date-based filtering across all transaction pages

✅ **Purchasing & Procurement**
- Purchase Requests with MRP auto-generation
- Purchase Orders with supplier management
- **Goods Receipt** with automatic cost update on receipt
- Purchase Invoices and AP tracking
- Multi-PR aggregation into single PO

✅ **Dashboard & Analytics**
- Real-time KPI cards (Sales, Purchasing, Production, Inventory, Cashflow)
- Quick action shortcuts
- Movement history tracking
- Location-based filtering
- Comprehensive Analytics & Reporting Module
- Executive Dashboard with Plastic Manufacturing KPIs (Yield Rate, Scrap, Downtime)
- **Cash Position Report** with monthly trend chart and PDF export

✅ **Finance & Accounting**
- **Full Double-Entry Accounting** with Chart of Accounts (COA)
- **Journal Entries** with automated posting from transactions
- **Fiscal Period Management** with period generation per year
- Automatic Production Costing (COGM)
- WIP (Work-in-Progress) Valuation
- Accounts Receivable (AR) & Accounts Payable (AP) Overdue Tracking
- Detailed Order Cost Breakdown (Material vs. Conversion)
- **Payment Management** with journal cleanup on deletion
- Balance Sheet and Income Statement reports

✅ **DevOps & Tooling**
- Docker Compose setup for local and production environments
- **CI/CD Pipeline** via GitHub Actions (build, push, deploy)
- Database sync scripts (`sync-db-prod.sh`, `push-db-to-prod.sh`)
- Prisma migration management with manual resolve support

✅ **PolyFlow Design System**
- Centralized design tokens and semantic color system
- Full dark mode support
- Modern aesthetics with glassmorphism and subtle animations
- Standardized UI components (Buttons, Inputs, Cards)
- Enhanced Login Experience with Role Selection and Password Visibility Toggle

---

## 📁 Project Structure

```
polyflow/
├── prisma/
│   ├── schema.prisma          # Database schema with 55+ models
│   ├── migrations/            # 42+ migration files
│   └── seed.ts                # Production cycle seed data
├── scripts/
│   ├── sync-db-prod.sh        # Pull production DB to local
│   ├── push-db-to-prod.sh     # Push local DB to production
│   ├── purge-transaction-history.js  # Data cleanup utility
│   └── setup-manufacturing-coa.ts    # Chart of Accounts setup
├── src/
│   ├── actions/               # Server Actions (Auth -> Validation -> Service)
│   │   ├── inventory.ts       # Inventory operations
│   │   ├── production.ts      # Production workflow
│   │   ├── finance.ts         # Finance & Costing
│   │   ├── opname.ts          # Stock Opname operations
│   │   ├── cost-history.ts    # Standard Cost tracking
│   │   └── dashboard.ts       # Aggregated KPIs
│   ├── services/              # Core Business Logic (Layered Architecture)
│   │   ├── inventory-service.ts
│   │   ├── production-service.ts
│   │   ├── purchasing/        # Purchasing sub-services
│   │   ├── accounting/        # Accounting sub-services
│   │   └── accounting-service.ts
│   ├── app/
│   │   ├── dashboard/
│   │   │   ├── page.tsx       # Executive Summary
│   │   │   ├── products/      # Product management pages
│   │   │   ├── boms/          # Bill of Materials management
│   │   │   ├── production/    # Production Management
│   │   │   └── finance/       # Financial Reports
│   │   ├── sales/             # Sales Module (Quotations, Orders, Deliveries, Invoices)
│   │   ├── purchasing/        # Purchasing Module (PO, Receipts, Invoices)
│   │   ├── kiosk/             # Operator Floor Portal
│   │   └── warehouse/         # Warehouse Operations Portal
│   │       ├── inventory/     # Inventory management with location tabs
│   │       ├── opname/        # Stock Opname sessions
│   │       ├── incoming/      # Goods Receipts
│   │       └── outgoing/      # Delivery fulfillment
│   ├── components/
│   │   ├── layout/            # Layout & Navigation
│   │   ├── production/        # Production & BOM components
│   │   ├── warehouse/         # Warehouse-specific components
│   │   ├── finance/           # Finance-specific components
│   │   └── ui/                # Zinc Design System components
│   └── lib/
│       ├── prisma.ts          # Prisma client singleton
│       ├── schemas/           # Domain-specific Zod schemas
│       └── design-tokens.ts   # UI Design Tokens
├── .github/workflows/         # CI/CD pipeline
├── docker-compose.yml         # Container orchestration
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
| **ProductVariant** | SKU-level variants | → Inventory[], BOM[], BomItem[], CostHistory[] |
| **Inventory** | Stock quantities by location | ← ProductVariant, Location |
| **Location** | Warehouses & production areas | → Inventory[], Machine[], StockMovement[] |
| **StockMovement** | Audit trail for all movements | ← ProductVariant, Location (from/to), User |
| **Bom** | Production recipes with cost | ← ProductVariant, → BomItem[] |
| **ProductionOrder** | Work orders for manufacturing | ← Bom, Machine, → Execution[], MaterialIssue[] |
| **Machine** | Production equipment | ← Location |
| **SalesOrder** | Customer orders | → SalesOrderItem[], DeliveryOrder[] |
| **PurchaseOrder** | Supplier orders | → PurchaseOrderItem[], GoodsReceipt[] |
| **GoodsReceipt** | Incoming material receipts | ← PurchaseOrder |
| **StockOpname** | Inventory counting sessions | → StockOpnameItem[], ← Location, User |
| **CostHistory** | Standard cost change tracking | ← ProductVariant, User |
| **Account** | Chart of Accounts | → JournalLine[] |
| **JournalEntry** | Double-entry accounting | → JournalLine[] |
| **Payment** | Sales/purchase payments | ← SalesInvoice, PurchaseInvoice |
| **FiscalPeriod** | Accounting period management | — |
| **User** | System users with roles | → StockMovement[], AuditLog[] |
| **Supplier** | Supplier master data | → PurchaseOrder[] |
| **Customer** | Customer master data | → SalesOrder[] |

### Key Enums

- **ProductType**: `RAW_MATERIAL`, `INTERMEDIATE`, `PACKAGING`, `WIP`, `FINISHED_GOOD`, `SCRAP`
- **Unit**: `KG`, `ROLL`, `BAL`, `PCS`, `ZAK`
- **MovementType**: `IN`, `OUT`, `TRANSFER`, `ADJUSTMENT`, `PRODUCTION_IN`, `PRODUCTION_OUT`, `PURCHASE`
- **MachineType**: `MIXER`, `EXTRUDER`, `REWINDER`, `PACKER`, `GRANULATOR`
- **OrderStatus**: `DRAFT`, `RELEASED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`
- **OpnameStatus**: `OPEN`, `COMPLETED`
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

### Week of Feb 10-14, 2026

1. **BOM Cost Display & Sorting** (Feb 14, 2026)
   - Swapped BOM cost display: **Cost per Unit** (per kg) is now the primary number, total formula cost is secondary.
   - Added interactive **sorting** for Cost/Unit column (ascending, descending, default toggle).
   - Applied to both BOM List (`/dashboard/boms`) and BOM Detail pages.

2. **Stock Opname Improvements** (Feb 14, 2026)
   - Added `opnameNumber` column to `StockOpname` with auto-numbering and unique index.
   - Created manual migration `20260214200000_add_opname_number` and applied to both local and production.
   - Added **Delete** button for OPEN opname sessions.
   - Prevented creation of empty sessions.

3. **Standard Cost History** (Feb 14, 2026)
   - New `CostHistory` Prisma model to track cost changes per product variant.
   - Auto-update standard cost on Goods Receipt via weighted average.
   - Product Detail page with cost trend chart and history table.

4. **Database Synchronization Tooling** (Feb 14, 2026)
   - Created `scripts/push-db-to-prod.sh` to push local database to production VPS.
   - Complements existing `scripts/sync-db-prod.sh` (pull from production).

5. **Fiscal Period UI Fix** (Feb 14, 2026)
   - Fixed "Generate Periods" button disappearing for non-current years.
   - Improved year transition responsiveness.

6. **Warehouse UI Simplification** (Feb 12, 2026)
   - Removed redundant stats cards from Warehouse Operations page, focused on Job Queue.
   - Redesigned Inventory layout: horizontal tab-based warehouse navigator replacing sidebar.
   - Added date filters to Incoming Receipts, Outgoing Orders, and Stock Opname pages.

### Week of Feb 3-9, 2026

1. **CI/CD Pipeline Consolidation** (Feb 6-7, 2026)
   - Consolidated separate `build-and-push.yml` and `deploy.yml` into single `ci-cd.yml`.
   - Automated `git reset --hard` on VPS to ensure code sync.
   - Added `prisma migrate deploy` to container startup.

2. **Payment & Journal Management** (Feb 6-9, 2026)
   - New `Payment` model for sales and purchase payments.
   - Implemented journal entry cleanup (void) on payment deletion.
   - Fixed orphaned journal entries from deleted transactions.

3. **Cash Position Report** (Feb 9, 2026)
   - Added `initial_cash_balance` to system settings.
   - Monthly cash flow breakdown with trend chart (Recharts).
   - PDF export functionality for cash position reports.

4. **Costing Dashboard Fixes** (Feb 7-11, 2026)
   - Fixed `CostingService` to handle missing relations and invalid dates.
   - Resolved production P2022 error for missing `MaterialIssue.status` column.
   - Applied migration `20260212100000_fix_missing_status_material_issue`.

### Week of Jan 26-30, 2026

1. **Multi-Stage MRP & Procurement Aggregation** (Jan 28, 2026)
   - **Recursive MRP Engine**: Multi-level BOM explosion for nested production dependencies.
   - **Hierarchical Work Orders**: Automated parent-child Work Order trees.
   - **Smart Procurement**: Automatic "Make vs. Buy" decision logic.
   - **Purchase Request Aggregation**: Consolidate multiple PRs into single PO.

2. **BOM Category & Scrap Tracking** (Jan 29, 2026)
   - Added `category` field to BOM for classification.
   - Enhanced scrap calculation with percentage-based tracking.

3. **Delivery Orders Module** (Jan 25, 2026)
   - Full delivery order lifecycle with packing list management.
   - Integration with Sales Orders for fulfillment tracking.

### Week of Jan 19-24, 2026

1. **Finance & Costing Module - PHASE 4** (Jan 24, 2026)
   - Full double-entry accounting with Chart of Accounts.
   - Automated journal entries from production, purchasing, and sales.
   - Fixed Assets tracking with depreciation.
   - `CostReportingService` for COGM and WIP valuation.

2. **Sales Module** (Jan 19-21, 2026)
   - Sales Quotations, Orders with tax/discount handling.
   - Sales-Production link for Make-to-Order workflows.
   - AR/AP tracking with overdue status automation.

3. **Purchasing Module** (Jan 20, 2026)
   - Purchase Orders, Goods Receipts, Purchase Payments.
   - Supplier-Product relationship management.

4. **Warehouse Portal & FIFO** (Jan 22, 2026)
   - Dedicated `/warehouse` portal for material fulfillment.
   - Automatic FIFO material issuance logic.

5. **Operator Kiosk Evolution** (Jan 21, 2026)
   - Top-level `/kiosk` route with Operator Selection Gate.
   - Machine-level job filtering and mobile-responsive floor UI.

### Week of Jan 13-15, 2026

1. **Inventory Planning & Control** (Jan 14, 2026)
   - Stock reservations, available stock calculation, reorder points.
   - Inventory valuation features.

2. **Master Data & Stock Opname Refactor** (Jan 14, 2026)
   - Refactored Products, BOMs, Resources pages for design consistency.
   - Updated Stock Opname module with Zinc-first aesthetic.

3. **PolyFlow Design System & Dark Mode** (Jan 13, 2026)
   - Comprehensive design tokens, semantic color system, ThemeProvider.
   - Full dark mode support across all modules.

4. **Analytics & Reporting Module** (Jan 13, 2026)
   - Dashboards for Sales, Inventory, Production, and Finance.
   - Visual charts and summary cards.

---

## 🛠️ Utility Scripts

| Script | Purpose |
|--------|--------|
| `scripts/sync-db-prod.sh` | Pull production database to local dev environment |
| `scripts/push-db-to-prod.sh` | Push local database to production VPS |
| `scripts/purge-transaction-history.js` | Clean up old transaction data (with `--execute` flag) |
| `scripts/setup-manufacturing-coa.ts` | Initialize Chart of Accounts for manufacturing |
| `scripts/migrate-prod-finance.js` | Migrate financial data to production |

---

## 📝 License

This project is private and proprietary.

---

## 👤 Author

**Nugroho**  
Building modern ERP solutions for manufacturing operations.

---

## 🔗 Additional Resources

- [Manufacturing Guide](./docs/manual-manufaktur-v1.md)
- [Production Logic & Rules](./docs/production-logic.md)
- [Design System Guide](./DESIGN_SYSTEM.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)
- [Radix UI Components](https://www.radix-ui.com/)

---

**Last Updated**: February 14, 2026
