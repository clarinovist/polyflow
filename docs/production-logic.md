# Production Module Business Logistics & Rules

**Last Updated**: July 22, 2026

## 0. Material Ownership (Dual Path)

Not every stock move goes through the formal RM warehouse desk. Continuous plastic flow uses two paths:

### Path A — Warehouse-controlled (RM / FG gate)

| Move | Owner | Typical UI |
|------|--------|------------|
| Supplier → RM warehouse | Warehouse | Goods receipt / incoming |
| RM → Mixing (resin, pelembab, pigment, …) | **Warehouse** | `/warehouse` transfer / issue |
| Ad-hoc additive mid-run from RM (e.g. pelembab on Extrusion) | **Warehouse** | `/warehouse` **Catat Pemakaian Bahan** |
| FG store & ship | Warehouse | Outgoing / inventory |

### Path B — Floor-controlled (WIP between stages)

| Move | Owner | Typical UI |
|------|--------|------------|
| Mixing output → Mixing Area stock | Production (output) | Kiosk / output entry + backflush |
| Mixing Area → Extrusion (compound / Mixing HD) | **Production floor** | WO Extrusion Materials **Transfer Material** (staging) or backflush |
| Extrusion → Packing (rolls) | Production floor | Transfer / backflush on Packing WO |
| In-process consumption on output | System | Backflush on output |

**Rule of thumb:** Warehouse owns **raw materials and finished goods**. Production owns **WIP moving between machines**. Do **not** require a formal RM warehouse request for every Mixing→Extrusion→Packing hop.

### Server role gates (Phase 2)

| Action | Path | Allowed roles |
|--------|------|----------------|
| `recordAdHocMaterialUsage` | A (RM ad-hoc) | `WAREHOUSE`, `ADMIN` |
| `recordMaterialIssue` / `deleteMaterialIssue` | A | `WAREHOUSE`, `ADMIN` |
| `consolidatedBatchIssueMaterials` | A | `WAREHOUSE`, `ADMIN` |
| `batchIssueMaterials` on MIXING/STANDARD | A | `WAREHOUSE`, `ADMIN` |
| `batchIssueMaterials` on EXTRUSION/PACKING/REWORK | B (floor) | `PRODUCTION`, `PLANNING`, `WAREHOUSE`, `ADMIN` |

Helper: `src/lib/production/material-path.ts` + `requireMaterialPathRole` / `requireWarehouseStockRole`.

## 1. Production Start & Execution

- **Trigger:** Button "START JOB" on Kiosk/Operator Interface.
- **Validation:**
  - Checks if Machine/Operator/Shift is assigned (Optional depending on strictness).
  - **Does NOT check** if material has been issued.
  - **Does NOT check** if stock is sufficient at the moment of start.
- **Status Change:** Updates Order Status from `RELEASED` to `IN_PROGRESS`.
- **Stock Impact:** ZERO. Starting a job does not deduct any inventory.

## 2. Material Issuance (Pengambilan Bahan)

- **Concept:** Trust-based / Actual-based.
- **Trigger:** Specific action "Material Issue" / "Ambil Bahan" by Warehouse/Production Admin.
- **Mechanism:**
  - Uses `batchIssueMaterials` function.
  - **Deduction:** Inventory is deducted immediately upon this transaction.
  - **Costing:** COGS (HPP) is calculated based on this actual issuance, not the BOM standard.
- **Validation:**
  - **Strict Stock:** Cannot issue if system stock (Quantity in Inventory table) < Requested Quantity.
  - **No Over-Issue Blocking:** System allows issuing MORE than the planned BOM quantity.
  - **Partial Issue:** Allowed. Can issue 10kg now, 20kg later. System accumulates total.
- **Batch FIFO:** System automatically selects oldest batches (First-In-First-Out) during issuance.

## 3. Substitutions & Plan Changes

- **Adding Items:** Allowed at any time during production.
- **Removing Items:**
  - Allowed **ONLY IF** that specific item has **0 issued quantity**.
  - If an item has already been partially issued, it cannot be removed from the plan (but you can stop issuing the rest).
- **Effect:** Useful for ad-hoc substitutions (e.g., ran out of Brand A, added Brand B as new material).

## 4. Production Output & Scrap

- **Output Entry:** Operator enters "Good Qty" and "Scrap/Reject Qty".
- **Stock Impact:**
  - **Good Qty:** Increases stock of Finished Good (FG).
  - **Scrap:** Increases stock of Scrap Item (e.g., SCRAP-PRONGKOL) in Scrap Warehouse.
- **Completion:** Order can be marked `COMPLETED` even if:
  - Material Issued < Standard BOM (Efficiency/Savings).
  - Material Issued > Standard BOM (Waste/Over-usage).

## 5. Service Layer Integration

Production logic is now implemented in `src/services/production/` with the following services:

- **ProductionService** - Core production order management
- **CostingService** - COGS (HPP) and COGM calculations
- **OrderCostingService** - Per-order costing and variance analysis
- **InventoryService** - Stock operations and FIFO batch allocation

Server Actions in `src/actions/production/` delegate to these services, following the pattern:
`Auth Check` → `Input Parsing` → `Call Service` → `Return Result`

## 6. FG Demand Board & SPK Priority

### Demand Board (`/production/requests`)

The FG Demand Board replaces the old "SO without WO" list. It aggregates **FG items** from open Sales Orders and shows:

- **openDemand**: total residual across open SOs per variant
- **availableFg**: FG stock across non-scrap locations
- **needToMake**: `max(0, openDemand − availableFg)`
- **openSpkPlanned**: total planned qty from open SPKs (via BOM.productVariantId)
- **uncoveredNeed**: `max(0, needToMake − openSpkPlanned)`
- **urgencyHint**: URGENT (≤2d), NORMAL (≤7d), LOW (>7d) — signal only, not auto-priority

SPKs created from the board are **not linked to any SO** (`salesOrderId = null`). Demand decreases as:
- FG stock increases (production output)
- SO residual decreases (delivery/shipment)

### SPK Priority

`ProductionOrder` has a `priority` field: `URGENT | NORMAL | LOW` (default: `NORMAL`).

- Priority is **manual** — admin sets it when creating SPK
- The urgency badge on the demand board is a **signal only** and does not auto-set SPK priority
- Priority is displayed as a badge on the order list and detail pages

### Auto-WO on SO Confirm (Feature Flag)

By default, confirming a Sales Order **no longer auto-creates WOs**. Shortages go to the FG Demand Board instead.

To re-enable legacy auto-WO behavior:
```
AUTO_CREATE_WO_ON_SO_CONFIRM=true
```
