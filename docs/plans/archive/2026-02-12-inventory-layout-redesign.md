# Inventory Control Layout Redesign

**Goal:** Replace the sidebar warehouse navigator with horizontal tab pills to maximize table width.
**Architecture:** Convert `WarehouseNavigator` from vertical card list to horizontal pill tabs. Remove 3+9 grid layout in `page.tsx`, make table full-width. Keep all existing data (SKU count, low stock badge) visible on each tab.
**Tech Stack:** React, Next.js, shadcn/ui, Tailwind CSS

## Proposed Changes

### Component: WarehouseNavigator

#### [MODIFY] [WarehouseNavigator.tsx](file:///Users/nugroho/Documents/polyflow/src/components/warehouse/inventory/WarehouseNavigator.tsx)

**Current:** Vertical card list inside a sidebar (`col-span-3`). Each warehouse is a card with icon + name + SKU count + low stock badge.

**New:** Horizontal scrollable pill tabs. Each warehouse is a small clickable button/pill.

```tsx
// New layout concept:
// ┌─────────────────────────────────────────────────────────────────┐
// │ [🏭 All (92)] [Raw Material (29) ⚠10] [Finished (23) ⚠14] ... │
// └─────────────────────────────────────────────────────────────────┘

// Each pill shows:
// - Warehouse name (shortened if needed)
// - SKU count
// - Low stock badge (if > 0)
// - Active state with primary color ring
```

**Key Changes:**
- Root container: `flex flex-wrap gap-2` instead of vertical card list
- Each location: `Link` pill button with `rounded-full px-3 py-1.5`
- "All" tab added as first item (shows total SKU count)
- Active tab: `bg-primary text-primary-foreground` ring style
- Low stock count shown as small red badge inside the pill
- Remove `Card` wrapper, `h-full`, scrollable container

---

### Page Layout: Inventory Page

#### [MODIFY] [page.tsx](file:///Users/nugroho/Documents/polyflow/src/app/warehouse/inventory/page.tsx)

**Current (lines 188-248):**
```
grid grid-cols-12
├── col-span-3: WarehouseNavigator (sidebar)
└── col-span-9: Card > InventoryTable
```

**New:**
```
flex flex-col
├── WarehouseNavigator (horizontal tabs, full-width)
├── Card Header (title + badges)
└── InventoryTable (full-width)
```

**Key Changes:**
- Remove `grid grid-cols-12 gap-6` wrapper
- Remove `col-span-3` and `col-span-9` wrappers
- Place `WarehouseNavigator` above the table card, full-width
- Table card becomes `w-full` with `flex-1` for remaining height

---

## Tasks

### Task 1: Redesign WarehouseNavigator Component
**Files:** Modify `src/components/warehouse/inventory/WarehouseNavigator.tsx`

- Step 1: Replace vertical card layout with horizontal pill layout
- Step 2: Add "All Warehouses" as first pill
- Step 3: Show SKU count + low stock badge in each pill
- Step 4: Style active/inactive states

### Task 2: Update Page Layout
**Files:** Modify `src/app/warehouse/inventory/page.tsx`

- Step 1: Remove 3+9 grid layout
- Step 2: Place WarehouseNavigator above table card
- Step 3: Make table card full-width
- Step 4: Ensure proper overflow/scroll behavior

### Task 3: Verification
- Step 1: Run `npm run lint`
- Step 2: Run `npm run build`
- Step 3: Visual verification in browser

## Verification Plan

### Automated Tests
```bash
npm run lint
npm run build
```

### Manual Verification
1. Navigate to `/warehouse/inventory`
2. Verify all 6 warehouses appear as horizontal tabs + "All" tab
3. Click each tab → table filters correctly
4. Verify multi-select still works (click multiple tabs)
5. Verify low stock badges are visible on relevant tabs
6. Verify table is wider than before (no sidebar taking space)
7. Verify responsive behavior on smaller screens
