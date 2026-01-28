# Inventory Job Queue: Collapsible List Design
**Goal:** Optimize screen real estate by converting the "Grid of Cards" layout in the Warehouse Job Queue to a "Collapsible List" (Accordion) style.
**Architecture:** Replace the mapping of `WarehouseOrderCard` in `WarehouseRefreshWrapper` with a Shadcn UI `Accordion` list.
**Tech Stack:** React, Next.js, Shadcn UI (Accordion, Table/Grid), Lucide React.

### Task 1: Component Refactoring
**Files:**
- Modify: `src/app/[locale]/warehouse/WarehouseRefreshWrapper.tsx`
- New/Modify: `src/components/warehouse/JobQueueList.tsx` (Optional, might keep inline for simplicity or separate for cleanliness)

**Step 1: Layout Change**
- Replace the `<div className="grid grid-cols-1 gap-4">` with a `<div className="space-y-2">`.
- Use `Accordion` component from `@/components/ui/accordion`.

**Step 2: Define List Item Structure (Collapsed)**
Each item will be an `AccordionItem` -> `AccordionTrigger`.
Layout of Trigger (using `flex`):
- **Status Indicator**: Color dot (e.g., Orange for Released).
- **Order #**: Bold text (e.g., **WO-1024**).
- **Product**: Text (e.g., Roti Tawar).
- **Machine**: Badge/Text (e.g., Mixer A).
- **Date**: Text (e.g., "Due: 2h ago").
- **Action**: Chevron (Automatic).

**Step 3: Define Detail Structure (Expanded)**
Each item will be an `AccordionContent`.
Content:
- Reuse the internal logic of `WarehouseOrderCard` here.
- Show **Material Requirements** Table.
- Show **Issue/Transfer** Buttons.
- Show **Notes**.

### Task 2: Implementation Details
**Mockup Code Snippet:**
```tsx
<Accordion type="single" collapsible className="w-full space-y-2">
  {filteredOrders.map(order => (
    <AccordionItem key={order.id} value={order.id} className="border rounded-lg px-4 bg-card">
       <AccordionTrigger className="hover:no-underline py-3">
          <div className="flex items-center gap-4 w-full pr-4">
             <StatusDot status={order.status} />
             <span className="font-mono font-bold">{order.orderNumber}</span>
             <span className="flex-1 text-left">{order.bom.productVariant.name}</span>
             <Badge variant="outline">{order.machine?.name || 'No Machine'}</Badge>
          </div>
       </AccordionTrigger>
       <AccordionContent className="pt-2 pb-4 border-t mt-2">
          {/* Detailed content originally in WarehouseOrderCard */}
          <JobQueueDetail order={order} locations={formData.locations} />
       </AccordionContent>
    </AccordionItem>
  ))}
</Accordion>
```

### Task 3: Cleanup
- If `WarehouseOrderCard.tsx` becomes unused, mark for deletion or keep as legacy ref.
