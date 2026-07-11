# Decouple Surat Jalan / Invoice dari Stok (MTO Hot-Loading)

> **Status:** 📋 Planned (belum diimplementasi)  
> **Date:** 2026-07-11  
> **Tenant context:** Melindo — mostly make-to-order, jarang simpan FG lama; produksi sering langsung dimuat ke truk  
> **Estimasi MVP:** ~5–7 engineer-days  

**Goal:**  
Admin bisa membuat & mencetak surat jalan (dan menyiapkan alur invoice) **sambil truk menunggu / produksi masih jalan**, tanpa memotong stok dulu. Posting stok dan draft invoice final hanya saat DO di-commit ke **SHIPPED**.

**Architecture:**  
Pisahkan 3 concern: (1) dokumen operasional DO PENDING/LOADING, (2) posting stok OUT saat SHIPPED, (3) invoice DRAFT → UNPAID oleh finance. Satu service commit: `delivery-fulfillment-service`.

**Tech Stack:** Next.js App Router, Prisma, Zod, Vitest, shadcn/ui  

**Related:**
- `src/services/sales/fulfillment-service.ts` — `shipOrder` (stock-coupled hari ini)
- `src/actions/inventory/deliveries.ts` — manual DO + status transitions
- `src/services/finance/invoice-lifecycle-service.ts` — draft invoice
- `docs/plans/2026-07-09-modul-pengiriman-armada.md` — armada / DO foundation
- `docs/plans/2026-07-10-delivery-module-completion.md` — status workflow
- `docs/plans/2026-07-10-delivery-shipping-integration.md` — DO → SO shipping charge

---

## 1. Problem statement

Di lapangan Melindo:

1. Truk sudah menunggu dimuat.
2. Produksi masih/baru selesai; admin belum sempat input hasil produksi → **stok FG di sistem masih 0**.
3. Tim butuh **surat jalan** (dan sering invoice) **sekarang**, tapi alur “Ship Order” di Polyflow **hard-block** pada stok.

### Akar di sistem (bukan di bisnis model)

Hari ini ada **dua jalur DO yang tidak sinkron**:

| Jalur | File | Stok OUT | SO status | Invoice |
|-------|------|----------|-----------|---------|
| **A. `shipOrder`** | `fulfillment-service.ts` | Ya (full SO qty) | → `SHIPPED` | Draft auto |
| **B. Manual DO** | `createManualDeliveryOrder` | **Tidak pernah** | Tidak berubah | Tidak |
| **B status → SHIPPED** | `updateDeliveryStatus` | **Tidak** | Hanya saat → `DELIVERED` | Tidak |

Akibat:

- Jalur A memblokir SJ/invoice sampai stok ada (blocker Melindo).
- Jalur B bisa cetak SJ tanpa stok, tapi **status SHIPPED = dokumen saja** → stok, `deliveredQty`, dan invoice tidak pernah sinkron; risk double-DO jika kemudian `shipOrder` dijalankan.

**Solusi permanen:** pisahkan 3 concern, lalu unifikasi commit inventory ke satu titik.

```
1. Dokumen operasional (DO PENDING/LOADING + cetak SJ)  → longgar
2. Posting stok (OUT + deliveredQty + SO ship)          → ketat, saat SHIPPED
3. Invoice final (DRAFT → UNPAID / journal POSTED)       → finance, setelah qty final
```

---

## 2. Product decisions (locked for this plan)

| # | Topik | Keputusan |
|---|--------|-----------|
| D1 | Kapan DO boleh dibuat | Dari SO status `CONFIRMED`, `IN_PRODUCTION`, `READY_TO_SHIP` (bukan DRAFT/CANCELLED/SHIPPED full) |
| D2 | Apakah create DO potong stok | **Tidak** — status `PENDING` / `LOADING` = dokumen + muat fisik |
| D3 | Kapan stok OUT | **Hanya** saat DO transition ke **`SHIPPED`** (single commit path) |
| D4 | Soft vs hard stock check | Create/LOADING: **soft warning** (stok belum cukup). SHIPPED: **hard block** |
| D5 | `shipOrder` (tombol Ship di SO) | Refactor: jika ada open DO → commit DO itu; jika tidak → create DO lalu commit (satu service) |
| D6 | Double document | Larang `shipOrder` full-SO baru jika sudah ada open DO non-cancelled; atau force “commit existing DO” |
| D7 | Partial qty (MVP) | **Out of scope MVP** — DO tetap full residual SO qty (`qty - deliveredQty`). Partial multi-DO = Phase 2 |
| D8 | Invoice draft timing | Auto-create **DRAFT** saat DO → `SHIPPED` (sama seperti sekarang di ship). **Tidak** auto-create di PENDING (hindari freeze harga SO terlalu dini) |
| D9 | Invoice print early? | Opsional Phase 1.5: tombol “Buat draft invoice dari SO” manual (bukan auto), status DRAFT, **tanpa** journal POSTED. MVP cukup draft-on-ship |
| D10 | Negative stock | **Dilarang** — tidak ada ship tanpa stok FG |
| D11 | SO status saat DO PENDING | SO **tetap** `IN_PRODUCTION` / `READY_TO_SHIP` / `CONFIRMED`; baru → `SHIPPED` saat DO committed |
| D12 | Maklon `MAKLON_JASA` | Tetap skip physical stock untuk line SERVICE; path commit DO tidak merusak flow jasa |

---

## 3. Target user flow (Melindo)

```text
SO CONFIRMED / IN_PRODUCTION
        │
        ▼
[Admin/Gudang] Buat Surat Jalan (DO PENDING)
  · pilih SO + lokasi + armada (opsional)
  · qty = sisa undelivered SO
  · stok TIDAK dipotong
  · soft banner: "Stok FG belum lengkap (x/y)"
        │
        ▼
Cetak Surat Jalan ──► truk mulai muat
        │
        ▼
[Opsional] Status → LOADING
        │
        ▼
Produksi input hasil → stok FG masuk sistem
        │
        ▼
[Gudang] Tandai Dikirim (DO → SHIPPED)
  · HARD: validate stok per line di sourceLocation
  · stock OUT + movement + COGS journal
  · deliveredQty += DO qty
  · SO → SHIPPED (MVP full residual)
  · Invoice DRAFT auto (jika belum ada)
        │
        ▼
[Finance] Konfirmasi Invoice → UNPAID + journal POSTED
```

**Blokir truk?** Tidak lagi di tahap cetak SJ.  
**Blokir akuntansi stok?** Tetap di “Tandai Dikirim”.

---

## 4. Architecture

### 4.1 New core service (single source of truth)

**File:** `src/services/sales/delivery-fulfillment-service.ts` (baru)

| Function | Responsibility |
|----------|----------------|
| `createDeliveryOrderFromSalesOrder(...)` | Extract + harden logic dari `createManualDeliveryOrder` (service layer, bukan fat action) |
| `commitDeliveryShipment(deliveryOrderId, userId, opts?)` | Stock OUT for DO items, reservations, deliveredQty, SO status, draft invoice |
| `getDeliveryStockReadiness(deliveryOrderId \| salesOrderId)` | Pure/query helper: per-line available vs needed (untuk soft warning UI) |

**Refactor callers:**

- `createManualDeliveryOrder` action → panggil service create
- `updateDeliveryStatus` saat `newStatus === 'SHIPPED'` → panggil `commitDeliveryShipment` **di dalam transaksi yang sama** (atau service yang sendiri `$transaction`)
- `shipOrder` → thin orchestrator:
  1. Cari open DO (`PENDING`/`LOADING`) untuk SO
  2. Jika ada 1 → `commitDeliveryShipment(thatDoId)`
  3. Jika tidak ada → create DO PENDING (full residual) lalu commit
  4. Jika >1 open DO → error jelas (“Pilih DO mana yang dikirim” / commit dari detail DO)

### 4.2 Stock commit rules (`commitDeliveryShipment`)

Di dalam `prisma.$transaction`:

1. Load DO + items + SO + product types; lock DO row (`FOR UPDATE` jika memungkinkan via raw/query).
2. Guard status: hanya dari `PENDING` atau `LOADING` (idempotent: jika sudah `SHIPPED`+stock movement exists → no-op or error).
3. Guard SO: not `CANCELLED`; allow `CONFIRMED | IN_PRODUCTION | READY_TO_SHIP`.
4. Per physical item:
   - `needed = DO item qty`
   - Validate residual: `deliveredQty + needed <= SO item qty` (decimal-safe)
   - Consume ACTIVE reservations for SO (reuse logic dari `shipOrder`)
   - `InventoryCoreService.validateAndLockStock` + `deductStock`
   - `stockMovement` OUT + `AccountingService.recordInventoryMovement`
5. Update DO status → `SHIPPED` (+ optional tracking/carrier from opts)
6. Increment `SalesOrderItem.deliveredQty`
7. SO status:
   - MVP: if all physical lines fully delivered → `SHIPPED`; else keep previous + throw if partial not allowed (MVP blocks partial by only allowing full residual DO)
8. `createDraftInvoiceFromOrder` **setelah** stock success (ideal: move inside same tx or accept current pattern + improve later)
9. Audit log `COMMIT_DELIVERY_SHIPMENT`
10. Fulfill remaining reservations if fully shipped

### 4.3 Soft readiness helper

```ts
// per line
{
  productVariantId,
  neededQty,
  availableQty,      // free stock at sourceLocation (after reservations?)
  reservedForThisSo,
  shortfall,         // max(0, needed - available)
  isReady: shortfall === 0
}
```

UI: banner kuning di create DO / detail DO jika `!isReady`.  
Commit: throw `InsufficientStockError` dengan detail line.

### 4.4 Status machine (minor change)

`delivery-status.ts` tetap; **side effect** di action:

| Transition | Side effect baru |
|------------|------------------|
| → `LOADING` | none (opsional log) |
| → `SHIPPED` | **`commitDeliveryShipment`** (stock + SO + invoice) |
| → `DELIVERED` | existing `deliverOrder` (no stock) |
| → `CANCELLED` | only if not stock-committed; if already SHIPPED → **block cancel** or require return flow |

**Rule:** DO yang sudah `SHIPPED` (stock posted) **tidak boleh** `CANCELLED` via status machine tanpa stock reverse. MVP: cancel hanya dari `PENDING`/`LOADING`.

Transitions yang relevan:

```
PENDING: LOADING, SHIPPED, CANCELLED
LOADING: SHIPPED, CANCELLED
SHIPPED: IN_TRANSIT, ARRIVED, DELIVERED, RETURNED  (no CANCELLED — already true)
```

PENDING/LOADING cancel never reverse stock (none posted yet).

### 4.5 Invoice policy (MVP)

- Tetap: auto **DRAFT** on stock commit only.
- Tetap: finance **Konfirmasi** → UNPAID + POSTED.
- Tidak ubah model Invoice (header-only) di MVP.
- Shipping sync (`delivery-shipping-sync`) tetap: create DO / pricing / cancel update SO shipping + draft invoice totals.

### 4.6 Schema

**MVP: no schema migration required** if we stay full residual qty.

Optional (nice-to-have, still MVP if cheap):

| Field | Why |
|-------|-----|
| `DeliveryOrder.stockCommittedAt DateTime?` | Idempotency + audit “kapan stok dipotong” |
| `DeliveryOrder.stockCommittedById String?` | Audit |

Partial Phase 2 would need: editable DO line qty, maybe `PARTIALLY_SHIPPED` on SO — **explicitly deferred**.

---

## 5. Implementation phases

### Phase 0 — Guardrails & product copy (½ day)

1. Document SOP internal Melindo (1 page):  
   “SJ boleh dulu → input produksi → Tandai Dikirim potong stok → invoice final”.
2. Labels di UI: bedakan **Surat Jalan (draft/muat)** vs **Dikirim (stok terpotong)**.
3. Add warning banner component shared for stock readiness.

**Files:** `src/lib/labels/sales.ts`, small UI banner, short SOP under `docs/` if needed.

---

### Phase 1 — Service extract + commit path (core) (2–3 days)

**Tasks:**

1. **T1** Extract `createDeliveryOrderFromSalesOrder` to service  
   - Rules: SO status allowlist; physical lines for stock path (match `shipOrder` for SERVICE skip)  
   - Qty = residual `quantity - deliveredQty`  
   - Block if residual = 0  
   - **One open** (`PENDING`/`LOADING`) DO per SO in MVP. Error: “Sudah ada SJ aktif DO-xxxx”.

2. **T2** Implement `commitDeliveryShipment`  
   - Port stock logic from `shipOrder`  
   - Operate on **DO items**, not re-read full SO qty blindly  
   - Unit tests: happy path, insufficient stock, wrong status, double commit, maklon service skip

3. **T3** Wire `updateDeliveryStatus` → SHIPPED calls commit  
   - Transaction ordering: commit first, then any revalidate  
   - Error surfaces to UI toast with stock shortfall message

4. **T4** Refactor `shipOrder` to orchestrate create-or-commit DO  
   - Ship never creates orphan second DO when open DO exists  
   - Keep API `shipSalesOrder` for backward compat UI

5. **T5** `createDraftInvoiceFromOrder` call site moves to commit only (remove duplicate from old ship body)

**Tests (required):**

- `src/services/sales/__tests__/delivery-fulfillment-service.test.ts` (new)
- Update `fulfillment-service` tests if any ship coverage exists
- Extend delivery status action tests if present

**Commit style:** small atomic commits per T1–T5.

---

### Phase 2 — UX for Melindo hot-loading (1–2 days)

1. **SO detail:** tombol primer **“Buat Surat Jalan”** saat `CONFIRMED | IN_PRODUCTION | READY_TO_SHIP`  
   - Prefill SO di `CreateDeliveryOrderDialog` atau deep-link create flow

2. **DO detail:**  
   - Banner stok readiness  
   - Tombol “Tandai Dikirim” = SHIPPED dengan confirm: “Ini akan memotong stok. Pastikan produksi sudah diinput.”  
   - Hard-fail dengan pesan jelas jika shortfall

3. **SO Ship dialog:**  
   - Jika open DO exists → “Akan mengirim DO-xxxx (commit stok)”  
   - Jika tidak → “Buat SJ + kirim sekaligus”

4. **Warehouse outgoing queue:** pastikan link ke SO/DO valid; prefer deep-link open DO

5. **Print (opsional):** label “MENUNGGU MUAT” vs “DIKIRIM” based on status

**Files:**  
`SalesOrderDetailClient.tsx`, `CreateDeliveryOrderDialog.tsx`, `DeliveryOrderDetail.tsx`, `ShipmentDialog.tsx`, mobile `OrderDetailClient.tsx`

---

### Phase 3 — Safety & edge cases (1 day)

1. Block `shipOrder` when open DO exists unless committing that DO  
2. Block create second open DO for same SO  
3. Cancel DO only PENDING/LOADING  
4. Stock commit all-or-nothing transaction  
5. Improve `createDraftInvoiceFromOrder` logging when skipped  
6. DO number race — known issue; sequence fix out of scope unless easy  
7. Regression: shipping charge sync still runs on create; draft invoice total still updatable until locked

---

### Phase 4 — Deferred (explicit non-goals for this delivery)

| Item | Why later |
|------|-----------|
| Partial multi-DO qty picker | Needs residual UI + SO PARTIALLY_SHIPPED + invoice amount redesign |
| Invoice lines / bill by shipped qty | Invoice is header-only today |
| Invoice↔DO FK | Audit nice-to-have after partial |
| Auto READY_TO_SHIP from production complete | Separate ops feature |
| Negative stock / soft-commit inventory | Accounting risk |
| Reverse stock on DO cancel after SHIPPED | Needs sales return / reverse movement flow |

---

## 6. Data & migration

- **MVP:** no Prisma migration required.
- **Optional:** `stockCommittedAt` / `stockCommittedById` on `DeliveryOrder` — recommended if <1h work for ops audit.
- **Data cleanup Melindo:** audit existing manual DOs that are `SHIPPED`/`DELIVERED` without stock movements — ops runbook (report query, not auto-fix).

Suggested audit query (runbook):

```sql
-- DO marked shipped/delivered but no stock movement for that SO
SELECT d."orderNumber", d.status, s."orderNumber"
FROM "DeliveryOrder" d
JOIN "SalesOrder" s ON s.id = d."salesOrderId"
WHERE d.status IN ('SHIPPED','IN_TRANSIT','ARRIVED','DELIVERED')
AND NOT EXISTS (
  SELECT 1 FROM "StockMovement" m
  WHERE m."salesOrderId" = d."salesOrderId" AND m.type = 'OUT'
);
```

---

## 7. File map (expected touch list)

| Layer | Path | Change |
|-------|------|--------|
| Service | `src/services/sales/delivery-fulfillment-service.ts` | **New** create + commit + readiness |
| Service | `src/services/sales/fulfillment-service.ts` | Thin `shipOrder` orchestrator |
| Action | `src/actions/inventory/deliveries.ts` | Create → service; SHIPPED → commit |
| Action | `src/actions/sales/sales.ts` | Unchanged API; behavior via service |
| Lib | `src/lib/sales/delivery-status.ts` | Docs + cancel rules comments |
| Lib | `src/lib/labels/sales.ts` | Copy Indonesian |
| UI | `CreateDeliveryOrderDialog.tsx` | SO filter statuses + readiness |
| UI | `DeliveryOrderDetail.tsx` | Confirm ship + stock banner |
| UI | `SalesOrderDetailClient.tsx` | Buat SJ CTA |
| UI | `ShipmentDialog.tsx` | Commit messaging |
| UI | mobile order detail | Align CTAs |
| Tests | `src/services/sales/__tests__/delivery-fulfillment-service.test.ts` | Core |
| Docs | `docs/plans/2026-07-11-do-stock-decouple.md` | This plan |

---

## 8. Test plan

### Unit

- create DO: allowed SO statuses, reject DRAFT, reject residual 0, reject second open DO  
- commit: stock success → SO SHIPPED, deliveredQty, movement count, draft invoice  
- commit: insufficient stock → no DO status change, no deliveredQty  
- commit: double call → reject  
- updateDeliveryStatus PENDING→SHIPPED → commit side effects  
- shipOrder with existing PENDING DO → commits same DO (no second DO)  
- shipOrder without DO → creates + commits one DO  
- maklon service lines skipped  

### Manual UAT Melindo

1. SO MTO IN_PRODUCTION, stok FG = 0 → Buat SJ → cetak OK  
2. Banner stok merah/kuning  
3. Tandai Dikirim → gagal jelas  
4. Input production → stok masuk  
5. Tandai Dikirim → sukses; stok turun; invoice DRAFT muncul  
6. Jangan bisa buat SJ kedua open  
7. Finance konfirmasi invoice  

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Operator “Tandai Dikirim” sebelum input produksi | Hard block + pesan; training SOP |
| Historical DO SHIPPED tanpa stok | Audit query; jangan auto-commit retroaktif |
| shipOrder + manual DO double | One open DO rule + shipOrder reuses DO |
| Invoice draft freezes SO price edits | Keep draft only on ship (D8) |
| Partial truck loads | Phase 2; until then full residual only |
| COGS vs revenue timing | Unchanged: COGS on ship commit; revenue on invoice confirm |

---

## 10. Success metrics

- Admin Melindo bisa **cetak SJ** saat truk nunggu **tanpa** menunggu stok sistem.  
- **0** stock OUT tanpa commit path.  
- **0** double DO / double deduct pada SO yang sama (happy path).  
- Invoice draft muncul **setelah** stok commit, finance tetap kontrol UNPAID.  
- Waktu tunggu truk tidak lagi diblokir oleh antrian input admin stok (hanya diblokir “Tandai Dikirim” sampai produksi diinput — yang benar secara inventory).

---

## 11. Effort estimate

| Phase | Effort |
|-------|--------|
| Phase 0 | 0.5 day |
| Phase 1 (core) | 2–3 days |
| Phase 2 (UX) | 1–2 days |
| Phase 3 (safety) | 1 day |
| **Total MVP** | **~5–7 engineer-days** |

---

## 12. Implementation order (for execute)

1. Write unit tests for commit behavior (TDD)  
2. Implement `delivery-fulfillment-service` create + commit + readiness  
3. Wire `updateDeliveryStatus` + refactor `shipOrder`  
4. Harden create rules (one open DO, residual qty, status allowlist)  
5. UX banners + CTAs + confirm dialogs  
6. Full test suite + manual UAT script  
7. Optional `stockCommittedAt` migration  
8. Deploy + Melindo SOP handoff  

---

## 13. Open questions (defaults chosen; change only if product rejects)

| Q | Default in plan |
|---|-----------------|
| Boleh >1 open DO per SO? | **Tidak** (MVP) |
| Invoice draft sebelum ship? | **Tidak auto**; manual early draft out of MVP |
| Partial ship? | **Phase 2** |
| `IN_PRODUCTION` boleh buat SJ? | **Ya** (inti use case Melindo) |
| Cancel setelah SHIPPED? | **Tidak** lewat status; pakai retur |

---

## 14. Why this is the right permanent fix

Fondasi sudah ~70% ada (manual DO, status machine, print, draft invoice, shipping sync). Yang hilang hanya **jembatan stok di SHIPPED** dan **unifikasi `shipOrder`**. Itu mengubah dokumen “hantu” menjadi alur MTO yang jujur:

> **Fisik & kertas boleh lebih dulu; stok & invoice final tetap jujur.**

---

## 15. Status implementasi

| Phase | Status | Catatan |
|-------|--------|---------|
| Phase 0 — copy / SOP | 🟡 Partial | Labels + StockReadinessBanner; SOP internal 1-pager belum |
| Phase 1 — service + commit | ✅ Done | `delivery-fulfillment-service` + tests + SHIPPED commit + `shipOrder` orchestrator |
| Phase 2 — UX | 🟡 Partial | Buat SJ CTA, readiness banner (server action), confirm Tandai Dikirim; ShipmentDialog messaging / mobile CTA belum |
| Phase 3 — safety | ✅ Done | Create path via service (D1/D6/D7/D12), residual qty, maklon service-only, one open DO |
| Phase 4 — deferred | — | Out of MVP |

**Verification (2026-07-11):**

1. First review **FAIL** — create dialog bypassed hardened service; client imported Prisma readiness; DO used full SO qty.
2. Fixes applied — wire `createManualDeliveryOrder` → service; `fetchDeliveryStockReadiness` server action; residual DO lines; maklon service-only ship.
3. Re-verify **PASS** — 22 delivery-fulfillment + 3 fulfillment tests green.
