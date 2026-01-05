# PolyFlow ERP System 🏭

**Modern ERP for Plastic Converting Manufacturing**

PolyFlow is a comprehensive Enterprise Resource Planning (ERP) system specifically designed for plastic converting and manufacturing operations. Built with **Next.js 16**, **Prisma**, and **PostgreSQL**, it provides real-time inventory management, production tracking, and multi-location stock control.

---

## 🎯 Project Overview

**PolyFlow** streamlines the complete plastic manufacturing workflow—from raw materials through mixing, extrusion, and finishing—to final goods distribution. The system handles:

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

✅ **Dashboard & Analytics**
- Real-time KPI cards (Products, Total Stock, Low Stock, Recent Movements)
- Quick action shortcuts
- Movement history tracking
- Location-based filtering

---

## 📁 Project Structure

```
polyflow/
├── prisma/
│   ├── schema.prisma          # Database schema with 10+ models
│   └── seed.ts                # Production cycle seed data
├── src/
│   ├── actions/               # Server Actions
│   │   ├── inventory.ts       # Inventory operations
│   │   └── product.ts         # Product CRUD
│   ├── app/
│   │   ├── dashboard/
│   │   │   ├── page.tsx       # Main dashboard
│   │   │   ├── products/      # Product management pages
│   │   │   ├── inventory/     # Inventory management
│   │   │   │   ├── page.tsx   # Inventory dashboard
│   │   │   │   ├── transfer/  # Stock transfer form
│   │   │   │   ├── adjustment/# Stock adjustment form
│   │   │   │   └── history/   # Movement history
│   │   │   └── settings/      # Settings (placeholder)
│   │   └── layout.tsx         # Root layout with navigation
│   ├── components/
│   │   ├── inventory/         # Inventory-specific components
│   │   ├── products/          # Product forms and tables
│   │   └── ui/                # Reusable UI components (shadcn/ui)
│   └── lib/
│       ├── prisma.ts          # Prisma client singleton
│       └── zod-schemas.ts     # Validation schemas
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
   npx prisma migrate dev
   npx prisma db seed
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
- **Role**: `ADMIN`, `WAREHOUSE`, `PRODUCTION`, `SALES`

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

Based on conversation history, recent work includes:

1. **Handover Planning & Project Audit** (Jan 5, 2026)
   - Conducted full project state audit.
   - Verified schema readiness for Production, Batches, and Reservations.
   - Identified Critical Priority: Authentication & Security implementation.
   - Created [HANDOVER_PLAN.md](file:///home/nugroho/Documents/polyflow/HANDOVER_PLAN.md).

2. **UI Polish & Bug Fixes** (Jan 4, 2026)
   - Added active navigation state highlighting
   - Fixed broken inventory links
   - Created settings page placeholder
   - Aligned variant table columns
   - Updated browser tab title

2. **Prisma Validation Fixes** (Jan 4, 2026)
   - Resolved `minStockAlert` field selection errors
   - Added `minStockAlert` to ProductVariant model
   - Updated inventory action type definitions

3. **Inventory Dashboard Debugging** (Jan 4, 2026)
   - Fixed `InventoryDashboard` component rendering
   - Resolved hydration mismatch issues
   - Added proper suppressHydrationWarning flags

4. **Machine Master Data** (Jan 4, 2026)
   - Added `MachineType` enum
   - Created `Machine` model with location linkage
   - Seeded production machines (Mixer, Extruder, Rewinder, Packer)

5. **Inventory Engine Implementation** (Jan 3, 2026)
   - Built transfer stock server action
   - Implemented stock adjustment logic
   - Created movement history tracking
   - Fixed Decimal serialization errors

6. **Schema Refactoring** (Jan 3, 2026)
   - Added `INTERMEDIATE` product type
   - Implemented dual-unit logic with conversion factors
   - Added location descriptions
   - Updated seed data for full production cycle

---

## 📝 License

This project is private and proprietary.

---

## 👤 Author

**Nugroho**  
Building modern ERP solutions for manufacturing operations.

---

## 🔗 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)
- [Radix UI Components](https://www.radix-ui.com/)

---

**Last Updated**: January 5, 2026
