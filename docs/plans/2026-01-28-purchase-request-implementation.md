# Implementation Plan: Purchase Request System

**Goal:** Implement a "Purchase Request" (internal quotation) system to handle stock shortages during Sales Order confirmation, replacing the "Waiting Reservation" logic.

**Architecture:**
1.  **New Entity:** Introduce `PurchaseRequest` and `PurchaseRequestItem` models in Prisma.
2.  **Workflow Trigger:** When confirming a Make-to-Stock Sales Order with insufficient inventory:
    *   Calculate the shortage.
    *   Create a `PurchaseRequest` for the missing items.
    *   **Skip** creating `StockReservation` with `WAITING` status (keep stock ledger clean).
    *   Sales Order proceeds to `CONFIRMED`.
3.  **Management UI:** A new "Requests" tab/page in the Purchasing workspace to view and convert these requests into Purchase Orders.

## Proposed Changes

### 1. Database Schema
#### [MODIFY] [prisma/schema.prisma](file:///Users/nugroho/Documents/polyflow/prisma/schema.prisma)
- Define `model PurchaseRequest` (similar to `PurchaseOrder` but simpler).
- Define `model PurchaseRequestItem`.
- Define `enum PurchaseRequestStatus` (`OPEN`, `APPROVED`, `REJECTED`, `CONVERTED`).

```prisma
model PurchaseRequest {
  id              String                @id @default(uuid())
  requestNumber   String                @unique // PR-YYYY-XXXX
  requestDate     DateTime              @default(now())
  status          PurchaseRequestStatus @default(OPEN)
  priority        String                @default("NORMAL") // NORMAL, URGENT
  notes           String?
  
  // Relations
  items           PurchaseRequestItem[]
  salesOrderId    String?               // Link back to SO
  salesOrder      SalesOrder?           @relation(fields: [salesOrderId], references: [id])
  convertedToPoId String?
  purchaseOrder   PurchaseOrder?        @relation("PrToPo", fields: [convertedToPoId], references: [id])
  
  // Audit
  createdById     String
  createdBy       User                  @relation(fields: [createdById], references: [id])
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
}

model PurchaseRequestItem {
  id                String          @id @default(uuid())
  purchaseRequestId String
  productVariantId  String
  quantity          Decimal         @db.Decimal(15, 4)
  notes             String?

  purchaseRequest   PurchaseRequest @relation(fields: [purchaseRequestId], references: [id], onDelete: Cascade)
  productVariant    ProductVariant  @relation(fields: [productVariantId], references: [id])
}
```

### 2. Backend Services
#### [MODIFY] [src/services/purchase-service.ts](file:///Users/nugroho/Documents/polyflow/src/services/purchase-service.ts)
- Implement `createPurchaseRequest(data: CreatePurchaseRequestValues)`.
- Implement `convertRequestToOrder(requestId: string)`.

#### [MODIFY] [src/services/sales-service.ts](file:///Users/nugroho/Documents/polyflow/src/services/sales-service.ts)
- Update `confirmOrder` logic:
    - **Remove** `InventoryService.createStockReservation` for `WAITING` status.
    - **Add** check for physical stock availability.
    - If `physical < demand`, calculate `shortage = demand - physical`.
    - If `shortage > 0`, call `PurchaseService.createPurchaseRequest`.

### 3. Purchasing UI
#### [NEW] [src/app/[locale]/purchasing/requests/page.tsx](file:///Users/nugroho/Documents/polyflow/src/app/[locale]/purchasing/requests/page.tsx)
- List view of Purchase Requests (Kanban or Table).
- Actions: "Create PO" (Convert).

## Verification Plan
### Automated Tests
- [ ] **Simulate Stock Shortage:** Confirm an SO with 0 stock.
- [ ] **Verify Checks:** Ensure NO `StockReservation` (WAITING) is created.
- [ ] **Verify Artifacts:** Ensure `PurchaseRequest` is created with correct `salesOrderId` link.
- [ ] **Verify Stock:** Inventory remains 0/0 (Available/Reserved).

### Manual Verification
1.  **Sales User:** Confirm an order for an out-of-stock item.
    *   Expect: Success, status `CONFIRMED`.
2.  **Purchasing User:** Go to Purchasing > Requests.
    *   Expect: See a new PR for the missing items linked to the SO.
3.  **Conversion:** Click "Convert to PO".
    *   Expect: New Draft PO created with those items.
