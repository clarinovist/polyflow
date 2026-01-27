# Sales Order Simulation BOM Validation Implementation Plan

**Goal:** Improve user experience when clicking "Simulate Order" for items without a Bill of Materials (BOM) by showing a clear notification instead of silently skipping them.

**Architecture:** Extend the `MrpService` to identify and return products missing a default BOM. Update the frontend `SalesOrderDetailClient` to handle these missing BOMs and display a user-friendly alert or toast.

**Tech Stack:** Next.js (Server Actions), React, Prisma, Tailwind CSS, Lucide React.

---

### Task 1: Update MrpService Interface and Logic
**Files:**
- Modify: `src/services/mrp-service.ts`

**Step 1: Update `MrpSimulationResult` interface**
Modify the interface to include `missingBoms`.

```typescript
export interface MrpSimulationResult {
    salesOrderId: string;
    requirements: MaterialRequirement[];
    canProduce: boolean;
    missingBoms: {
        productName: string;
        productVariantId: string;
    }[];
}
```

**Step 2: Update `simulateMaterialRequirements` logic**
Collect items that are missing a default BOM.

```typescript
// Inside simulateMaterialRequirements
const missingBoms = [];

for (const item of so.items) {
    const bom = await prisma.bom.findFirst({
        where: { productVariantId: item.productVariantId, isDefault: true },
        include: { items: { include: { productVariant: true } } }
    });

    if (!bom) {
        missingBoms.push({
            productName: item.productVariant.name,
            productVariantId: item.productVariantId
        });
        continue;
    }
    // ... rest of logic
}

return {
    salesOrderId,
    requirements,
    canProduce: globalCanProduce && missingBoms.length === 0,
    missingBoms
};
```

---

### Task 2: Update SalesOrderDetailClient UI
**Files:**
- Modify: `src/components/sales/SalesOrderDetailClient.tsx`

**Step 1: Update result handling in `handleSimulateProduction`**
Check for `missingBoms` in the simulation result and update state or show toast.

**Step 2: Update Dialog UI to show missing BOM alerts**
Add an alert section in the `DialogContent` if `simulationResult.missingBoms` is not empty.

```tsx
{simulationResult.missingBoms && simulationResult.missingBoms.length > 0 && (
    <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Missing Bill of Materials (BOM)</AlertTitle>
        <AlertDescription>
            The following products do not have a default BOM defined. Please create them before continuing:
            <ul className="list-disc pl-5 mt-2">
                {simulationResult.missingBoms.map(item => (
                    <li key={item.productVariantId}>{item.productName}</li>
                ))}
            </ul>
        </AlertDescription>
    </Alert>
)}
```

---

### Task 3: Verification
**Step 1: Manual Test**
1. Select a Sales Order with at least one item missing a BOM.
2. Confirm the order.
3. Click "Simulate Production".
4. Verify that the "Missing Bill of Materials" alert appears correctly in the modal.
5. Create a BOM for that item and run the simulation again.
6. Verify the alert is gone.
