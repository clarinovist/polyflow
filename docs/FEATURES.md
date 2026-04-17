# PolyFlow Features Documentation

## Operational Guides

- [Maklon Sales Flow](./MAKLON_SALES_FLOW.md) - Ringkasan flow Sales Order Maklon Jasa, mekanisme konsumsi bahan titipan, dan diagram alur.
- [SOP Maklon Sales Operasional](./SOP_MAKLON_SALES_OPERASIONAL.md) - Versi SOP formal untuk tim sales, warehouse, planning, dan finance.

## 📦 Product & Inventory Management

### Product Management System

#### 1. **Multi-Variant Product Support**

PolyFlow supports complex product hierarchies with multiple variants per product:

- **Product Level**: High-level categorization (e.g., "Pure PP Granules")
- **Variant Level**: SKU-specific items (e.g., "Pure PP Granules Standard - RM-PP-PURE")

**Product Types**:
- `RAW_MATERIAL` - Incoming materials from suppliers
- `INTERMEDIATE` - Results of mixing/blending processes
- `PACKAGING` - Packaging materials
- `WIP` (Work in Progress) - Semi-finished goods in production
- `FINISHED_GOOD` - Ready-to-sell products
- `SCRAP` - Production waste/recyclable materials

#### 2. **Dual-Unit Management**

Every product variant supports dual-unit tracking:

```typescript
{
  primaryUnit: Unit.KG,           // Internal tracking unit
  salesUnit: Unit.BAL,            // Sales/customer-facing unit
  conversionFactor: 5.0           // 1 BAL = 5 KG
}
```

**Supported Units**:
- `KG` - Kilograms (primary for most materials)
- `ROLL` - Rolls (for film/raffia)
- `BAL` - Bales (packed finished goods)
- `PCS` - Pieces (discrete items)
- `ZAK` - Sacks (bulk packaging)

#### 3. **Advanced Pricing**

Track multiple price points per variant:

- **price**: Base/standard price
- **buyPrice**: Purchase cost (for costing calculations)
- **sellPrice**: Sales price (for invoicing)

#### 4. **SKU Management**

- Unique SKU codes enforced at database level
- Automatic duplicate detection during create/update
- SKU-based product lookup and reporting

#### 5. **Product Attributes**

Store flexible metadata as JSON:

```json
{
  "color": "Red",
  "thickness": "Standard",
  "material": "PP"
}
```

---

### Inventory Management System

#### 1. **Multi-Location Stock Tracking**

Real-time inventory across multiple locations:

**Seeded Locations**:
- **Raw Material Warehouse** (`rm_warehouse`) - Incoming materials storage
- **Mixing Area** (`mixing_area`) - Production Floor 1
- **Extrusion Area** (`extrusion_area`) - Production Floor 2
- **Finished Goods Warehouse** (`fg_warehouse`) - Ready products
- **Scrap Warehouse** (`scrap_warehouse`) - Waste materials

**Inventory Model**:
```typescript
{
  locationId: string,
  productVariantId: string,
  quantity: Decimal,              // Uses Prisma Decimal for precision
  updatedAt: DateTime             // Auto-updated on changes
}
```

**Composite Unique Key**: `(locationId, productVariantId)` ensures one record per variant-location pair.

#### 2. **Stock Movement Tracking**

Complete audit trail for all inventory changes:

**Movement Types**:
- `IN` - Stock received (from suppliers)
- `OUT` - Stock issued (to customers/production)
- `TRANSFER` - Between locations
- `ADJUSTMENT` - Manual corrections

**Movement Record**:
```typescript
{
  type: MovementType,
  productVariantId: string,
  fromLocationId?: string,        // Source (null for IN)
  toLocationId?: string,          // Destination (null for OUT)
  quantity: Decimal,
  reference?: string,             // Notes/reason
  createdById?: string,           // User who made the change
  createdAt: DateTime
}
```

#### 3. **Low Stock Alerts**

Dynamic threshold tracking:

- Set `minStockAlert` per product variant
- Dashboard calculates total quantity across all locations
- Alerts trigger when `totalQuantity < minStockAlert`
- Configurable thresholds via UI dialog

**Dashboard Low Stock Card**:
```typescript
{
  lowStockCount: number,          // Count of variants below threshold
  alert: boolean                  // Visual alert flag
}
```

#### 4. **Stock Transfer Operations**

Move inventory between locations with atomic transactions:

**Validation**:
- ✅ Source location has sufficient stock
- ✅ Source quantity >= transfer quantity
- ✅ Transaction rolls back on any error

**Process**:
1. Validate source stock
2. Decrement source inventory
3. Increment (or upsert) destination inventory
4. Create TRANSFER movement record
5. Commit transaction

**Example**:
```typescript
await transferStock({
  sourceLocationId: "rm_warehouse",
  destinationLocationId: "mixing_area",
  productVariantId: "RM-PP-PURE",
  quantity: 100,
  notes: "For production batch #123",
  date: new Date()
});
```

#### 5. **Stock Adjustment**

Manual inventory corrections:

**Adjustment Types**:
- `ADJUSTMENT_IN` - Increase stock (e.g., found inventory, corrections)
- `ADJUSTMENT_OUT` - Decrease stock (e.g., damaged goods, corrections)

**Validation**:
- ✅ OUT adjustments check for sufficient stock
- ✅ IN adjustments can create new inventory records (upsert)

**Movement Record Direction**:
- IN: `fromLocationId: null`, `toLocationId: locationId`
- OUT: `fromLocationId: locationId`, `toLocationId: null`

#### 6. **Inventory Dashboard**

Real-time inventory view with filtering:

**Features**:
- Filter by location
- Filter by product type
- Low-stock highlighting (yellow background)
- Stock quantity with unit labels
- Last updated timestamp
- Quick threshold adjustment dialog
- **NEW**: Reserved and Available stock columns
- **NEW**: Calculated available stock (Total - Reserved)

**Table Columns**:
- Product name
- SKU code
- Location
- Product type
- Current quantity (with unit)
- Reserved quantity
- Available quantity
- Min stock alert
- Low stock indicator

---

### Stock Opname (Physical Inventory Count)

Periodic physical stock verification workflow:

#### 1. **Stock Opname Process**

**Workflow**:
1. Create new opname session (select location, date)
2. System generates count sheet with expected quantities
3. Warehouse staff performs physical count
4. Enter counted quantities via Counter interface
5. System calculates variances automatically
6. Manager reviews and approves/rejects
7. Auto-generate adjustment movements for approved variances

#### 2. **Opname Model**

```typescript
{
  id: string,
  opnameNumber: string,           // Auto-generated reference
  locationId: string,
  status: OpnameStatus,           // DRAFT, IN_PROGRESS, COMPLETED, CANCELLED
  countDate: DateTime,
  items: OpnameItem[],
  notes?: string,
  createdById: string
}
```

#### 3. **UI Components**

- **Opname List**: View all opname sessions with status filters
- **Opname Create Dialog**: Start new opname with location selection
- **Opname Detail**: View items with variances highlighted
- **Opname Counter**: Mobile-friendly counting interface with sticky save button

---

### Bill of Materials (BOM)

Production recipe management:

#### 1. **BOM Structure**

```typescript
{
  name: "Standard Mixing Recipe - Red",
  productVariantId: "INT-MIX-RED",       // Output product
  outputQuantity: 100,                   // Basis quantity (e.g., 100 KG)
  isDefault: true,                       // Active recipe flag
  items: [
    {
      productVariantId: "RM-PP-PURE",    // Input ingredient
      quantity: 98,                      // Required quantity
      scrapPercentage: 1.0               // Expected waste %
    },
    {
      productVariantId: "RM-COLOR-RED",
      quantity: 2
    }
  ]
}
```

#### 2. **Production Cycle Example**

**Stage 1: Mixing**
- Input: 98 KG Pure PP + 2 KG Red Colorant
- Output: 100 KG Red Mixed Granules (INTERMEDIATE)
- Scrap: 1% expected (0.98 KG)

**Stage 2: Extrusion**
- Input: 100 KG Red Mixed Granules
- Output: 100 KG Red Raffia Jumbo Roll (WIP)
- Scrap: 2% expected (2 KG)

**Stage 3: Converting**
- Input: WIP Roll
- Output: Finished Red Raffia Bales (FINISHED_GOOD)
- Unit: BAL (1 BAL = 5 KG)

---

### Machine Master Data

Track production equipment:

#### **Machine Model**

```typescript
{
  name: "Mixer Turbo 01",
  code: "MIX-01",                       // Unique machine code
  type: MachineType.MIXER,              // Equipment type
  locationId: "mixing_area",            // Associated location
  status: MachineStatus.ACTIVE          // Current status
}
```

**Machine Types**:
- `MIXER` - Mixing/blending equipment
- `EXTRUDER` - Extrusion machines
- `REWINDER` - Rewinding/slitting machines
- `PACKER` - Packing/baling equipment
- `GRANULATOR` - Granulation/recycling machines

**Machine Status**:
- `ACTIVE` - Operational
- `MAINTENANCE` - Under maintenance
- `BROKEN` - Out of service

**Seeded Machines**:
1. Mixer Turbo 01 (MIX-01) - Mixing Area
2. Extruder Jumbo 01 (EXT-01) - Extrusion Area
3. Rewinder Kecil A (REW-01) - FG Warehouse
4. Press Bal Manual (PAK-01) - FG Warehouse

---

### 🏭 Manufacturing Execution Systems (MES)

#### 1. **Dedicated Operator Kiosk (`/kiosk`)**

A floor-optimized, high-visibility interface for production operators:

- **Independent Portal**: Separated from the dashboard for maximum focus and screen space.
- **Operator Session Gate**: Staff identification screen before access, persisting via `localStorage`.
- **Machine-Specific Filtering**: View only jobs assigned to a specific production line/machine.
- **Real-Time Execution**: Start, Log Output, and Stop jobs with touch-friendly controls.
- **Status Dashboard**: Visual progress bars and time tracking for active jobs.

#### 2. **Warehouse Portal (`/warehouse`)**

Streamlined material fulfillment dashboard for warehouse staff:

- **Fulfillment Queue**: Real-time list of released and in-progress production orders requiring materials.
- **Material Picklists**: Visual breakdown of required vs. issued quantities per order.
- **Quick Issue workflow**: One-click material issuance directly from the dashboard.
- **Role-Based Access**: Restricted to `WAREHOUSE`, `PRODUCTION`, `PPIC`, and `ADMIN`.

#### 3. **Automatic FIFO Material Issuance**

Intelligent material consumption logic to ensure stock freshness:

- **Zero-Touch Batch Selection**: Manual batch picking is eliminated for speed and accuracy.
- **FIFO Allocation**: System automatically identifies and consumes from the oldest available batches (based on manufacturing date).
- **Multi-Batch Support**: A single issuance request can automatically drain multiple small batches to fulfill the total quantity.
- **Audit Traceability**: Every issuance record remains linked to specific batch IDs for quality tracking.

---

## 📊 Dashboard & Analytics

### Main Dashboard (`/dashboard`)

**KPI Cards**:
1. **Products** - Total master products count
2. **Total Stock** - Sum of all inventory quantities (all locations)
3. **Low Stock** - Count of variants below threshold (with amber alert)
4. **Active Movements** - Stock changes in last 24 hours
5. **Inventory Value** - Total valuation using Moving Average cost
6. **Pending Production** - Active production orders count

**Quick Actions**:
- Create Product → `/dashboard/products/create`
- Stock Adjustment → `/dashboard/inventory/adjustment`
- Internal Transfer → `/dashboard/inventory/transfer`
- Stock Opname → `/dashboard/inventory/opname`

**Real-Time Stats**:
All stats computed server-side via `getDashboardStats()` Server Action using Prisma aggregations.

---

### Analytics & Reporting Module (`/dashboard/analytics`)

Comprehensive business intelligence and reporting:

#### 1. **Sales Analytics**
- Revenue trends and growth metrics
- Top selling products
- Customer analysis
- Sales performance charts

#### 2. **Inventory Analytics**
- Stock aging report
- Inventory turnover ratio
- Stock valuation by location
- Movement trends

#### 3. **Production Analytics**
- Production efficiency metrics
- Machine utilization
- Scrap rate analysis
- OEE calculations

#### 4. **Finance & Accounting Analytics**
- COGS (Cost of Goods Sold) calculations based on Weighted Average
- Real-time WIP (Work-in-Progress) valuation
- Asset depreciation tracking
- AR/AP (Accounts Receivable/Payable) aging summaries
- Production costing (COGM) breakdowns

#### 5. **Executive Dashboard (New KPIs)**
High-level manufacturing metrics for management:
- **Yield Rate (%)**: Total output vs. raw material input.
- **Total Scrap (Kg)**: Consolidated scrap quantity from all processes.
- **Downtime Hours**: Total recorded machine downtime.
- **Machine Utilization**: OEE-based machine availability tracking.
- **Running vs. Total Machines**: Real-time floor status.

---

### Inventory Dashboard Features

**Filtering**:
- **By Location**: Dropdown selector (all locations)
- **By Product Type**: Dropdown selector (all types)
- **Low Stock Toggle**: Show only items below threshold

**Interactive Features**:
- Click row → Edit threshold dialog
- Threshold update → Real-time save to database
- Color coding:
  - Yellow background → Low stock
  - Red text → Below threshold

**Movement History**:
- Complete audit trail (`/dashboard/inventory/history`)
- Filterable by type, location, product
- Display user attribution
- Timestamp for each movement

---

## 🔐 User Management

### User Roles

- `ADMIN` - Full system access
- `WAREHOUSE` - Inventory operations
- `PRODUCTION` - Production floor operations
- `FINANCE` - Accounting and cost reporting
- `SALES` - Sales and customer-facing operations
- `PPIC` - Production planning and inventory control
- `PROCUREMENT` - Purchasing and supplier management

### User Model

```typescript
{
  id: string,
  email: string,
  name?: string,
  password: string,                    // Hashed
  role: Role,
  createdAt: DateTime,
  updatedAt: DateTime
}
```

**Future Enhancement**: Currently seeded but not used in UI (no auth implemented yet).

---

## 🏭 Contact Management

### Suppliers & Customers

```typescript
{
  name: "Petrokem",
  type: ContactType.SUPPLIER,
  phone: "08123456789",
  address: "Industrial Estate Block A"
}
```

**Contact Types**:
- `SUPPLIER` - Material/service providers
- `CUSTOMER` - Buyers/distributors

**Future Enhancement**: Integration with purchase orders and sales orders.

---

## 🏛️ Accounting & Finance Module

A robust foundation for industrial financial management:

### 1. **General Ledger**
- **Chart of Accounts (CoA)**: Standardized structure with manufacturing-specific categories.
- **Journal Entries**: Double-entry bookkeeping with automatic system-generated entries.
- **Fiscal Periods**: Manage open/closed months for financial integrity.

### 2. **Fixed Asset Management**
- Track high-value machinery and equipment.
- Automatic depreciation calculation (Straight Line method).
- Integration with balance sheet accounts.

### 3. **Purchasing & AP**
- Supplier invoices linked to Goods Receipts.
- Payment tracking and AP aging.
- Purchase tax (PPN) handling.

---

## 🌍 Localization (i18n)

PolyFlow supports multi-language interfaces through `next-intl`:

- **Bahasa Indonesia**: Full support for Indonesian terminology (e.g., "Surat Perintah Kerja", "Stok Opname").
- **English**: Original base language.
- **Locale-Aware Routing**: Direct access via `/[locale]/dashboard`.

---

## 🎯 Feature Highlights

### ✅ Implemented Features

1. ✅ **Product CRUD** - Create, read, update, delete with validation
2. ✅ **Multi-variant management** - Dynamic variant fields in forms
3. ✅ **Inventory dashboard** - Real-time stock view with filtering
4. ✅ **Stock transfers** - Atomic transactions with validation
5. ✅ **Stock adjustments** - IN/OUT with reason tracking
6. ✅ **Movement history** - Complete audit trail
7. ✅ **Low stock alerts** - Dynamic threshold tracking
8. ✅ **BOM support** - Production recipes with scrap tracking
9. ✅ **Machine master data** - Equipment tracking by location
10. ✅ **Dual-unit logic** - Primary + sales unit with conversion
11. ✅ **Production Order Execution** - Output recording with discrete roll tracking and scrap entry
12. ✅ **Stock Opname** - Physical inventory counting with variance tracking
13. ✅ **Stock Reservation** - Reserve stock for production/sales orders
14. ✅ **Available Stock Calculation** - Total minus reserved quantities
15. ✅ **Analytics & Reporting** - Sales, Inventory, Production, Finance dashboards
16. ✅ **Dark Mode** - Full theme support with design system
17. ✅ **Inventory Valuation** - Moving Average cost calculation
18. ✅ **Reorder Point Tracking** - Suggested purchase alerts
19. ✅ **Dedicated Operator Kiosk** - Top-level portal for floor staff
20. ✅ **Warehouse Portal** - Dedicated material fulfillment interface
21. ✅ **Automatic FIFO Logic** - Intelligent batch allocation during issuance
22. ✅ **Authentication & RBAC** - Secure login with role-based dashboard access
23. ✅ **Finance Dashboard** - Specialized accounting and costing views
24. ✅ **Accounting Module** - General Ledger, CoA, and Journal Entries
25. ✅ **Fixed Assets** - Tracking and depreciation management
26. ✅ **Localization** - Support for Bahasa Indonesia
27. ✅ **Executive KPIs** - Yield rate, scrap kg, and machine monitoring

### 🚧 Planned Features

See [IMPROVEMENTS.md](./IMPROVEMENTS.md) for detailed roadmap.

---

## 🔧 Technical Implementation

### Server Actions

All data mutations use Next.js 16 Server Actions:

**Benefits**:
- ✅ Type-safe client-server communication
- ✅ Automatic API route generation
- ✅ Built-in error handling
- ✅ Progressive enhancement

**Validation**:
All inputs validated using **Zod** schemas:

```typescript
import { z } from 'zod';

export const transferStockSchema = z.object({
  sourceLocationId: z.string().min(1),
  destinationLocationId: z.string().min(1),
  productVariantId: z.string().min(1),
  quantity: z.number().positive(),
  notes: z.string().optional(),
  date: z.date()
});
```

### Database Transactions

Critical operations use Prisma transactions for atomicity:

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Validate
  const sourceStock = await tx.inventory.findUnique(...);
  
  // 2. Decrement source
  await tx.inventory.update(...);
  
  // 3. Increment destination
  await tx.inventory.upsert(...);
  
  // 4. Log movement
  await tx.stockMovement.create(...);
});
```

**Benefits**:
- ✅ All-or-nothing commits
- ✅ Data consistency guaranteed
- ✅ Automatic rollback on error

### Real-Time Updates

Use Next.js `revalidatePath()` for cache invalidation:

```typescript
revalidatePath('/dashboard/inventory');
revalidatePath('/dashboard/inventory/history');
```

This ensures UI reflects latest data without full page reload.

---

**Last Updated**: January 25, 2026
