# PolyFlow Schema Domain Map

This document maps the Prisma schema into practical bounded contexts so the team can review, extend, and eventually split the schema with lower risk.

## Why This Exists

The main Prisma schema has grown into a cross-domain document covering operations, finance, manufacturing, platform concerns, and shared actors. That is acceptable for Prisma itself, but it slows code review and makes schema ownership unclear.

Use this map to answer three questions before changing a model:

1. Which business domain owns this model?
2. Which adjacent domains can depend on it?
3. Which service or action layer should absorb the change?

## Domain Boundaries

### Access Control And Shared Actors

Purpose:
Core identity, user roles, auditability, and human actors used across modules.

Models:
- `User`
- `Employee`
- `ProductionShift`
- `ApiKey`
- `JobRole`
- `RolePermission`
- `AuditLog`

Primary app/service ownership:
- Auth and shared access logic in `src/actions/auth*`, `src/lib/tools/auth-checks`, and portal-level authorization
- Production execution features for `Employee` and `ProductionShift`

Notes:
- `User` is a platform-level actor and should not accumulate domain-specific workflow logic.
- `Employee` is operational, not authentication-focused, even though both represent people.

### Master Data

Purpose:
Reusable business entities referenced by many workflows.

Models:
- `Supplier`
- `Customer`
- `Location`

Primary app/service ownership:
- Sales, purchasing, warehouse, and finance modules all read these models

Notes:
- `Location` is especially high-fanout and acts as a cross-domain anchor for warehouse, returns, maklon, and fixed assets.
- Changes to `Location` should be treated as architecture-level changes.

### Inventory, Catalog, And Manufacturing Core

Purpose:
Product structure, stock state, manufacturing plans, execution, and cost-sensitive inventory movement.

Models:
- `Product`
- `ProductVariant`
- `CostHistory`
- `SupplierProduct`
- `Bom`
- `BomItem`
- `StockMovement`
- `Inventory`
- `Machine`
- `Batch`
- `StockReservation`
- `StockOpname`
- `StockOpnameItem`
- `ProductionOrder`
- `MachineDowntime`
- `MaterialIssue`
- `ProductionIssue`
- `ScrapRecord`
- `QualityInspection`
- `ProductionMaterial`
- `ProductionExecution`
- `WorkShift`
- `MaklonCostItem`

Primary app/service ownership:
- `src/services/inventory/*`
- `src/services/production/*`
- `src/services/accounting/*` for valuation-sensitive movement posting

Risk notes:
- `StockMovement`, `Inventory`, and `ProductionOrder` are finance-sensitive models because they influence valuation, HPP, WIP, and journal behavior.
- `ProductVariant` is the densest integration point in the schema and should be considered a shared kernel, not a simple catalog table.

### Sales, Purchasing, And Fulfillment

Purpose:
Commercial demand, procurement, physical fulfillment, billing documents, and supplier/customer transaction flow.

Models:
- `SalesOrder`
- `SalesQuotation`
- `SalesQuotationItem`
- `SalesOrderItem`
- `Invoice`
- `PurchaseOrder`
- `PurchaseOrderItem`
- `GoodsReceipt`
- `GoodsReceiptItem`
- `PurchaseInvoice`
- `PurchasePayment`
- `DeliveryOrder`
- `DeliveryOrderItem`
- `PurchaseRequest`
- `PurchaseRequestItem`

Primary app/service ownership:
- `src/services/sales/*`
- `src/services/purchasing/*`
- `src/actions/sales/*`
- `src/actions/purchasing/*`

Risk notes:
- `Invoice`, `PurchaseInvoice`, and `GoodsReceipt` are commercial documents with accounting impact.
- `Payment` is now the canonical runtime payment record for both AR and AP flows. `PurchasePayment` should be treated as legacy schema surface pending data audit and removal planning.

### Finance And Accounting Core

Purpose:
Double-entry accounting, fiscal control, fixed assets, budgeting, and journalized finance state.

Models:
- `Account`
- `JournalEntry`
- `JournalLine`
- `FiscalPeriod`
- `FixedAsset`
- `Budget`

Primary app/service ownership:
- `src/services/finance/*`
- `src/services/accounting/*`
- `src/actions/finance/*`

Risk notes:
- These models should remain highly stable because many transactional modules post into them indirectly.
- `JournalEntry.referenceType` and `referenceId` are critical interoperability contracts across the whole app.

### Shared Document Sequences, Payments, And Returns

Purpose:
Cross-domain primitives reused by finance, sales, purchasing, and warehouse flows.

Models:
- `SystemSequence`
- `Payment`
- `SalesReturn`
- `SalesReturnItem`
- `PurchaseReturn`
- `PurchaseReturnItem`

Primary app/service ownership:
- Shared between finance, sales, purchasing, and warehouse services

Risk notes:
- `Payment` now acts as the canonical payment record for journal references and cleanup logic.
- Returns are operationally commercial documents but materially affect stock and finance, so they sit at a domain seam.

### Platform And Multi-Tenant Extensions

Purpose:
Cross-cutting platform features outside the core operational ERP flow.

Models:
- `Tenant`
- `Notification`
- `PettyCashTransaction`
- `MaklonMaterialReturn`
- `MaklonMaterialReturnItem`

Primary app/service ownership:
- Tenant provisioning and environment setup
- Notification delivery logic
- Finance petty cash flow
- Maklon-specific operational flow

Notes:
- `PettyCashTransaction` belongs financially, but its workflow is specialized enough to justify separate treatment.
- `MaklonMaterialReturn` is operationally close to warehouse and sales, but contextually specific enough to be treated as an extension boundary.

## Shared Kernel Models

These models are referenced broadly enough that they should be treated as shared kernel entities:

- `User`
- `Customer`
- `Supplier`
- `Location`
- `ProductVariant`
- `StockMovement`
- `ProductionOrder`
- `Invoice`
- `PurchaseInvoice`
- `Payment`
- `JournalEntry`

Changes here need extra review because they can ripple through services, dashboards, reports, and auto-journal logic.

## High-Risk Seams

These are the most sensitive cross-domain boundaries in the schema:

1. Inventory to finance:
`Inventory`, `StockMovement`, `CostHistory`, `JournalEntry`

2. Production to finance:
`ProductionOrder`, `MaterialIssue`, `ProductionExecution`, `ScrapRecord`

3. Purchasing to finance:
`GoodsReceipt`, `PurchaseInvoice`, `Payment`, `PurchasePayment`

4. Sales to finance:
`SalesOrder`, `Invoice`, `Payment`, `SalesReturn`

5. Maklon to inventory and sales:
`ProductionOrder.isMaklon`, `GoodsReceipt.isMaklon`, `MaklonMaterialReturn`

## Ownership Guidance For Future Changes

Use these rules when editing the schema:

1. If a model mainly exists to represent workflow state, keep its business rules in the matching service layer, not in generic action helpers.
2. If a change affects valuation, HPP, payment posting, or journal cleanup, finance and inventory should both review it.
3. If a model is used by more than three domains, prefer additive changes and avoid semantic repurposing of existing fields.
4. If a new feature introduces a niche workflow, prefer a new extension model over inflating a shared kernel model.

## Safe Next Steps

If the team wants to continue improving schema maintainability, the safest order is:

1. Keep the current single-file schema but preserve domain section headers.
2. Maintain this document as the source of ownership truth.
3. Audit overlap between `Payment` and `PurchasePayment` before any consolidation.
4. Remove `PurchasePayment` only through a dedicated data audit and migration step, not incidental refactor work.
5. Only consider physical schema splitting after the team confirms it will reduce merge conflicts and review time.