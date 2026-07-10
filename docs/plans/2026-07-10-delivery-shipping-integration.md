# Delivery Shipping Integration — Implementation Plan

> **Status: ✅ MERGED TO `main`** (2026-07-10)  
> Merge: `c430344` — `Merge branch 'feat/delivery-shipping-integration'`  
> Branch feature: `feat/delivery-shipping-integration` (20 commits)  
> Gate saat merge: lint 0 · `tsc --noEmit` 0 · vitest **1109/1109** · build ✅  
> Dokumen ini = **plan + status implementasi**. Bagian task di bawah tetap sebagai spek historis; lihat **Status implementasi** untuk kebenaran terkini.

**Goal (tercapai):**  
1. **DO → SO** sebagai sumber tagihan ongkir customer (`Σ DO.totalCharge` → `SO.shippingCost` + recalc `SO.totalAmount`).  
2. **Calc lengkap** di entry point utama (create DO, assign jadwal, edit pricing) + tampilan tarif di detail DO.  
3. **Pricing rute Opsi A** — multi-tarif aktif per `routeName` per kendaraan, tanpa master `ShippingRoute`.

**Architecture (shipped):**  
- Pure helpers di `src/lib/sales/delivery-pricing.ts` (calc + normalize rute).  
- Sync service di `src/services/sales/delivery-shipping-sync.ts` (DO → SO → draft invoice).  
- Schema: `DeliveryOrder.appliedRouteName`.  
- Accounting journal **belum** diubah (desain tetap di Appendix A).

**Tech Stack:** Next.js App Router, Prisma, Zod, Vitest, shadcn/ui

**Related:**
- `docs/plans/2026-07-09-modul-pengiriman-armada.md` — foundation Vehicle / VehicleTariff / schedule  
- `docs/plans/2026-07-10-delivery-module-enhancements.md` — DO fields, foto, status  
- `docs/plans/2026-07-10-delivery-module-completion.md` — workflow status, report columns; **ShippingRoute out of scope** (appendix)

**Estimasi (aktual):** ~1 sprint focused; accounting phase terpisah masih open

---

## Status implementasi (post-merge `main`)

| Phase / Task | Plan | Status | Catatan |
|--------------|------|--------|---------|
| **0** Pure `delivery-pricing` + tests | Required | ✅ Done | 35 unit tests |
| **1.1** Schema `appliedRouteName` + migration | Required | ✅ Done | `prisma/migrations/20260710_delivery_applied_route_name` |
| **1.2** Overlap tarif per (vehicle, route) | Required | ✅ Done | Multi-rute boleh overlap tanggal |
| **1.3** `getActiveTariff(vehicleId, routeName?)` + `listVehicleRouteOptions` | Required | ✅ Done | Exact → fallback “Semua Rute” → null |
| **1.4** `updateDeliveryPricing` action + Zod | Required | ✅ Done | Recompute totals + sync |
| **2.1** Create DO route-aware | Required | ✅ Done | `CreateDeliveryOrderDialog` |
| **2.2** Assign schedule totals | Required | ✅ Done | `computeDeliveryTotals` + sync |
| **2.3** Fleet card + `EditDeliveryPricingDialog` | Required | ✅ Done | `getDeliveryOrderById` include `vehicle` |
| **2.4** Labels pricing | Required | ✅ Done | `salesLabels.*` |
| **3.1** Sync unit tests | Required | ✅ Done | 12 tests (multi-DO, cancel, RETURNED, lock, draft) |
| **3.2** Sync call sites | Required | ✅ Done | create / assign / cancel\|return / updatePricing |
| **3.3** SO form/detail fleet-driven ongkir | Required | ✅ Done | read-only + badge; `deliveryOrders` di edit page |
| **3.4** Credit limit soft warning | Optional | ⏭️ Deferred | Tidak di-merge; follow-up |
| **4.1** Shipping report per rute | Required | ✅ Done | filter, tab Per Rute, CSV |
| **4.2** Enrich `shipOrder` / ShipmentDialog | Optional | ⏭️ Deferred | Out of scope batch; ship tetap tanpa armada |
| **4.3** Billable helper wired | Required | ✅ Done | `isBillableDeliveryStatus` re-export + form/detail |
| **4.4** Final gate | Required | ✅ Done | lint / tsc / full test / build |
| **Polish** Type harden + lint zero + pre-existing test tsc | — | ✅ Done | `4083889`, `4c37dfe`, `afe6df9` |

### Alur data setelah merge

```
VehicleTariff (multi-rute + validFrom/Until)
        │
        ▼
resolveActiveTariff(vehicleId, routeName?)
        │
        ▼
computeDeliveryTotals → DeliveryOrder snapshot
  (applied*, totalCost, totalCharge, appliedRouteName)
        │
        └── syncSalesOrderShippingFromDeliveries(salesOrderId)
              ├── Σ totalCharge (status ≠ CANCELLED; RETURNED included)
              ├── SO.shippingCost + SO.totalAmount
              └── DRAFT invoice totalAmount
                  (UNPAID|PARTIAL|PAID|OVERDUE → INVOICE_LOCKED, no SO write)
```

### File shipped (referensi cepat)

| Concern | Path |
|---------|------|
| Pricing pure helpers | `src/lib/sales/delivery-pricing.ts` |
| Billable re-export | `src/lib/sales/delivery-status.ts` |
| Sync SO shipping | `src/services/sales/delivery-shipping-sync.ts` |
| Sync tests | `src/services/sales/__tests__/delivery-shipping-sync.test.ts` |
| Tariff multi-route | `src/actions/sales/vehicle-tariffs.ts` |
| DO create/status/pricing | `src/actions/inventory/deliveries.ts` |
| Schedule assign | `src/actions/sales/delivery-schedules.ts` |
| Shipping report | `src/actions/sales/shipping-reports.ts` + report client |
| Detail DO + edit pricing | `DeliveryOrderDetail.tsx`, `EditDeliveryPricingDialog.tsx` |
| SO UX | `SalesOrderForm.tsx`, `SalesOrderDetailClient.tsx`, `orders/[id]/edit/page.tsx` |
| Migration | `prisma/migrations/20260710_delivery_applied_route_name/` |

### Follow-up / deferred (masih open)

| Item | Prioritas | Catatan |
|------|-----------|---------|
| **3.4** Credit limit soft di sync / include shipping di `checkCreditLimit` | Low | Plan optional |
| **4.2** Ship dialog + `shipOrder` fleet fields; sync **sebelum** draft invoice | Med (ops) | Hindari SO ship tanpa charge lalu invoice draft understate |
| **Appendix A** Journal split shipping revenue + policy DRAFT | Med (finance) | Interface data sudah siap di DO/SO |
| `goodsSubtotal < 0` guard / recompute from items | Low | Data legacy |
| `NO_CHANGE` reason di sync (dead enum) | Low | Cosmetik |
| Model `ShippingRoute` (Opsi B) | Future | Appendix B |
| Ops: apply migration `appliedRouteName` di **semua tenant** prod | **High ops** | Wajib sebelum fitur dipakai di tenant live |

### Ops checklist post-merge

- [ ] `migrate-all-tenants` / deploy migration `20260710_delivery_applied_route_name` ke setiap tenant DB  
- [ ] Smoke tenant: multi-rute tarif → create DO → SO shipping → report rute  
- [ ] Smoke: invoice UNPAID → edit DO charge → SO tidak berubah + log/warn  
- [ ] (Opsional) seed tarif armada FACTORY vs PRIVATE per tenant

---

## Keputusan produk (terkunci 2026-07-10)

| # | Topik | Keputusan |
|---|--------|-----------|
| 1 | Sumber tagihan customer | **DO → SO**: sum `totalCharge` DO eligible → `SO.shippingCost` |
| 2 | Kapan sync | Immediate: create DO, assign armada/jadwal, update tarif/berat, cancel DO |
| 3 | Pricing rute | **Opsi A**: multi-tarif per `routeName` + validity date; tanpa model `ShippingRoute` |
| 4 | Akuntansi | Desain di plan; **implementasi journal belakangan** |

### Asumsi default (ubah di PR description jika berbeda)

| # | Asumsi | Default |
|---|--------|---------|
| A1 | Multi-DO | `SO.shippingCost = Σ totalCharge` DO dengan `status ≠ CANCELLED` |
| A2 | RETURNED | **Include** dalam sum (charge tetap ditagih sampai diputus lain) |
| A3 | Invoice lock | Sync **ditolak** jika ada invoice status `UNPAID \| PARTIAL \| PAID \| OVERDUE`. `DRAFT` / `CANCELLED` / tidak ada invoice → boleh sync |
| A4 | Field ongkir di form SO | Editable **hanya** jika belum ada DO dengan `totalCharge != null`. Setelah ada → **read-only** + hint “Dari surat jalan” |
| A5 | `minKg` | Soft: `billableKg = max(estimatedWeightKg, minKg ?? 0)` untuk `PER_KG` |
| A6 | Ship SO tanpa armada | Tetap diizinkan (backward compatible). Assign tarif belakangan via jadwal / edit DO. Enrich ship dialog = Fase 3 opsional |
| A7 | Subtotal SO | `goodsSubtotal = SO.totalAmount - (SO.shippingCost ?? 0)`; `newTotal = goodsSubtotal + newShipping` |

---

## Baseline historis (pra-epic — untuk konteks)

> Snapshot **sebelum** implementasi. Status terkini ada di **Status implementasi** di atas.

| Area | Saat plan ditulis | Setelah merge `main` |
|------|-------------------|----------------------|
| `Vehicle` + ownership FACTORY/PRIVATE | ✅ | ✅ unchanged |
| `VehicleTariff` | ✅ | ✅ + multi-rute overlap + resolve by route |
| Create DO manual + PER_KG | ✅ partial | ✅ + rute + totals + sync |
| Assign jadwal | ⚠️ rate only | ✅ totals + sync |
| `SO.shippingCost` → invoice | ✅ manual | ✅ juga diisi dari Σ DO charge (jika tidak locked) |
| Sync DO → SO | ❌ | ✅ |
| Detail DO armada/tarif | ❌ | ✅ + edit dialog |
| Report armada | ✅ | ✅ + per rute |
| Auto-journal ongkir terpisah | ❌ | ❌ masih deferred (Appendix A) |
| `ShippingRoute` master | ❌ | ❌ out of scope |

### File indeks (referensi cepat — masih valid)

| Concern | Path |
|---------|------|
| Schema DO / Vehicle / Tariff | `prisma/schema.prisma` |
| SO shipping | `src/services/sales/orders-service.ts` |
| Ship → auto DO + draft invoice | `src/services/sales/fulfillment-service.ts` |
| Manual DO | `src/actions/inventory/deliveries.ts` |
| Schedule assign | `src/actions/sales/delivery-schedules.ts` |
| Tariff CRUD | `src/actions/sales/vehicle-tariffs.ts` |
| Invoice create/draft | `src/services/finance/invoice-lifecycle-service.ts` |
| Auto journal invoice | `src/services/finance/auto-journal-invoice-handlers.ts` |
| Shipping report | `src/actions/sales/shipping-reports.ts` |
| Zod sales | `src/lib/schemas/sales.ts` |

---

## Target architecture

```
VehicleTariff[]
  (multi aktif: beda routeName OK; same routeName + overlap date → TOLAK)
        │
        ▼
resolveActiveTariff(vehicleId, routeName?, asOf)
  1) exact routeName (trim, case-insensitive)
  2) fallback routeName null/empty = "Semua Rute"
  3) null
        │
        ▼
computeDeliveryTotals({ rateType, costRate, chargeRate, weightKg, minKg })
        │
        ├── DeliveryOrder snapshot:
        │     vehicleId, appliedRateType, appliedCostRate, appliedChargeRate,
        │     appliedRouteName, totalCost, totalCharge, estimatedWeightKg
        │
        └── syncSalesOrderShippingFromDeliveries(salesOrderId)
              ├── sum totalCharge (status ≠ CANCELLED)
              ├── SO.shippingCost + SO.totalAmount
              └── if DRAFT invoice → invoice.totalAmount
                  if locked invoice → skip + warning (DO tetap simpan charge)
```

---

## Phase 0: Pure pricing helpers (fondasi)

### Task 0.1 — `delivery-pricing.ts` + unit tests

**Objective:** Semua kalkulasi tarif di satu tempat, testable tanpa Prisma.

**Files:**
- Create: `src/lib/sales/delivery-pricing.ts`
- Create: `src/lib/sales/__tests__/delivery-pricing.test.ts`

**API:**

```ts
/** null / "" / whitespace → null (artinya "Semua Rute") */
export function normalizeRouteKey(routeName?: string | null): string | null

/**
 * Bandingkan dua route untuk match exact.
 * normalize(a) === normalize(b); null cocok dengan null.
 */
export function routesMatch(a?: string | null, b?: string | null): boolean

export type RateTypeInput = 'PER_KG' | 'FLAT_RATE';

export function computeDeliveryTotals(input: {
  rateType: RateTypeInput;
  costRate: number;
  chargeRate: number;
  weightKg?: number | null;
  minKg?: number | null;
}): {
  totalCost: number;
  totalCharge: number;
  billableKg: number | null;
}

/** DO eligible untuk sum tagihan customer */
export function isBillableDeliveryStatus(status: string): boolean
// default: status !== 'CANCELLED'

export function sumBillableCharges(
  deliveries: Array<{ status: string; totalCharge: number | null | undefined }>
): number
```

**Rules calc:**

| rateType | totalCost | totalCharge | billableKg |
|----------|-----------|-------------|------------|
| `FLAT_RATE` | `costRate` | `chargeRate` | `null` |
| `PER_KG` + weight/min > 0 | `billableKg * costRate` | `billableKg * chargeRate` | `max(weightKg ?? 0, minKg ?? 0)` |
| `PER_KG` + weight 0/null dan min 0/null | `0` | `0` | `0` atau `null` — **pilih `0`** agar sum stabil |

Round ke 2 desimal (atau integer rupiah konsisten project — ikuti pola `Number(decimal)` existing; prefer **Math.round** ke integer IDR jika project selalu integer).

**Verify:**
```bash
npm run test -- src/lib/sales/__tests__/delivery-pricing.test.ts
```

**Commit:** `feat(delivery): add pure delivery pricing helpers`

---

## Phase 1: Multi-route tariff (Opsi A)

### Task 1.1 — Schema: `appliedRouteName` di DeliveryOrder

**Objective:** Snapshot rute yang dipakai saat apply tarif (audit + report).

**Files:**
- Modify: `prisma/schema.prisma` — model `DeliveryOrder`
- Create: `prisma/migrations/20260710_delivery_applied_route_name/migration.sql`

```prisma
// DeliveryOrder — tambah:
appliedRouteName  String?
```

```sql
ALTER TABLE "DeliveryOrder" ADD COLUMN IF NOT EXISTS "appliedRouteName" TEXT;
```

**Verify:** `npx prisma generate`; migrate deploy path tenant-first sesuai runbook.

**Commit:** `feat(schema): add DeliveryOrder.appliedRouteName`

---

### Task 1.2 — Overlap check per (vehicle, route)

**Objective:** Satu kendaraan boleh banyak tarif aktif **beda rute**; dilarang overlap tanggal **pada rute yang sama**.

**Files:**
- Modify: `src/actions/sales/vehicle-tariffs.ts` — `createVehicleTariff`, `updateVehicleTariff`

**Logic overlap (pseudo):**

```ts
const routeKey = normalizeRouteKey(data.routeName); // null = ALL

const overlapping = await prisma.vehicleTariff.findFirst({
  where: {
    vehicleId,
    id: { not: selfId }, // update only
    // route equality: both null OR both equal (case-insensitive)
    // Implement via: fetch candidates by vehicle + date overlap, filter in JS
    // OR raw query; Prisma case-insensitive: mode: 'insensitive' if supported
    AND: [ /* date overlap same as today */ ],
  },
});
// After fetch: filter routesMatch(t.routeName, data.routeName)
```

**Pesan error (ID):**  
`Sudah ada tarif untuk rute "X" pada periode yang tumpang tindih (sejak …).`

**Verify:** unit test action/service atau extract pure `tariffsOverlap(a,b)` helper.

**Commit:** `fix(delivery): allow multi-route vehicle tariffs without date overlap`

---

### Task 1.3 — `getActiveTariff(vehicleId, routeName?)` + list routes

**Objective:** Resolusi tarif memperhatikan rute.

**Files:**
- Modify: `src/actions/sales/vehicle-tariffs.ts`
- Modify: `src/lib/schemas/sales.ts` jika perlu input types

**Signature:**

```ts
getActiveTariff(vehicleId: string, routeName?: string | null)
listVehicleRouteOptions(vehicleId: string)
// → string[] distinct route names (non-null) + optional sentinel handled in UI
```

**Prioritas:**

1. Exact match `routeName` (normalized) + `validFrom <= now` + (`validUntil` null atau `>= now`), order `validFrom desc`, take 1.  
2. Else tariff `routeName` null/empty (“Semua Rute”) + valid, same order.  
3. Else `null`.

**UI copy:** di dialog tarif, helper text:  
*“Tarif boleh berbeda per rute. Periode tidak boleh tumpang tindih untuk rute yang sama.”*

**Commit:** `feat(delivery): resolve active tariff by route name`

---

### Task 1.4 — Zod + action `updateDeliveryPricing`

**Objective:** Edit armada/rute/berat/rate/total setelah DO dibuat (karena assign/ship sering tanpa angka lengkap).

**Files:**
- Modify: `src/lib/schemas/sales.ts`
- Modify: `src/actions/inventory/deliveries.ts`

```ts
export const updateDeliveryPricingSchema = z.object({
  deliveryOrderId: z.string().min(1),
  vehicleId: z.string().optional().nullable(),
  appliedRouteName: z.string().optional().nullable(),
  appliedRateType: z.enum(['PER_KG', 'FLAT_RATE']).optional().nullable(),
  appliedCostRate: z.coerce.number().min(0).optional().nullable(),
  appliedChargeRate: z.coerce.number().min(0).optional().nullable(),
  estimatedWeightKg: z.coerce.number().min(0).optional().nullable(),
  // totalCost/totalCharge: optional override; if omitted, recompute from rates
  totalCost: z.coerce.number().min(0).optional().nullable(),
  totalCharge: z.coerce.number().min(0).optional().nullable(),
  recomputeFromRates: z.boolean().optional().default(true),
});
```

**Behavior:**
1. Auth + load DO.  
2. Jika `vehicleId` diganti dan rates kosong → auto `getActiveTariff(vehicleId, appliedRouteName)`.  
3. Jika `recomputeFromRates` → `computeDeliveryTotals`.  
4. Update DO fields termasuk `appliedRouteName`.  
5. Call `syncSalesOrderShippingFromDeliveries` (Phase 2 — di Phase 1 boleh stub no-op dulu **atau** implement Phase 2 dulu; **rekomendasi: implement 0+1 dulu, 2 segera setelah 1.5**).

**Guard:** Jangan izinkan edit pricing jika DO `CANCELLED` (opsional: block juga `DELIVERED` — **default: boleh edit sampai invoice locked via sync warning**).

**Commit:** `feat(delivery): add updateDeliveryPricing action`

---

## Phase 2: Wire totals di semua entry point + UI

### Task 2.1 — Create manual DO: rute + calc shared helper

**Files:**
- Modify: `src/components/sales/CreateDeliveryOrderDialog.tsx`
- Modify: `src/actions/inventory/deliveries.ts` (persist `appliedRouteName`; server-side recompute defense-in-depth optional)

**UI flow:**
1. Pilih SO → default alamat + default vehicle (sudah ada).  
2. Pilih vehicle → load `listVehicleRouteOptions` + default route kosong (“Semua Rute”).  
3. Pilih **Rute** (Select + opsi “Semua Rute” + optional free-text “Lainnya”).  
4. `getActiveTariff(vehicleId, routeName)` → fill cost/charge/rateType.  
5. PER_KG: input berat → preview total via `computeDeliveryTotals` (client mirror atau shared import pure).  
6. Submit: kirim rates + totals + `appliedRouteName`.

**Server:** trust client totals **atau** recompute jika rates+weight lengkap (prefer **recompute di server** agar konsisten).

**Commit:** `feat(delivery): route-aware tariff on manual DO create`

---

### Task 2.2 — Assign jadwal: hitung `totalCost` / `totalCharge`

**Files:**
- Modify: `src/actions/sales/delivery-schedules.ts` — `assignOrderToSchedule`

**Replace block “Update DO with vehicle + tariff snapshot”:**

```ts
const tariff = await /* active tariff — need route?
  MVP: use DO.appliedRouteName or null (Semua Rute)
*/;

if (tariff) {
  const weight = doRecord.estimatedWeightKg
    ? Number(doRecord.estimatedWeightKg)
    : null;
  const { totalCost, totalCharge } = computeDeliveryTotals({
    rateType: tariff.rateType,
    costRate: Number(tariff.costRate),
    chargeRate: Number(tariff.chargeRate),
    weightKg: weight,
    minKg: tariff.minKg != null ? Number(tariff.minKg) : null,
  });

  await tx.deliveryOrder.update({
    where: { id: deliveryOrderId },
    data: {
      vehicleId: sv.vehicleId,
      appliedRateType: tariff.rateType,
      appliedCostRate: tariff.costRate,
      appliedChargeRate: tariff.chargeRate,
      appliedRouteName: tariff.routeName ?? doRecord.appliedRouteName ?? null,
      totalCost,
      totalCharge,
    },
  });
} else {
  await tx.deliveryOrder.update({
    where: { id: deliveryOrderId },
    data: { vehicleId: sv.vehicleId },
  });
}
// then sync SO (Phase 3 service)
```

**UX Schedule detail (opsional di task ini):**  
Jika PER_KG dan DO tanpa berat, tampilkan toast: *“Berat belum diisi — total charge 0. Isi berat di detail surat jalan.”*

**Optional extension (same task atau follow-up):**  
`assignOrderToSchedule(scheduleVehicleId, deliveryOrderId, opts?: { routeName?, weightKg? })` agar operator bisa isi saat assign.

**Commit:** `feat(delivery): compute cost/charge when assigning DO to schedule`

---

### Task 2.3 — UI: card Armada & Tarif di `DeliveryOrderDetail`

**Files:**
- Modify: `src/components/sales/DeliveryOrderDetail.tsx`
- Create (opsional): `src/components/sales/DeliveryPricingCard.tsx`
- Create: `src/components/sales/EditDeliveryPricingDialog.tsx`

**Card content:**

| Field | Sumber |
|-------|--------|
| Kendaraan | `order.vehicle.plateNumber` + name |
| Kepemilikan | FACTORY → Pabrik / PRIVATE → Perorangan |
| Sopir | `vehicle.driverName` |
| Rute | `appliedRouteName` \|\| “Semua Rute” |
| Tipe tarif | PER_KG / FLAT |
| Biaya ops / rate | `appliedCostRate` |
| Charge customer / rate | `appliedChargeRate` |
| Est. berat | `estimatedWeightKg` |
| **Total biaya ops** | `totalCost` |
| **Total charge** | `totalCharge` |
| Sync badge | dari last sync result / derived: compare SO.shippingCost vs sum (optional Phase 3) |

**Actions:**
- Tombol **Edit Tarif & Berat** → `EditDeliveryPricingDialog` → `updateDeliveryPricing`
- Pastikan page loader include `vehicle` relation (`getDeliveryOrder` / page query)

**Files query:**
- `src/app/sales/deliveries/[id]/page.tsx` + action get DO — tambah `include: { vehicle: true, salesOrder: { select: { shippingCost, totalAmount, orderNumber, invoices? } } }`

**Commit:** `feat(delivery): show fleet pricing card on delivery detail`

---

### Task 2.4 — Labels & empty states

**Files:**
- Modify: `src/lib/labels/sales.ts` (jika perlu label rute, charge, sync)

Labels usulan:
- `appliedRoute`: “Rute”
- `totalOpsCost`: “Biaya Operasional”
- `totalCustomerCharge`: “Charge Customer”
- `shippingFromFleet`: “Ongkir dari armada”

**Commit:** `chore(labels): delivery pricing labels`

---

## Phase 3: Sync DO → SO (sumber kebenaran tagihan)

### Task 3.1 — Service `syncSalesOrderShippingFromDeliveries`

**Objective:** Single source of truth untuk update ongkir SO dari DO.

**Files:**
- Create: `src/services/sales/delivery-shipping-sync.ts`
- Create: `src/services/sales/__tests__/delivery-shipping-sync.test.ts`

**Signature:**

```ts
export type ShippingSyncResult = {
  shippingCost: number;
  goodsSubtotal: number;
  totalAmount: number;
  synced: boolean;
  reason: 'OK' | 'INVOICE_LOCKED' | 'SO_CANCELLED' | 'NO_CHANGE';
  invoiceUpdated: boolean;
  billableDeliveryCount: number;
};

export async function syncSalesOrderShippingFromDeliveries(
  salesOrderId: string,
  opts?: { tx?: Prisma.TransactionClient; userId?: string | null }
): Promise<ShippingSyncResult>
```

**Algorithm:**

```
1. Load SO: id, status, totalAmount, shippingCost, orderNumber
2. If status === CANCELLED → return SO_CANCELLED, synced=false
3. Load all DOs for SO: status, totalCharge
4. shippingCost = sumBillableCharges(DOs)
5. goodsSubtotal = Number(totalAmount) - Number(shippingCost ?? 0)
   // Guard: if goodsSubtotal < 0, fallback recompute from items (optional Task 3.1b)
6. newTotal = goodsSubtotal + shippingCost
7. Load invoices for SO where status not CANCELLED
8. If any invoice status in LOCKED_SET {UNPAID, PARTIAL, PAID, OVERDUE}:
     return INVOICE_LOCKED, synced=false (do not write SO)
9. If shippingCost and totalAmount already equal (epsilon 0.01): NO_CHANGE optional still write for consistency
10. Update SO: shippingCost (null if 0), totalAmount = newTotal
11. For each invoice status DRAFT: update totalAmount = newTotal; invoiceUpdated=true
12. logActivity SYNC_SHIPPING_FROM_DELIVERIES if userId
13. return OK
```

**LOCKED_SET:** `UNPAID | PARTIAL | PAID | OVERDUE`  
**Note:** `DRAFT` invoice di Polyflow **sudah** bisa memicu auto-journal hari ini — update `totalAmount` draft **tanpa** re-journal di epic ini (lihat Appendix A). Dokumentasikan di toast: “Invoice draft diupdate; cek jurnal jika sudah terbit.”

**Verify:** unit tests dengan mock Prisma — multi DO, cancel, lock, draft update.

**Commit:** `feat(sales): sync SO shippingCost from delivery charges`

---

### Task 3.2 — Call sites sync

**Panggil sync setelah write DO pricing/status:**

| Call site | File | Kapan |
|-----------|------|--------|
| `createManualDeliveryOrder` | `deliveries.ts` | after create |
| `updateDeliveryPricing` | `deliveries.ts` | after update |
| `assignOrderToSchedule` | `delivery-schedules.ts` | after DO update |
| `updateDeliveryStatus` → `CANCELLED` | `deliveries.ts` | after status change |
| (opsional) `updateDeliveryStatus` → `RETURNED` | same | re-sync (sum policy A2) |
| (opsional) remove order from schedule | jika clear vehicle/rates — **default: jangan clear rates** saat unassign |

**Action return shape:** expose sync warning ke UI:

```ts
return {
  deliveryOrder,
  shippingSync: { synced, reason, shippingCost }
};
```

UI toast:
- `INVOICE_LOCKED`: warning “Charge disimpan di surat jalan, tetapi invoice sudah final — ongkir SO tidak diubah.”
- `OK`: success optional silent atau “Ongkir SO diupdate ke Rp …”

**Commit:** `feat(delivery): call shipping sync from DO write paths`

---

### Task 3.3 — SO form & detail UX

**Files:**
- Modify: `src/components/sales/SalesOrderForm.tsx`
- Modify: `src/components/sales/SalesOrderDetailClient.tsx`
- Possibly: edit page loader to pass `deliveryOrders` summary

**Form:**
- Jika `deliveryOrders.some(d => d.totalCharge != null && d.status !== 'CANCELLED')`:
  - Input `shippingCost` **disabled / readOnly**
  - Helper: “Ongkos kirim diisi otomatis dari surat jalan (total charge armada).”
- Else: free input seperti sekarang (estimasi).

**Detail:**
- Tampilkan ongkir + jika dari armada, list ringkas: `DO-2026-0001 · Rp …`
- Link ke `/sales/deliveries/[id]`

**Commit:** `feat(sales): show fleet-driven shipping cost on sales order UI`

---

### Task 3.4 — Credit limit (soft)

**Files:**
- Modify: `src/services/sales/orders-service.ts` (create/update) — **optional in this epic**
- Atau hanya di sync: log warning jika `newTotal` over credit

**Default plan:** soft log di sync; **tidak block** delivery.  
Follow-up: `checkCreditLimit` harus include shipping (bug existing: check sebelum +shipping).

**Commit (jika dikerjakan):** `fix(sales): include shipping in credit check` — boleh PR terpisah.

---

## Phase 4: Report, ship path, hardening

### Task 4.1 — Shipping report: kolom & filter rute

**Files:**
- Modify: `src/actions/sales/shipping-reports.ts`
- Modify: `src/components/sales/reports/ShippingCostReportClient.tsx`

**Tambah:**
- Select/map `appliedRouteName`
- Filter `routeName?: string` (contains / exact)
- Optional summary `byRoute: { route, totalCost, totalCharge, margin, count }[]`
- CSV column “Rute”

**Commit:** `feat(delivery): route breakdown on shipping cost report`

---

### Task 4.2 — (Opsional) Enrich `shipOrder` / ShipmentDialog

**Objective:** Operator yang ship langsung dari SO bisa isi armada + rute + berat agar draft invoice langsung benar.

**Files:**
- Modify: `src/components/sales/ShipmentDialog.tsx` (atau setara)
- Modify: `src/lib/schemas/sales.ts` — `shipSalesOrderSchema`
- Modify: `src/services/sales/fulfillment-service.ts` — `shipOrder`

**Urutan kritis di `shipOrder`:**

```
1. Create stock movements + DO
2. Jika vehicle/rates/weight diberikan → set snapshot + compute totals on DO
3. syncSalesOrderShippingFromDeliveries(orderId)  // SEBELUM draft invoice
4. createDraftInvoiceFromOrder(...)  // dapat totalAmount yang sudah include ongkir
5. status SHIPPED + activity log
```

Tanpa vehicle: behavior lama (charge null, shipping SO tetap estimasi manual).

**Commit:** `feat(delivery): optional fleet pricing on ship sales order`

---

### Task 4.3 — Status lists & billable constants

**Files:**
- Modify: `src/lib/sales/delivery-status.ts`

```ts
export const OPEN_DELIVERY_STATUSES = [...] as const;
export const BILLABLE_DELIVERY_STATUSES = /* all except CANCELLED */ 
// or invert: export function isBillableDeliveryStatus
```

Gunakan di vehicle delete guard, sync, report filters.

**Commit:** `refactor(delivery): centralize billable/open delivery statuses`

---

### Task 4.4 — Final verification gate

```bash
npm run lint
npm run test -- delivery-pricing delivery-shipping-sync vehicle-tariff
npm run build
```

**Manual smoke (tenant dev):**

1. **Multi-rute tarif**  
   - 1 vehicle, tarif “Solo–Boyolali” + “Solo–Semarang” overlapping dates → **sukses create keduanya**.  
   - 2 tarif same route overlapping → **error**.

2. **Create DO manual**  
   - SO tanpa ongkir → DO pilih rute PER_KG + 1000 kg → SO.shippingCost = charge.  
   - Cek `totalAmount` SO naik.

3. **Multi DO**  
   - DO kedua charge 50k → SO shipping = sum.

4. **Assign jadwal**  
   - DO tanpa total → assign vehicle ber-tarif FLAT → total terisi → SO update.

5. **Invoice lock**  
   - Buat invoice UNPAID → ubah charge DO → SO **tidak** berubah + toast warning.  
   - Charge di report DO tetap angka baru.

6. **Draft invoice**  
   - Ship order (draft invoice) → assign tarif → SO + draft invoice total update.

7. **Cancel DO**  
   - Cancel satu DO → shipping turun.

8. **Detail DO**  
   - Card armada/tarif terlihat; edit berat recompute.

9. **Report**  
   - Filter rute; CSV ada kolom rute.

10. **Ownership**  
    - Report by Pabrik vs Perorangan masih benar.

---

## Execution order & dependencies

```
Phase 0  delivery-pricing helpers + tests
   │
   ▼
Phase 1  schema appliedRouteName
   │     multi-route overlap + getActiveTariff(route)
   │     updateDeliveryPricing action
   ▼
Phase 2  create DO UI route
   │     assign schedule totals
   │     DeliveryOrderDetail pricing card + edit dialog
   ▼
Phase 3  sync service + tests
   │     call sites
   │     SO form/detail UX
   ▼
Phase 4  report route
         optional ship enrich
         constants + gate
```

**PR batching (disarankan):**

| PR | Isi |
|----|-----|
| PR1 | Phase 0 + 1 (helpers, schema, multi-route tariff) |
| PR2 | Phase 2 (totals wiring + DO UI) |
| PR3 | Phase 3 (sync SO + UX) |
| PR4 | Phase 4 (report + optional ship + harden) |

Atau sequential commits di branch feature sesuai habit repo.

---

## Definition of Done

### Phase 0–1
- [x] Helper calc pure + tests hijau  
- [x] Multi-tarif beda rute diizinkan; same route overlap ditolak  
- [x] `getActiveTariff` exact → fallback ALL → null  
- [x] `appliedRouteName` di schema + generate client  

### Phase 2
- [x] Create DO: pilih rute, total benar (PER_KG + FLAT + minKg)  
- [x] Assign jadwal mengisi `totalCost`/`totalCharge`  
- [x] Detail DO menampilkan armada + tarif + total + edit  

### Phase 3
- [x] `Σ totalCharge` → `SO.shippingCost` + `totalAmount`  
- [x] Invoice DRAFT ikut; UNPAID+ locked  
- [x] Cancel DO re-sum  
- [x] Form SO read-only ongkir saat driven by fleet  
- [x] Warning jelas saat lock (toast di edit pricing; sync return `INVOICE_LOCKED`)  

### Phase 4
- [x] Report kolom/filter rute  
- [ ] (Opsional) ship + vehicle sync sebelum draft invoice — **deferred 4.2**  
- [x] lint + test + build pass  
- [ ] Smoke checklist manual di tenant live — **ops post-merge**  

### Explicitly NOT done in this epic (masih open)
- [ ] Auto-journal split shipping revenue  
- [ ] Auto-journal `totalCost` → shipping-expense  
- [ ] Model `ShippingRoute`  
- [ ] Partial shipment qty multi-DO yang benar secara inventory  
- [ ] Credit limit soft (3.4)  
- [ ] Ship path fleet enrich (4.2)  

---

## Risks & mitigations

| Risk | Severity | Status setelah merge |
|------|----------|----------------------|
| `goodsSubtotal = totalAmount - shipping` salah di data legacy | Med | Masih relevan — guard negative belum di-code; monitor |
| Draft invoice journal stale setelah sync total | Med | Tetap deferred (Appendix A); data SO/invoice amount sinkron, GL bisa stale |
| Double ongkir (manual SO + DO) | Med | **Mitigated** — SO form read-only saat fleet-driven |
| PER_KG assign tanpa berat → charge 0 | Low | Masih mungkin; operator edit di detail DO |
| Multi-DO duplicate lines (existing) | Med | Unchanged; prefer 1 DO/SO |
| Race concurrent DO edits | Low | Last-write-wins; sync idempotent |
| Tenant migration `appliedRouteName` | **High ops** | **Action required** di semua tenant DB |
| Credit limit understate | Low | 3.4 deferred; existing `checkCreditLimit` masih pre-shipping di create SO |

---

## Out of scope

| Item | Alasan |
|------|--------|
| Model `ShippingRoute` (Opsi B/C) | User pilih Opsi A; appendix future |
| GPS / driver mobile app | N/A |
| Partial delivery per item | Epic terpisah |
| Actual vs estimated weight (timbang) | MVP estimasi |
| Journal GL shipping revenue/expense | Desain Appendix A only |
| Reopen/correct PAID invoice for ongkir | Manual finance process |
| Purchase order shipping | Domain berbeda |

---

## Appendix A — Desain akuntansi (implementasi belakangan)

### A.1 Keadaan sekarang (post-merge delivery shipping)

| Event | Perilaku |
|-------|----------|
| SO + `shippingCost` | Bisa diisi manual **atau** di-sync dari Σ DO `totalCharge` |
| Invoice create / draft | `totalAmount` copy dari SO; AR journal; DRAFT ikut diupdate saat sync |
| Revenue split | **Tidak ada** — ongkir masih terserap ke akun revenue produk (scaling) |
| DO `totalCost` / `totalCharge` | Ops report + source of truth charge; **belum** journal otomatis |
| Role `shipping-expense` | Manual quick entry `expense-transport` |
| Draft invoice | `createDraftInvoiceFromOrder` **sudah** call `handleSalesInvoiceCreated` (GL bisa stale jika total berubah lewat sync) |

### A.2 Target masa depan (phase terpisah)

| # | Work item | Detail |
|---|-----------|--------|
| A2.1 | Role `shipping-revenue` | Map COA “Pendapatan Ongkir” per tenant |
| A2.2 | Split journal invoice | Credit: product revenue (goods subtotal) + shipping revenue (`SO.shippingCost`); Debit AR = total |
| A2.3 | Journal policy | **Jangan** post journal pada invoice `DRAFT`; post saat promote ke `UNPAID` |
| A2.4 | Optional ops cost | On DO `DELIVERED` + `totalCost > 0`: Dr shipping-expense / Cr AP or clearing — **hanya jika** bisnis akui biaya pasti |
| A2.5 | Repair | Script/manual fix draft journals yang total-nya berubah di Phase 3 epic ini |

### A.3 Interface yang disiapkan epic ini (tanpa journal code)

- Snapshot lengkap di DO (`totalCost`, `totalCharge`, rates, `appliedRouteName`)  
- `SO.shippingCost` sinkron = amount “shipping revenue” nanti  
- Report margin = ops KPI, bukan GL  

### A.4 Estimasi phase accounting

~1.5–3 hari setelah COA role + keputusan pajak ongkir (PPN ya/tidak) dikunci finance.

---

## Appendix B — Future: ShippingRoute master (Opsi B)

Trigger: butuh rute **shared** antar armada, kode rute stabil, report standar per corridor.

```
ShippingRoute { id, code, name, origin, destination, isActive }
VehicleTariff.shippingRouteId?  // ganti/ damp routeName
DeliveryOrder.shippingRouteId?
```

Migrasi: seed dari distinct `routeName` strings → map FK.  
Tidak dikerjakan di epic ini.

---

## Appendix C — Pseudocode sync (referensi implementasi)

```ts
const LOCKED: InvoiceStatus[] = ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE'];

async function syncSalesOrderShippingFromDeliveries(salesOrderId: string, opts?) {
  const db = opts?.tx ?? prisma;
  const so = await db.salesOrder.findUniqueOrThrow({ where: { id: salesOrderId } });
  if (so.status === 'CANCELLED') {
    return { synced: false, reason: 'SO_CANCELLED', ... };
  }

  const dos = await db.deliveryOrder.findMany({
    where: { salesOrderId },
    select: { status: true, totalCharge: true },
  });
  const shippingCost = sumBillableCharges(
    dos.map((d) => ({ status: d.status, totalCharge: d.totalCharge ? Number(d.totalCharge) : 0 }))
  );

  const oldShip = so.shippingCost ? Number(so.shippingCost) : 0;
  const goodsSubtotal = Number(so.totalAmount) - oldShip;
  const totalAmount = goodsSubtotal + shippingCost;

  const invoices = await db.invoice.findMany({
    where: { salesOrderId, status: { not: 'CANCELLED' } },
  });
  if (invoices.some((i) => LOCKED.includes(i.status))) {
    return {
      synced: false,
      reason: 'INVOICE_LOCKED',
      shippingCost,
      goodsSubtotal,
      totalAmount,
      invoiceUpdated: false,
      billableDeliveryCount: dos.filter((d) => isBillableDeliveryStatus(d.status)).length,
    };
  }

  await db.salesOrder.update({
    where: { id: salesOrderId },
    data: {
      shippingCost: shippingCost > 0 ? shippingCost : null,
      totalAmount,
    },
  });

  let invoiceUpdated = false;
  for (const inv of invoices.filter((i) => i.status === 'DRAFT')) {
    await db.invoice.update({
      where: { id: inv.id },
      data: { totalAmount },
    });
    invoiceUpdated = true;
  }

  if (opts?.userId) {
    await logActivity({
      userId: opts.userId,
      action: 'SYNC_SHIPPING_FROM_DELIVERIES',
      entityType: 'SalesOrder',
      entityId: salesOrderId,
      details: `shippingCost=${shippingCost} totalAmount=${totalAmount}`,
    });
  }

  return {
    synced: true,
    reason: 'OK',
    shippingCost,
    goodsSubtotal,
    totalAmount,
    invoiceUpdated,
    billableDeliveryCount: dos.filter((d) => isBillableDeliveryStatus(d.status)).length,
  };
}
```

---

## Appendix D — File checklist lengkap

### Baru
- [x] `src/lib/sales/delivery-pricing.ts`
- [x] `src/lib/sales/__tests__/delivery-pricing.test.ts`
- [x] `src/services/sales/delivery-shipping-sync.ts`
- [x] `src/services/sales/__tests__/delivery-shipping-sync.test.ts`
- [ ] `src/components/sales/DeliveryPricingCard.tsx` (opsional extract — **tidak dibuat**; card inline di detail)
- [x] `src/components/sales/EditDeliveryPricingDialog.tsx`
- [x] `prisma/migrations/20260710_delivery_applied_route_name/migration.sql`

### Ubah
- [x] `prisma/schema.prisma`
- [x] `src/lib/schemas/sales.ts`
- [x] `src/actions/sales/vehicle-tariffs.ts`
- [x] `src/actions/inventory/deliveries.ts`
- [x] `src/actions/sales/delivery-schedules.ts`
- [x] `src/actions/sales/shipping-reports.ts`
- [x] `src/components/sales/CreateDeliveryOrderDialog.tsx`
- [x] `src/components/sales/DeliveryOrderDetail.tsx`
- [x] `src/components/sales/SalesOrderForm.tsx`
- [x] `src/components/sales/SalesOrderDetailClient.tsx`
- [x] `src/components/sales/reports/ShippingCostReportClient.tsx`
- [ ] `src/components/sales/schedules/ScheduleDetailClient.tsx` (toast berat — partial/opsional)
- [x] `src/lib/sales/delivery-status.ts`
- [x] `src/lib/labels/sales.ts`
- [x] `src/app/sales/orders/[id]/edit/page.tsx` (`deliveryOrders` di initialData)
- [x] get DO by id include vehicle (di `deliveries.ts`)
- [ ] `src/services/sales/fulfillment-service.ts` (Task 4.2 — deferred)
- [ ] `src/components/sales/ShipmentDialog.tsx` (Task 4.2 — deferred)

---

## Appendix E — Estimasi per task

| Task | Effort (plan) | Outcome |
|------|---------------|---------|
| 0.1 helpers + tests | 0.25–0.5 d | ✅ |
| 1.1 schema | 0.1 d | ✅ |
| 1.2–1.3 multi-route + resolve | 0.5–0.75 d | ✅ |
| 1.4 updateDeliveryPricing | 0.25–0.5 d | ✅ |
| 2.1 create DO UI | 0.5 d | ✅ |
| 2.2 assign schedule totals | 0.25–0.5 d | ✅ |
| 2.3–2.4 detail UI + labels | 0.5–0.75 d | ✅ |
| 3.1–3.2 sync service + call sites | 0.75–1 d | ✅ |
| 3.3 SO UX | 0.25–0.5 d | ✅ |
| 4.1 report | 0.25–0.5 d | ✅ |
| 4.2 ship enrich (opsional) | 0.5–1 d | ⏭️ deferred |
| 4.3–4.4 harden + gate | 0.25 d | ✅ |
| Accounting phase (App A) | +1.5–3 d | ⏭️ deferred |
| Credit soft (3.4) | small | ⏭️ deferred |

---

## Appendix F — Open questions (resolved vs open)

| # | Question | Keputusan / status |
|---|----------|-------------------|
| 1 | RETURNED exclude dari sum? | **Include** (policy A2) — shipped |
| 2 | Ship dialog enrich masuk MVP? | **Tidak** — deferred 4.2 |
| 3 | Edit pricing setelah DELIVERED? | **Boleh** sampai invoice locked — shipped |
| 4 | Unassign jadwal clear vehicle/rates? | **Tidak clear** snapshot — shipped |
| 5 | PPN atas ongkir? | **Open** — accounting phase |
| 6 | Credit soft di sync? | **Deferred** 3.4 |

---

## Riwayat

| Tanggal | Catatan |
|---------|---------|
| 2026-07-10 | Plan dibuat setelah review modul pengiriman existing + keputusan produk user (DO→SO, sync immediate, Opsi A rute, accounting design-only) |
| 2026-07-10 | Implementasi di `feat/delivery-shipping-integration` (20 commits): Phase 0–4.1 + 4.3–4.4; defer 3.4 credit soft + 4.2 ship enrich |
| 2026-07-10 | Review: blocker edit SO `deliveryOrders` + billable helper + tsc/lint polish — fixed before merge |
| 2026-07-10 | **Merged to `main`** via `c430344`. Gate: lint 0, tsc 0, vitest 1109, build ✅ |
| 2026-07-10 | Plan diharmonisasi: status post-merge, DoD dicentang, file checklist, follow-up/ops migration dicatat |
