# Rencana: UX Transfer Material — Sumber vs Tujuan & Multi-Sumber

> **Status:** ✅ Implemented 2026-07-20 (TAHAP 0–2) — commit pending  
> **Date:** 2026-07-20  
> **Plan path:** `docs/plans/2026-07-20-batch-transfer-source-destination-ux.md`  
> **Komponen:** `BatchIssueMaterialDialog`, create SPK form, quick create, `resolve-location`  
> **Surface:** Warehouse + Production  
> **Tenant context:** Melindo (repro) + Kiyowo (slug kanonik)

**Goal:**  
User gudang/produksi paham **asal → tujuan** transfer staging tanpa salah sangka dropdown per baris sebagai tujuan, sambil tetap mendukung **multi-sumber** (material dari gudang berbeda dalam satu dialog).

**Principle (satu kalimat):**

> **Satu kontrol sumber utama** di atas; override per material **tersembunyi sampai dibutuhkan**; tujuan selalu **lokasi WO** (read-only, eksplisit).

---

## 1. Context / Problem

### 1.1 Incident / repro (Melindo)

| Fakta | Detail |
|-------|--------|
| WO | `WO-MRQ18Z6M7R4DM…` (Extruder KW 3, `IN_PROGRESS`) |
| Dialog | **Transfer Material ke Staging/Produksi** |
| Toast error | *Lokasi asal dan tujuan harus berbeda untuk transfer.* |
| Log `polyflow-app` | **Tidak ada error server** — validasi **client-side** sebelum `transferStockBulk` |
| Sumber UI | Label **Lokasi Sumber** = `Gudang Bahan Baku` |
| Tujuan aktual | `order.location.name` = juga **Gudang Bahan Baku** (hanya di teks kuning) |
| Warning UI | *Target kemungkinan Gudang. Pastikan Pesanan diatur ke Lokasi Produksi.* |
| Dropdown per baris | Label **Direncanakan** + gudang (user sangka **tujuan**; kode = **override sumber**) |

### 1.2 Kenapa user bingung

| Yang dilihat user | Asumsi wajar | Realita kode |
|-------------------|--------------|--------------|
| **Lokasi Sumber** (atas) | Asal stok | Benar — `selectedLocation` |
| Kotak kuning “DIPINDAHKAN ke …” | Info opsional | **Satu-satunya penunjuk tujuan** = `order.location` |
| Dropdown di bawah **DIRENCANAKAN** | Gudang **tujuan** per material | **Override sumber** (`sourceLocationId`) |
| **Lokasi Default** | ??? | Ikut sumber global (`selectedLocation`) |

Dua kontrol sumber selalu tampil (atas + per baris) → redundant untuk kasus 1 sumber, samar untuk multi-sumber.

### 1.3 Logic transfer (sudah ada — jangan diubah semantik)

File: `src/components/production/order-detail/BatchIssueMaterialDialog.tsx`

| Aspek | Perilaku |
|-------|----------|
| Mode transfer | `MIXER` / category `MIXING` \| `EXTRUSION` \| `PACKING` \| `REWORK` / nama BOM contain `adonan` |
| Default sumber | Category-aware (RM / Mixing / FG, dll.) |
| Tujuan | **Selalu** `order.location.id` (bukan dipilih di dialog) |
| Multi-sumber | Group `item.sourceLocationId \|\| selectedLocation` → `Promise.all(transferStockBulk…)` per sumber |
| Validasi | Setiap sumber aktual **harus ≠** `order.location.id` |
| Backend | `transferStockBulk` di inventory actions |

**Kesimpulan:** multi-sumber **sudah di-handle** di submit. Masalah utama = **UX / labeling**, plus data WO yang lokasinya gudang (bukan staging/produksi).

---

## 2. Product decisions (locked)

| # | Keputusan | Alasan |
|---|-----------|--------|
| **D1** | Tujuan transfer = **lokasi WO** (`order.location`), read-only di dialog | Konsisten backflush / staging; satu truth |
| **D2** | **Satu sumber utama** (dropdown global) sebagai default semua baris | Kasus 95%: semua material dari 1 gudang |
| **D3** | Override per material **didukung**, tapi **tidak selalu tampil** | Multi-sumber tanpa clutter |
| **D4** | Jangan hapus multi-sumber dari logic | Kebutuhan nyata (RM + WIP dalam satu batch) |
| **D5** | Jika asal = tujuan → error jelas + disable submit; arahkan perbaiki **sumber** atau **lokasi WO** | Bukan silent fail; bukan log server |
| **D6** | Peringatan jika nama tujuan tidak “production/staging/produksi” | WO salah assign ke gudang (akar incident Melindo) |
| **D7** | Non-plan di Extrusi/Packing tetap diblok di path transfer (pakai ad-hoc issue) | Align plan ad-hoc pelembab |

**Non-goals (plan ini):**

- Auto-koreksi `order.location` dari mesin saat dialog buka  
- Ubah skema Prisma / movement type  
- Redesain full warehouse queue  
- Migrasi data lokasi WO historis  

*(Follow-up terpisah: pastikan create/release WO Extrusi mengisi `locationId` = lokasi mesin/staging, bukan RM.)*

---

## 3. Target UX

### 3.1 Default (satu sumber)

```
┌─────────────────────────────────────────────────────────┐
│  Lokasi Sumber (Asal)     →     Lokasi Tujuan           │
│  [Gudang Bahan Baku  ▾]         [Staging Extruder …]    │
│                                 (Dari lokasi pesanan WO)│
│  [opsional banner asal=tujuan / target gudang]          │
│  hint: stok dikonsumsi saat backflush output            │
├─────────────────────────────────────────────────────────┤
│  Material              Jumlah Transfer                  │
│  PP Karung · DIRENCANAKAN     [171,5] KG                │
│  PP Sablon · DIRENCANAKAN     [171,5] KG                │
│  …                                                      │
│  [ ⚙ Sumber beda per material ]  ← collapsible / toggle │
└─────────────────────────────────────────────────────────┘
```

- **Tidak** ada dropdown “Lokasi Default” di tiap baris saat toggle off.  
- Semua baris pakai sumber global.

### 3.2 Multi-sumber (toggle on)

```
│  PP Karung · DIRENCANAKAN
│    Asal stok: [Gudang Bahan Baku ▾]   Ke: Staging Extruder
│  Compound X · DIRENCANAKAN
│    Asal stok: [Gudang WIP ▾]          Ke: Staging Extruder
```

- Default nilai override = sumber global (saat toggle dinyalakan).  
- Submit tetap group per `sourceLocationId`.

### 3.3 Copy / labels (sumber truth)

File labels: `src/lib/labels/production-components.ts`

| Key | Arah teks |
|-----|-----------|
| `sourceLocation` | Lokasi Sumber (Asal) |
| `destinationLocation` | Lokasi Tujuan |
| `destinationFromOrder` | Dari lokasi pesanan (WO) |
| `sourcePerItem` | Asal stok |
| `toDestination` | Ke |
| `useGlobalSource` | Ikuti lokasi sumber di atas |
| `sourceDestinationSame` | Sumber & tujuan sama — ganti sumber atau setel lokasi WO ke produksi/staging |
| `enablePerItemSource` | Sumber beda per material *(baru)* |
| `disablePerItemSource` | Pakai satu sumber untuk semua *(baru)* |

---

## 4. Tahapan implementasi

### TAHAP 0 — Shipped (2026-07-20) ✅

Commit: `d354f704` — *fix(warehouse): clarify transfer source vs destination in batch material dialog*

Sudah:

- Layout **Asal → Tujuan** (tujuan read-only dari `order.location`)
- Banner merah jika sumber global = tujuan
- Label per baris **Asal stok:** + **Ke: {tujuan}**
- Validasi multi-sumber berbasis sumber **aktual** (bukan hanya global)
- Disable tombol submit jika ada baris asal = tujuan
- Hint “produksi” case-insensitive (+ `produksi`)

**Belum:** collapse override per baris (masih selalu tampil) → TAHAP 1.

### TAHAP 1 — Collapse multi-sumber ✅

**Scope file:**

- `src/components/production/order-detail/BatchIssueMaterialDialog.tsx`
- `src/lib/labels/production-components.ts`

**Perilaku:**

1. State `perItemSourceEnabled` default `false`.
2. Saat `false`: jangan render Select per baris; semua transfer pakai `selectedLocation` (abaikan `sourceLocationId` di UI; optional clear override saat toggle off untuk hindari “stale override”).
3. Saat `true`: tampilkan Select per baris seperti sekarang; prefill dari `selectedLocation`.
4. Toggle copy: *Sumber beda per material* / *Pakai satu sumber untuk semua*.
5. Saat toggle off: set semua `sourceLocationId` → `undefined` (kembali ke default global).

**Acceptance:**

| # | Kriteria |
|---|----------|
| A1 | Buka dialog transfer: **hanya** satu dropdown sumber + tujuan read-only; **tidak** ada “Lokasi Default” per baris |
| A2 | Aktifkan multi-sumber → pilih 2 gudang beda → submit → 2 bulk transfer (atau 2 movement group) ke `order.location` |
| A3 | Nonaktifkan multi-sumber lagi → semua ikut sumber atas; submit 1 group |
| A4 | Asal = tujuan → banner + submit disabled + toast jelas |
| A5 | Mode non-transfer (issue biasa) tidak rusak |
| A6 | Lint + vitest + build hijau |

**Effort:** S. **Risiko:** Rendah (UI state only; semantik transfer sama).

### TAHAP 2 — Default Output Location SPK salah di Melindo ✅

> **Ditemukan:** 2026-07-20 via `WO-260720-001` (DB `melindo_rafia` di VPS).  
> Ini akar mengapa transfer dialog bilang tujuan = **Gudang Bahan Baku**.

#### 2.1 Bukti DB (`melindo_rafia`)

```
WO-260720-001 | WAITING_MATERIAL | MIXING | Machine: Mixing 1
locationId → Gudang Bahan Baku (slug: gudang-bahan-baku, purpose: RAW_MATERIAL)
machine.locationId → [NONAKTIF] Gudang Utama (inactive-gudang-utama)
```

Distribusi `ProductionOrder.location` Melindo:

| Location | slug | count |
|----------|------|------:|
| [NONAKTIF] Gudang Utama | inactive-gudang-utama | 83 |
| Gudang Bahan Baku | gudang-bahan-baku | 5 |

#### 2.2 Slug mismatch (akar)

Kode resolve lokasi pakai **slug kanonik** `WAREHOUSE_SLUGS`:

| Role | Expected slug (code) | Melindo actual slug | Melindo `locationPurpose` |
|------|----------------------|---------------------|---------------------------|
| RM | `rm_warehouse` | `gudang-bahan-baku` | `RAW_MATERIAL` |
| Mixing / staging | `mixing_area` | **tidak ada** | (tidak ada purpose MIXING) |
| WIP | `wip_storage` | `gudang-wip-intermediate` | `WIP` |
| FG | `fg_warehouse` | `gudang-barang-jadi` | `FINISHED_GOOD` |
| Packing | `packing_area` | **tidak ada** (ada `gudang-packaging` purpose PACKING) | `PACKING` |
| Scrap | `scrap_warehouse` | `gudang-scrap` | `SCRAP` |

**Kiyowo** pakai slug seed kanonik (`rm_warehouse`, `mixing_area`, …) → OK.  
**Melindo** pakai slug Indonesia + `locationPurpose` → resolve by slug **gagal**.

#### 2.3 Rantai fallback yang salah

**A. Form create SPK** (`production-order-form.tsx`)

- `resolveOutputLocationId("mixing")` → cari `mixing_area` → **kosong**
- `resolveSourceLocationId("mixing")` → cari `rm_warehouse` → **kosong**
- `locationId` form default = slug MIXING → kosong di Melindo
- Field `locationId` **hidden** — user tidak sadar output salah/kosong

**B. Quick create** (`quickCreateProductionOrder` di `production-orders.ts`)

```ts
outputSlugByCategory: MIXING → mixing_area, EXTRUSION → fg_warehouse, ...
// jika tidak ketemu:
fallback slug "gudang-utama"  // Melindo: tidak ada (hanya inactive-gudang-utama)
// final:
location = findFirst()       // arbitrary → sering gudang-bahan-baku / inactive
```

Fallback ke `RAW_MATERIAL` juga ada di mapping default category kosong:
`WAREHOUSE_SLUGS.RAW_MATERIAL` — yang di Melindo juga **tidak ketemu by slug**.

#### 2.4 Output yang seharusnya (keputusan produk)

| Stage BOM | Output location (tujuan FG/WIP) | Source material (asal) |
|-----------|----------------------------------|-------------------------|
| MIXING | WIP / Mixing area (bukan RM) | RAW_MATERIAL |
| EXTRUSION | FG (atau WIP intermediate per tenant) | WIP / Mixing |
| PACKING | Packing area / FG | FG |
| REWORK | FG | FG |

Melindo: output MIXING yang masuk akal = **`gudang-wip-intermediate`** (`locationPurpose: WIP`), **bukan** Gudang Bahan Baku.

Mesin Mixing 1/2 masih nempel `inactive-gudang-utama` — perlu re-map ke WIP/staging.

#### 2.5 Arah fix (implementation)

1. **Resolver lokasi tenant-aware** (shared helper, dipakai form + quick create + batch transfer defaults):
   - Coba slug kanonik `WAREHOUSE_SLUGS.*`
   - Else map by `locationPurpose` (dan exclude slug `inactive-*` / name `[NONAKTIF]`)
   - Else explicit tenant alias table (opsional)
2. Mapping purpose (usulan):

| Stage need | locationPurpose candidates (priority) |
|------------|----------------------------------------|
| Source MIXING | `RAW_MATERIAL` |
| Output MIXING | `MIXING` → `WIP` |
| Source EXTRUSION | `WIP` → `MIXING` |
| Output EXTRUSION | `FINISHED_GOOD` |
| Source/Output PACKING | `PACKING` / `FINISHED_GOOD` |

3. **Data Melindo (ops one-shot, terpisah deploy code):**
   - (Opsional) alias slug: set slug kanonik **atau** biarkan purpose-based saja
   - Re-assign `Machine.locationId` Mixing/Extruder dari inactive → WIP/FG yang aktif
   - Jangan mass-update 83 WO historis tanpa keputusan bisnis; fokus WO baru + yang masih open

4. **UX create SPK:** tampilkan **Output Location** (bukan hidden) + badge jika fallback / nonaktif.

**Acceptance TAHAP 2:**

| # | Kriteria |
|---|----------|
| B1 | Create SPK MIXING di Melindo → `locationId` = WIP (bukan RM, bukan inactive) |
| B2 | Create SPK EXTRUSION → output FG aktif |
| B3 | Kiyowo (slug kanonik) tidak regresi |
| B4 | Transfer material: sumber default RM, tujuan = WO location (WIP) → asal ≠ tujuan |
| B5 | Quick create + form create pakai resolver yang sama |

**Effort:** M. **Risiko:** Sedang (sentuh create path + multi-tenant location semantics).

---

## 5. Risks & notes

| Risk | Mitigasi |
|------|----------|
| User prod mengandalkan override per baris yang selalu kelihatan | Toggle mudah ditemukan; default 1 sumber tetap 1 klik |
| Partial failure `Promise.all` multi transfer | Existing behavior; out of scope (bisa note di IMPROVEMENTS) |
| Deploy lag: UI lama masih “Lokasi Default” | Redeploy image `polyflow:latest` setelah merge |
| WO tetap di gudang | UX tidak “memperbaiki” stok; hanya jelaskan + block transfer invalid |

---

## 6. Verification checklist

```bash
npx eslint src/components/production/order-detail/BatchIssueMaterialDialog.tsx \
  src/lib/labels/production-components.ts
npm test
npm run build
```

Manual (Melindo staging / local):

1. WO dengan `location` = staging/mesin, sumber RM → transfer OK.  
2. WO dengan `location` = RM, sumber RM → blocked + copy jelas.  
3. Multi-sumber on: 2 lokasi → 2 sumber movement.  
4. Multi-sumber off: 1 sumber.

---

## 7. Status ringkas

| Item | Status |
|------|--------|
| Root cause documented (client validate, tujuan = WO) | ✅ |
| Clarify Asal/Tujuan + validasi multi-sumber | ✅ shipped `d354f704` |
| Collapse per-item source (hilangkan redundant “Lokasi Default”) | ✅ TAHAP 1 |
| Fix assign lokasi WO saat create (resolver slug+purpose) | ✅ TAHAP 2 — `src/lib/locations/resolve-location.ts` |
| Remap mesin Melindo inactive → WIP/FG (data ops) | 📋 ops one-shot (bukan code) |

---

## 8. Referensi kode

| Path | Peran |
|------|--------|
| `src/components/production/order-detail/BatchIssueMaterialDialog.tsx` | Dialog transfer/issue |
| `src/lib/labels/production-components.ts` | Copy ID |
| `src/app/warehouse/WarehouseRefreshWrapper.tsx` | Pemakai dialog di gudang |
| `src/app/production/orders/[id]/components/order-materials-tab.tsx` | Pemakai di production |
| Inventory `transferStockBulk` | Mutasi stok |

---

*Dokumen ini mengunci keputusan produk agar implementasi TAHAP 1 tidak mengulang diskusi “hapus lokasi sumber vs hapus per baris”.*
