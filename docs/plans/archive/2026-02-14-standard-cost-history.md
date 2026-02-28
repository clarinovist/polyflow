# Standard Cost History & Costing Dashboard

**Goal:** Track standard cost changes per product variant over time, with chart visualization, history list, auto-update from purchases, and price alert.
**Architecture:** New `CostHistory` Prisma model logs every cost change. New Product Detail page (`/dashboard/products/[id]`) displays product info, cost chart, and history list. `inventory-link-service.ts` auto-updates cost on Goods Receipt.
**Tech Stack:** Prisma, Next.js Server Actions, Recharts (chart), shadcn/ui components.

---

## Proposed Changes

### 1. Database Schema

#### [NEW] `CostHistory` model in `prisma/schema.prisma`

```prisma
model CostHistory {
  id               String         @id @default(uuid())
  productVariantId String
  previousCost     Decimal?       @db.Decimal(15, 4)
  newCost          Decimal        @db.Decimal(15, 4)
  changeReason     String         // MANUAL, PURCHASE_GR, STOCK_OPNAME, IMPORT
  referenceId      String?        // GR ID, Opname ID, etc.
  changePercent    Decimal?       @db.Decimal(10, 2)
  createdById      String?
  createdAt        DateTime       @default(now())
  productVariant   ProductVariant @relation(fields: [productVariantId], references: [id])
  createdBy        User?          @relation(fields: [createdById], references: [id])

  @@index([productVariantId, createdAt])
}
```

Add `costHistory CostHistory[]` relation to `ProductVariant` and `User`.

---

### 2. Server Actions

#### [NEW] `src/actions/cost-history.ts`

- `getCostHistory(variantId, options?)` — Fetch paginated history with user info
- `updateStandardCost(variantId, newCost, reason, referenceId?)` — Update cost + log history entry in a single transaction

#### [MODIFY] `src/actions/product.ts`

- Update `getProductById` to include `variants.costHistory` (latest 10), `variants.inventories` (current stock), and `variants.standardCost`

---

### 3. Auto-Update on Goods Receipt

#### [MODIFY] `src/services/accounting/inventory-link-service.ts`

- In the `PURCHASE` / `goodsReceiptId` branch (line 57), after getting `poItem.unitPrice`, call `updateStandardCost()` with reason `PURCHASE_GR` to:
  - Calculate new weighted average: `((currentCost * currentStock) + (grPrice * grQty)) / (currentStock + grQty)`
  - Log the change to `CostHistory`
  - Update `productVariant.standardCost`

---

### 4. Product Detail Page (UI)

#### [NEW] `src/app/dashboard/products/[id]/page.tsx`

Server component that fetches product data and renders the detail layout with:
- Product header (name, type, SKU, edit button)
- Tabs: **Overview** | **Cost History** | **Stock**

#### [NEW] `src/components/products/ProductDetail.tsx`

Client component with tabs:

**Overview Tab:**
- Product info cards (type, unit, current stock, standard cost, buy/sell price)
- Price alert badge if cost changed >10% recently

**Cost History Tab:**
- **Trend Chart** (Recharts `LineChart`) showing cost over time per variant
- **History Table** below chart with columns: Date, Old Cost, New Cost, Change %, Reason, Changed By
- Filter by date range and variant

**Stock Tab:**
- Current stock per location (from existing `Inventory` model)

---

### 5. Product Table Enhancement

#### [MODIFY] `src/components/products/ProductTable.tsx`

- Make product name clickable -> links to `/dashboard/products/[id]`
- Add "Standard Cost" column (if `showPrices` is true)

---

## Verification Plan

### Automated Tests
1. `npx prisma migrate dev` — Verify migration applies cleanly
2. `npm run build` — Verify no type errors
3. Manual browser test: Navigate to `/dashboard/products/[id]`, verify chart and table render

### Manual Verification
1. Edit a product's standard cost -> verify history entry appears
2. Create a Goods Receipt -> verify cost auto-updates and history logs
3. Check chart shows correct trend line
4. Verify price alert badge appears when cost jumps >10%
