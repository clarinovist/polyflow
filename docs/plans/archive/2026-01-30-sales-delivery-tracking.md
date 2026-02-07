# Sales Delivery Tracking Implementation Plan

**Goal:** Complete the sales delivery tracking feature by allowing tracking number input and viewing delivery details.
**Architecture:** Enhance existing ship action to accept tracking info, create a modal for input, and implement a dedicated delivery detail page.
**Tech Stack:** Next.js, Prisma, Tailwind CSS, shadcn/ui, Zod.

---

### Task 1: Schema Update
**Files:**
- Modify: `src/lib/schemas/sales.ts`

**Step 1: Update shipSalesOrderSchema**
```typescript
export const shipSalesOrderSchema = z.object({
    id: z.string(),
    trackingNumber: z.string().optional(),
    carrier: z.string().optional(),
});
```

---

### Task 2: Service Layer Update
**Files:**
- Modify: `src/services/sales-service.ts`

**Step 1: Update shipOrder signature**
Modify `shipOrder(id: string, userId: string)` to `shipOrder(id: string, userId: string, trackingInfo?: { trackingNumber?: string, carrier?: string })`.

**Step 2: Update prisma.deliveryOrder.create call**
Pass the tracking info into the data object.

---

### Task 3: Action Layer Update
**Files:**
- Modify: `src/actions/sales.ts`

**Step 1: Update shipSalesOrder action**
Update to parse `shipSalesOrderSchema` and pass data to service.

---

### Task 4: UI - Shipment Dialog
**Files:**
- Create: `src/components/sales/ShipmentDialog.tsx`

**Step 1: Create Dialog Component**
Implement a modal with fields for Carrier and Tracking Number. Integration with `sonner` and `shipSalesOrder`.

---

### Task 5: UI - Sales Order Detail integration
**Files:**
- Modify: `src/components/sales/SalesOrderDetailClient.tsx`

**Step 1: Replace direct shipment call**
Change the "Ship Order" button to trigger the `ShipmentDialog`.

---

### Task 6: Delivery Detail Implementation
**Files:**
- Modify: `src/actions/deliveries.ts`
- Create: `src/components/sales/DeliveryOrderDetail.tsx`
- Create: `src/app/[locale]/sales/deliveries/[id]/page.tsx`

**Step 1: Add getDeliveryOrderById action**
**Step 2: Implement DeliveryOrderDetail component**
**Step 3: Implement the dynamic route page**

---

### Task 7: Verification
**Step 1: Run build**
`npm run build`
**Step 2: Verify lint**
`npm run lint`
