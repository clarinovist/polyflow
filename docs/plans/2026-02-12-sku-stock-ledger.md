# SKU Stock Ledger Implementation Plan

**Goal:** Create a per-SKU stock movement ledger page (like COA Account Ledger) so users can click a product and see all stock movements with running balance.

**Architecture:** Mirror the `AccountLedgerClient` pattern. Server action fetches movements + computes opening stock and running balance. A client component renders date filters, summary cards, and a transaction table. Reuse existing `getStockHistory` opening-stock logic from `analytics-service.ts`.

**Tech Stack:** Next.js Server Actions, Prisma, React, shadcn/ui, date-fns

---

### Task 1: Create `getStockLedger` Server Action

**Files:**
- Create: `src/services/inventory/stock-ledger-service.ts`
- Modify: `src/services/inventory-service.ts` (re-export)
- Modify: `src/actions/inventory.ts` (add action)

**Step 1: Create the service function**

```typescript
// src/services/inventory/stock-ledger-service.ts
import { prisma } from '@/lib/prisma';

export async function getStockLedger(
    productVariantId: string,
    startDate: Date,
    endDate: Date
) {
    // 1. Get product info
    const product = await prisma.productVariant.findUniqueOrThrow({
        where: { id: productVariantId },
        select: { id: true, name: true, skuCode: true, primaryUnit: true, type: true }
    });

    // 2. Compute opening stock (all movements before startDate)
    const priorMovements = await prisma.stockMovement.findMany({
        where: { productVariantId, createdAt: { lt: startDate } }
    });

    let openingStock = 0;
    priorMovements.forEach(m => {
        const qty = m.quantity.toNumber();
        if (m.toLocationId && !m.fromLocationId) openingStock += qty;    // IN
        if (m.fromLocationId && !m.toLocationId) openingStock -= qty;    // OUT
        // TRANSFER: net zero for total stock
    });

    // 3. Get movements in range with relations
    const movements = await prisma.stockMovement.findMany({
        where: {
            productVariantId,
            createdAt: { gte: startDate, lte: endDate }
        },
        include: {
            fromLocation: { select: { name: true } },
            toLocation: { select: { name: true } },
            createdBy: { select: { name: true } },
            batch: { select: { batchNumber: true } }
        },
        orderBy: { createdAt: 'asc' }
    });

    // 4. Build ledger entries with running balance
    let runningBalance = openingStock;
    let totalIn = 0;
    let totalOut = 0;

    const entries = movements.map(m => {
        const qty = m.quantity.toNumber();
        let qtyIn = 0;
        let qtyOut = 0;

        if (m.toLocationId && !m.fromLocationId) { qtyIn = qty; }       // IN / PURCHASE
        else if (m.fromLocationId && !m.toLocationId) { qtyOut = qty; }  // OUT
        // TRANSFER: show as transfer row (net zero for total)

        runningBalance += qtyIn - qtyOut;
        totalIn += qtyIn;
        totalOut += qtyOut;

        return {
            id: m.id,
            date: m.createdAt,
            type: m.type,
            qtyIn,
            qtyOut,
            balance: runningBalance,
            fromLocation: m.fromLocation?.name || null,
            toLocation: m.toLocation?.name || null,
            reference: m.reference,
            batch: m.batch?.batchNumber || null,
            createdBy: m.createdBy?.name || null
        };
    });

    return {
        product,
        entries,
        summary: { openingStock, totalIn, totalOut, closingStock: runningBalance }
    };
}
```

**Step 2: Re-export from inventory-service.ts**

Add to `src/services/inventory-service.ts`:
```typescript
import { getStockLedger } from './inventory/stock-ledger-service';
// In InventoryService class:
static getStockLedger = getStockLedger;
```

**Step 3: Add server action in `src/actions/inventory.ts`**

```typescript
export async function getStockLedgerAction(
    productVariantId: string,
    startDate: Date,
    endDate: Date
) {
    await requireAuth();
    return await InventoryService.getStockLedger(productVariantId, startDate, endDate);
}
```

---

### Task 2: Create `StockLedgerClient` Component

**Files:**
- Create: `src/components/warehouse/StockLedgerClient.tsx`

Mirrors `AccountLedgerClient.tsx`. Key sections:
- **Header**: Product name, SKU code, unit, back button, Export CSV button
- **Date Filter Card**: From/To date pickers with Apply/Clear
- **Summary Cards** (4 cards): Opening Stock · Total In · Total Out · Closing Stock
- **Movement Table**: Date · Type (badge) · Qty In · Qty Out · Balance · Location · Reference · Batch

---

### Task 3: Create the Page Route

**Files:**
- Create: `src/app/warehouse/inventory/[id]/page.tsx`

```typescript
// Same pattern as finance/coa/[id]/page.tsx
// Fetch data via getStockLedgerAction, pass to StockLedgerClient
```

---

### Task 4: Add Navigation Link from Inventory Table

**Files:**
- Modify: `src/app/warehouse/inventory/page.tsx`

Add a clickable link on each product name/SKU row that navigates to `/warehouse/inventory/[productVariantId]`.

---

### Task 5: Verify

Run: `npm run build && npm run lint`
Expected: Exit code 0, no errors.

Commit: `git commit -m "feat: add SKU stock ledger page with movement history"`

---

## Summary of New Files

| File | Purpose |
|---|---|
| `src/services/inventory/stock-ledger-service.ts` | Ledger data query + running balance |
| `src/components/warehouse/StockLedgerClient.tsx` | UI component (date filter, summary, table) |
| `src/app/warehouse/inventory/[id]/page.tsx` | Page route |
