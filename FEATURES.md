# PolyFlow Features Documentation

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

**Table Columns**:
- Product name
- SKU code
- Location
- Product type
- Current quantity (with unit)
- Min stock alert
- Low stock indicator

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

## 📊 Dashboard & Analytics

### Main Dashboard (`/dashboard`)

**KPI Cards**:
1. **Products** - Total master products count
2. **Total Stock** - Sum of all inventory quantities (all locations)
3. **Low Stock** - Count of variants below threshold (with amber alert)
4. **Active Movements** - Stock changes in last 24 hours

**Quick Actions**:
- Create Product → `/dashboard/products/create`
- Stock Adjustment → `/dashboard/inventory/adjustment`
- Internal Transfer → `/dashboard/inventory/transfer`

**Real-Time Stats**:
All stats computed server-side via `getDashboardStats()` Server Action using Prisma aggregations.

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
- `SALES` - Sales and customer-facing operations

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

**Last Updated**: January 5, 2026
