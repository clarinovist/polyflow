# Navigation Ownership & Cross-Module Dedup — Full Plan

> **Status:** **SHIPPED (v1 closed)** — 2026-07-10  
> **Date:** 2026-07-10  
> **Closed:** Milestone nav ownership v1 di-merge ke `origin/main` (`1285f5d` … `4fce4ef`).  
> **Follow-up backlog:** [`docs/plans/2026-07-10-navigation-followup-backlog.md`](./2026-07-10-navigation-followup-backlog.md) (Phase 5, 7.2, 8, polish).  
> **Scope (v1):** Information architecture, nav ownership, multi-entry vs multi-copy, route aliases, label consistency.  
> **Non-goal plan ini:** Plugin marketplace, schema migration besar, rewrite permission system, pindah folder `src/services/*` massal.

**Goal:** Hilangkan redundansi navigasi yang membingungkan user (BOM “ada 2”, Surat Jalan “ada 2”, invoice/outgoing yang overlap), tanpa menggandakan CRUD. Satu source of truth per entity; multi-entry boleh; multi-copy page tidak.

**Architecture direction:** Workspace/portal per domain (Sales, Production, Warehouse, Purchasing, Finance, Master Data). Role menentukan default home + subset menu + permission resource. Shared master (BOM, products, machines CRUD, employees) owned once; portal operasional boleh shortcut/alias dengan layout portal masing-masing.

**Related docs:**
- `docs/plans/2026-05-28-navigation-modularity-draft.md` — draft modular nav (prinsip base)
- `docs/ARCHITECTURE.md` — layering app
- `docs/plans/2026-07-09-modul-pengiriman-armada.md` — armada / jadwal / SJ
- `docs/plans/2026-07-10-delivery-module-completion.md` — completion workflow DO
- Access policy: `src/lib/auth/access-policy.ts`
- Permission load: `src/auth.ts`, `src/auth.config.ts`
- RolePermission model: `prisma/schema.prisma`

**Recent commits yang memicu plan ini:**
- Production sidebar link ke BOM (`/dashboard/boms`) di luar workspace production
- Fix access: PRODUCTION boleh cross-workspace lewat `allowedResources` / RolePermission (JWT)
- Fix auth: load RolePermission dari tenant DB, bukan main DB

---

## 1. Problem Statement

### 1.1 Gejala user

1. **BOM terasa “ada 2”**  
   - Entry di **Master Data** (`/dashboard/boms`)  
   - Entry di **Production sidebar** (href yang sama `/dashboard/boms`)  
   - User PRODUCTION yang buka BOM **loncat layout** ke dashboard (sidebar master), bukan tetap di portal produksi.

2. **Surat Jalan terasa “ada 2” di Sales**  
   - Menu yang sama `/sales/deliveries` muncul di group **Transaksi** dan **Pengiriman** (`sales-sidebar.tsx`).  
   - Ini **duplikat nav murni**, bukan dua fitur berbeda.

3. **Overlap mental lintas modul**  
   - Sales: Surat Jalan (Delivery Order)  
   - Warehouse: Barang Keluar (`/warehouse/outgoing`) yang datanya **Sales Order**, bukan DO  
   - Sales invoice vs Finance sales invoice (UI mirip, action/path beda)  
   - Machines master vs machine board, employees vs production resources, costing vs HPP

4. **Akses silang workspace**  
   - Role `PRODUCTION` / `WAREHOUSE` di-isolate ke portalnya.  
   - Resource shared (BOM, products, machines) tinggal di `/dashboard/*` → butuh exception permission.  
   - Exception JWT sudah ada; **UX ownership** belum rapi.

### 1.2 Root cause (bukan “role kurang halaman”)

| Salah paham | Realitas yang diinginkan |
|---|---|
| Setiap role butuh tree halaman penuh sendiri | Role butuh **home + menu kerja**; master data owned sekali |
| Shared resource harus di-copy ke tiap modul | Shared resource: **1 source of truth, multi-entry** |
| Link ke `/dashboard/*` dari portal = selesai | Tanpa alias/layout, user merasa “keluar modul” |

### 1.3 Success criteria

- [ ] Tidak ada **href duplikat** dalam satu sidebar portal.
- [ ] Setiap entity bisnis punya **1 owner workspace** yang tertulis di matrix.
- [ ] Multi-entry (shortcut) **jelas** (label / section “Referensi” / “Master”) dan tidak terasa seperti fitur kembar.
- [ ] Cross-portal resource yang sering dipakai (minimal BOM) bisa dibuka **dengan layout portal pemanggil** (alias route).
- [ ] Label gudang/sales tidak bentrok mental (SJ ≠ antrian fulfill SO).
- [ ] Access Control UI + `canAccessWorkspace` tetap konsisten dengan nav yang ditampilkan.
- [ ] Tidak ada double CRUD page (create/edit master hanya di owner path).

---

## 2. Design Principles

### 2.1 Workspace ≠ Role

```txt
Main sidebar (admin / multi-access)
  = pilih portal / domain

Division sidebar
  = menu kerja harian di domain itu

Role
  = default redirect + permission subset + optional cross-resource

Page actions
  = export, print, duplicate — bukan item sidebar permanen
```

Role yang ada di schema:

| Role | Default home (current) | Portal utama |
|---|---|---|
| `ADMIN` | `/dashboard` | Semua |
| `SALES` | `/dashboard` (policy) / sales | Sales (+ finance status opsional) |
| `PRODUCTION` | `/production` | Production (+ kiosk) |
| `WAREHOUSE` | `/warehouse` | Warehouse |
| `PLANNING` | production/purchasing policy | Production + Purchasing |
| `PROCUREMENT` | purchasing | Purchasing |
| `FINANCE` | finance | Finance |
| Super Admin | `/admin/*` | Admin only |

**Tidak** membuat full app tree per role. Cukup persona home + menu filter.

### 2.2 Multi-entry boleh; multi-copy tidak

| Pattern | Definisi | Contoh OK | Contoh tidak OK |
|---|---|---|---|
| **Multi-entry** | Banyak pintu ke **satu** route/logic | Production → BOM alias; Master Data → BOM | — |
| **Multi-copy** | Dua page/CRUD terpisah untuk entity sama | — | `/production/boms` copy paste form terpisah dari `/dashboard/boms` |
| **Role view** | Page beda, data sama, intent beda | Machine board vs machine master | Dua form edit mesin penuh |
| **Nav duplikat** | Link sama 2× di satu sidebar | — | Surat Jalan di Transaksi + Pengiriman |

### 2.3 Source of truth mengikuti domain

| Area | Boleh tampil di | Owner (source of truth) |
|---|---|---|
| BOM | Master Data, Production, Planning | **Master Data** (engineering/setup) |
| Product catalog | Master Data, Sales (lookup), Production (lookup) | **Master Data** |
| Machine **CRUD** | Master Data | **Master Data** |
| Machine **board** (live SPK/shift) | Production | **Production** (ops view) |
| Employee **CRUD** | Master Data | **Master Data** |
| Team roster / resources (read + context shift) | Production | View Production; data Employee di Master |
| Inventory quantity | Warehouse (full), Production floor (subset) | **Warehouse** |
| Delivery Order / Surat Jalan | Sales | **Sales** |
| SO fulfillment queue (pick/ship prep) | Warehouse | **Warehouse** (operasi); data SO owned Sales |
| Sales Invoice formal / posting | Finance | **Finance** |
| Invoice status (unpaid / follow-up) | Sales (light) | View Sales; entity Invoice owned Finance |
| Goods Receipt | Warehouse (receive), Purchasing (monitor) | **Warehouse** execute; PO owned Purchasing |
| HPP formal report | Finance | **Finance** |
| Production costing audit | Production | **Production** (ops audit, bukan formal books) |
| Maklon receipts/returns | Warehouse / Purchasing entry | Domain maklon; **jangan** cuma Master Data tanpa konteks ops |

### 2.4 Progressive disclosure

Jangan taruh di sidebar permanen:

- Export, print, void, recalculate costing  
- Deep settings yang jarang (boleh di Settings / page action)

### 2.5 Permission model (existing, jangan dipecah)

Dua layer yang sudah ada:

1. **Workspace policy** — `WORKSPACE_ACCESS_POLICY` + isolation `PRODUCTION` / `WAREHOUSE` di `access-policy.ts`
2. **Resource permission** — `RolePermission` (tenant DB) → `allowedResources` di JWT → exception path di `canAccessWorkspace(pathname)`

Plan ini **memakai** layer 2 untuk cross-workspace, dan **mengurangi kebutuhan exception** lewat alias route di portal owner user (mis. `/production/boms` tetap workspace `production`).

**Catatan JWT:** perubahan RolePermission butuh re-login sampai ada refresh permission path (out of scope kecuali Phase E).

---

## 3. Current State Audit (baseline)

### 3.1 Portal & route roots

| Portal | Path root | Sidebar component |
|---|---|---|
| Main / Master | `/dashboard/*` | `src/components/layout/sidebar-nav.tsx` |
| Sales | `/sales/*` | `src/components/sales/sales-sidebar.tsx` |
| Production | `/production/*` | `src/components/production/production-sidebar.tsx` |
| Warehouse | `/warehouse/*` | `src/components/warehouse/warehouse-sidebar.tsx` |
| Purchasing | `/purchasing/*` | `src/components/purchasing/purchasing-sidebar.tsx` |
| Finance | `/finance/*` | `src/components/finance/finance-sidebar.tsx` |
| Kiosk | `/kiosk/*` | layout kiosk terpisah |
| Admin (super) | `/admin/*` | `admin-nav.tsx` |

### 3.2 Inventory redundansi

#### A — Duplikat nav murni (fix dulu)

| ID | Gejala | Lokasi | Route | Severity |
|---|---|---|---|---|
| **A1** | Surat Jalan 2× di Sales sidebar | `sales-sidebar.tsx` group Transaksi + Pengiriman | `/sales/deliveries` | **High** (UX noise, trivial fix) |

#### B — Multi-entry cross-portal (1 data, layout/owner terasa pecah)

| ID | Resource | Entries | Owner path | Severity |
|---|---|---|---|---|
| **B1** | BOM | Main Master Data + Production sidebar → `/dashboard/boms` | `/dashboard/boms` | **High** |
| **B2** | Employees | Master CRUD + Production resources (read + link create) | `/dashboard/employees` | Medium |
| **B3** | Machines CRUD vs board | `/dashboard/machines` vs `/production/machines` | Master vs Production board | Low (sengaja beda; label harus jelas) |
| **B4** | Maklon | Hanya Master Data group | `/dashboard/maklon/*` | Medium (ops entry kurang) |
| **B5** | Goods receipt | Warehouse incoming (PurchaseService) | `/warehouse/incoming` | Low–OK; purchasing boleh monitor |
| **B6** | Invoice | `/sales/invoices` + `/finance/invoices/sales` | Finance formal | Medium (overlap UI) |

#### C — Role / subset views (pertahankan, perjelas label)

| ID | View A | View B | Hubungan |
|---|---|---|---|
| **C1** | `/production/inventory` floor MIXING | `/warehouse/inventory` full | Subset vs full — OK |
| **C2** | `/production/costing` ops audit | `/finance/reports/hpp` formal | Layer beda — OK jika copy/label beda |
| **C3** | `/sales/mobile/*` | `/sales/*` desktop | Persona — OK |
| **C4** | `/production/resources` | `/dashboard/employees` | Thin mirror — perjelas |
| **C5** | `/warehouse/outgoing` (SO list) | `/sales/deliveries` (DO list) | **Bukan** duplikat data; mudah disalahartikan sebagai 2 SJ |

#### D — Overlap konseptual (rename / alur, bukan merge page)

| ID | Confusable pair | Clarification target |
|---|---|---|
| **D1** | Surat Jalan (Sales) vs Barang Keluar (Warehouse) | Gudang = antrian fulfill SO; Sales = DO/SJ |
| **D2** | Sales Invoice vs Finance Sales Invoice | Sales = status/follow-up; Finance = accounting |
| **D3** | Production costing vs HPP report | Ops audit vs laporan resmi |

### 3.3 Evidence file pointers

```txt
# Duplikat SJ
src/components/sales/sales-sidebar.tsx
  Transaksi → /sales/deliveries
  Pengiriman → /sales/deliveries   # same href

# BOM cross-portal
src/components/production/production-sidebar.tsx
  href: /dashboard/boms
src/components/layout/sidebar-nav.tsx
  href: /dashboard/boms
src/app/dashboard/boms/**          # only BOM pages today

# Outgoing vs SJ
src/app/warehouse/outgoing/page.tsx   # getSalesOrders
src/app/sales/deliveries/page.tsx     # getDeliveryOrders

# Invoice dual entry
src/app/sales/invoices/page.tsx           # getSalesInvoices
src/app/finance/invoices/sales/page.tsx   # getInvoices + demand tabs

# Access
src/lib/auth/access-policy.ts
src/auth.ts (RolePermission → allowedResources)
```

### 3.4 Target sidebar shapes (after cleanup)

#### Sales (proposed)

```txt
Ringkasan
  - Dashboard
  - Tampilan Mobile
Transaksi
  - Penawaran
  - Sales Order
  - MTS Belum Lunas
  - Invoice Penjualan (status view)
  - Retur
Pengiriman
  - Jadwal Kirim
  - Surat Jalan          ← only here
  - Armada
Laporan
  - Biaya Pengiriman
Pelanggan
  - Customer
```

#### Production (proposed)

```txt
Ringkasan
  - Overview
Perencanaan
  - SPK / Work Orders
  - Permintaan Masuk
  - Jadwal
  - MRP
  - BOM / Formula        ← alias /production/boms (layout production)
Lantai
  - Produksi Hari Ini
  - Machine Board        ← label beda dari "Master Mesin"
Sumber Daya & Stok
  - Stok Lantai
  - Tim & Shift (roster)
  - Log Output
  - Packing Bulanan
  - Shift Master (ops)
Analitik & Tools
  - Analitik
  - Costing (ops audit)
  - Kiosk
```

#### Master Data / main (proposed)

```txt
Modul
  - Sales, Purchasing, Production, Warehouse, Finance
Master Data
  - Produk
  - BOM / Formula        ← owner CRUD
  - Mesin (master CRUD)
  - Karyawan (master CRUD)
Maklon (opsional pindah entry ke Warehouse — Phase D)
  - Penerimaan Maklon
  - Retur Maklon
```

#### Warehouse (proposed label tweak)

```txt
Operasi
  - Job Queue
  - Penerimaan (Incoming GR)
  - Antrian Kirim / Fulfill SO   ← rename from generic "Barang Keluar" if needed
  - Opname
Inventori
  - Overview, Transfer, Adjustment, Aging, Locations
Analitik
  - ...
```

---

## 4. Target Ownership Matrix (canonical)

| Entity / capability | Owner path | Allowed multi-entry | Mutation allowed from | Notes |
|---|---|---|---|---|
| Product | `/dashboard/products` | Sales lookup, Production lookup | Master / Admin | No second product admin |
| BOM | `/dashboard/boms` | `/production/boms` alias | Master + role with resource perm | Single form components |
| Machine master | `/dashboard/machines` | Link from production board “kelola master” | Master | CRUD |
| Machine board | `/production/machines` | — | Production ops actions | Not master CRUD |
| Employee | `/dashboard/employees` | Production resources list | Master | Resources = roster view |
| Work shift | `/production/shifts` (or settings) | — | Production / Admin | Align with existing |
| Inventory | `/warehouse/inventory` | Production floor filter | Warehouse mutations | Floor read + acknowledge handover OK |
| Sales Order | `/sales/orders` | Warehouse outgoing queue | Sales (+ warehouse fulfill actions) | |
| Delivery Order | `/sales/deliveries` | Print, schedule links | Sales | **Only** SJ list |
| Delivery schedule / vehicle | `/sales/delivery-schedules`, `/sales/vehicles` | — | Sales | Armada module |
| Sales Invoice | Finance path formal | Sales light list | Finance posting rules | Unify component later |
| Purchase Order | `/purchasing/orders` | Warehouse monitor optional | Purchasing | |
| Goods Receipt | `/warehouse/incoming` | Purchasing link | Warehouse receive | |
| Journal / COA / periods | `/finance/*` | — | Finance | |
| HPP report | `/finance/reports/hpp` | Link from production costing | Finance | |
| Production costing | `/production/costing` | Link to finance HPP | Production read/ops | |
| Maklon receipt/return | TBD Phase D | Master temporary | Ops roles | Prefer warehouse entry |

---

## 5. Phased Implementation Plan

> Implementasi **belum** dijalankan. Urutan phase dirancang low-risk → high-impact.  
> Setiap phase harus mergeable sendiri dan punya acceptance criteria.

---

### Phase 0 — Inventory freeze & decision log

**Objective:** Kunci keputusan di dokumen ini; tidak ada coding product selain doc.

**Tasks:**

| Task | Output |
|---|---|
| 0.1 Review plan ini dengan owner product | APPROVED / changes |
| 0.2 Tandai phase in-scope MVP vs later | Checklist di §8 |
| 0.3 Pastikan tidak bentrok plan delivery (SJ workflow) | Cross-link only |

**Exit:** Plan status → `Approved` atau revisi section 4–6.

---

### Phase 1 — Quick wins (nav-only, zero route move)

**Risk:** Very low  
**Estimate:** Kecil (1 PR)

#### Task 1.1 — Hapus duplikat Surat Jalan di Sales sidebar

**Objective:** Satu entry SJ di group **Pengiriman**.

**Files:**
- Modify: `src/components/sales/sales-sidebar.tsx`
- Optional labels: `src/lib/labels/navigation.ts` jika perlu rename group clarity

**Change:**
- Hapus item `/sales/deliveries` dari group `Transaksi`.
- Pertahankan di group `Pengiriman` (bersama Jadwal + Armada).
- Alasan: alur order (quotation → SO → invoice/return) vs alur fulfillment fisik (schedule → DO → armada).

**Acceptance:**
- [ ] Sidebar Sales menampilkan “Surat Jalan” tepat **satu** kali.
- [ ] `/sales/deliveries` masih accessible.
- [ ] Tidak ada perubahan schema/action.

#### Task 1.2 — Rename / relabel warehouse outgoing (copy only)

**Objective:** Hilangkan persepsi “2 surat jalan di 2 modul”.

**Files:**
- Modify: `src/app/warehouse/outgoing/page.tsx` (title/description)
- Modify: `src/lib/labels/*` warehouse labels jika ada
- Modify: `src/components/warehouse/warehouse-sidebar.tsx` label item

**Proposed copy:**

| Field | Before (approx) | After |
|---|---|---|
| Sidebar | (outgoing orders) | **Antrian Kirim (SO)** atau **Fulfillment SO** |
| H1 | Barang Keluar | Antrian Pengiriman / Fulfillment |
| Description | Kelola pengiriman ke customer | Sales Order yang siap/perlu diproses gudang. Surat Jalan (DO) dikelola di Sales. |

**Acceptance:**
- [ ] Label tidak memakai kata “Surat Jalan” untuk list SO.
- [ ] Optional: link teks “Lihat Surat Jalan → `/sales/deliveries`” di page outgoing (jika role boleh).

#### Task 1.3 — Label bedakan machine master vs board

**Files:**
- `production-sidebar.tsx`, `sidebar-nav.tsx`, labels

**Proposed:**
- Master: **Mesin (Master)**
- Production: **Papan Mesin** / **Machine Board**

**Acceptance:**
- [ ] User tidak mengira dua menu = dua master data.

#### Task 1.4 — Label resources vs employees

**Proposed:**
- Master: **Karyawan**
- Production: **Tim Produksi** (roster), bukan “Employees CRUD”

**Acceptance:**
- [ ] Production resources tetap deep-link create ke `/dashboard/employees/create` (atau nanti alias Phase 2).

**Phase 1 PR checklist:**
- [ ] Diff terbatas ke sidebar + labels + page titles
- [ ] Smoke: buka Sales, Warehouse, Production sidebars
- [ ] Tidak sentuh auth

---

### Phase 2 — BOM portal alias (canonical fix untuk “BOM ada 2”)

**Risk:** Low–medium (routing + layout + permission)  
**Estimate:** Medium

#### Task 2.1 — Pilih pattern implementasi alias

**Opsi (pilih satu di eksekusi; rekomendasi: A):**

| Opsi | Deskripsi | Pros | Cons |
|---|---|---|---|
| **A. Thin page re-export** | `src/app/production/boms/**` page.tsx call shared loader/components yang sama dengan dashboard | Layout production otomatis; URL production | Perlu mirror file tree create/edit/detail |
| **B. Next.js redirect** | `/production/boms` → `/dashboard/boms` | Cepat | **Tidak** fix layout loncat — **tolak untuk goal UX** |
| **C. Shared route group** | `(master)/boms` + dual layout slot | Clean long-term | Refactor routing lebih besar |

**Rekomendasi:** **Opsi A** untuk MVP; opsi C sebagai follow-up arch.

#### Task 2.2 — Extract shared BOM page data layer (jika perlu)

**Files (likely):**
- Existing pages: `src/app/dashboard/boms/**`
- Components: `src/components/production/bom/*`
- Actions: `src/actions/production/boms.ts` (or current path)

**Rules:**
- Jangan duplikasi form logic.
- Page production & dashboard hanya beda **shell** (breadcrumb, back link, base path untuk Link `href`).

#### Task 2.3 — Create alias routes under production

**Create (mirror structure):**
```txt
src/app/production/boms/page.tsx
src/app/production/boms/create/page.tsx
src/app/production/boms/[id]/page.tsx
src/app/production/boms/[id]/edit/page.tsx
src/app/production/boms/[id]/error.tsx   # if needed
```

**Internal links:**  
Semua `Link` di dalam BOM UI harus relative terhadap **base path aktif** (`/production/boms` vs `/dashboard/boms`), mis. prop `basePath` ke `BOMList` / `BOMForm`.

#### Task 2.4 — Update production sidebar

**Modify:** `src/components/production/production-sidebar.tsx`
- `href: "/production/boms"` (bukan `/dashboard/boms`)

**Keep:** Main nav Master Data → `/dashboard/boms` (owner).

#### Task 2.5 — Permission & access policy

**Goal:** Role PRODUCTION mengakses BOM **tanpa** mengandalkan exception workspace `dashboard` jika memungkinkan.

**Karena** `getWorkspaceFromPath('/production/boms') === 'production'`, isolation PRODUCTION **otomatis lolos** workspace check.

**Tetap perlu:**
- RolePermission / menu filter Access Control: resource path update ke `/production/boms` **atau** dukung keduanya.
- Access Control grid (`sidebarLinks` export) — putuskan apakah permission resource pakai path dashboard (canonical) atau keduanya.

**Proposed permission rule:**
- Canonical resource key: `/dashboard/boms` (master)  
- Production alias: always allowed if role has production workspace **OR** explicit resource;  
  **OR** simpler MVP: anyone with production access can open `/production/boms` (read/write gated by action-level role checks existing).

**Document decision in PR** (pick one):

| Policy | Kapan |
|---|---|
| **P1** Production role always sees BOM alias (ops need) | BOM maintenance by production common |
| **P2** BOM alias still gated RolePermission | Strict tenants |

Default plan: **P1 for read list + detail; write tetap action role checks**.

#### Task 2.6 — Optional soft dual-write links

- Di `/dashboard/boms` page header: badge “Master Data”
- Di `/production/boms` page header: badge “Portal Produksi” + link “Buka di Master Data” untuk admin

**Acceptance Phase 2:**
- [ ] User PRODUCTION buka BOM dari sidebar → URL `/production/boms*` → sidebar **tetap** production.
- [ ] ADMIN buka dari Master Data → `/dashboard/boms*` → sidebar main.
- [ ] Create/edit/detail works di kedua entry (shared components).
- [ ] Tidak ada dua schema/model.
- [ ] Tests: access-policy unit tests updated if paths change; optional e2e smoke.
- [ ] Docs: `docs/produksi-hari-ini-guide.md` / manual BOM path update jika merujuk Master Data only.

---

### Phase 3 — Cross-portal multi-entry playbook (generalize)

**Risk:** Medium  
**Objective:** Terapkan pola Phase 2 ke resource mirip **hanya jika** entry production/sales sering dipakai.

#### Task 3.1 — Decision matrix per resource

| Resource | Alias under portal? | Priority | Notes |
|---|---|---|---|
| BOM | Yes `/production/boms` | P0 (Phase 2) | Done in Phase 2 |
| Products | Optional `/production/products` read-only list | P2 | Lookup only |
| Employees | Optional deep links only | P2 | Resources page cukup |
| Machines master | No alias full CRUD | P3 | Link from board “Kelola master mesin” |
| Maklon | Move entry to Warehouse (Phase 4) | P1 | Bukan alias dashboard |

#### Task 3.2 — Shared helper `portalBasePath`

**Create:** e.g. `src/lib/navigation/portal-paths.ts`

```ts
export const MASTER_PATHS = {
  boms: "/dashboard/boms",
  products: "/dashboard/products",
  machines: "/dashboard/machines",
  employees: "/dashboard/employees",
} as const;

export const PRODUCTION_ALIASES = {
  boms: "/production/boms",
} as const;
```

Pakai di sidebar + Access Control labels.

#### Task 3.3 — Access Control UI sync

**Files:**
- `src/components/settings/AccessControlTab.tsx`
- `sidebarLinks` export from `sidebar-nav.tsx`

**Rules:**
- Permission grid tetap list **canonical** master paths.
- Document that production alias inherits production workspace access (Phase 2 policy).

**Acceptance:**
- [ ] Tidak ada resource “ghost” di AC yang tidak ada di nav.
- [ ] Admin bisa explain: master path = permission resource; portal alias = convenience.

---

### Phase 4 — Warehouse ↔ Sales fulfillment clarity

**Risk:** Medium (copy + optional UX links; **bukan** merge DO ke warehouse)  
**Depends:** Phase 1 labels recommended first

#### Task 4.1 — Document happy path alur

```txt
SO (Sales)
  → Warehouse: Antrian Fulfillment SO (/warehouse/outgoing)
  → create / attach Delivery Order (Sales)
  → status DO: LOADING → ... → DELIVERED
  → stock out / fulfill side effects (existing services)
  → Invoice (Finance/Sales) sesuai flow tenant
```

Align dengan plan delivery completion — **jangan** buat list DO kedua di warehouse di MVP.

#### Task 4.2 — Warehouse outgoing UX

**Optional enhancements (setelah rename):**
- Kolom status: “Sudah punya SJ?” (count open DO)
- CTA “Buat / lihat Surat Jalan” → `/sales/deliveries/...` jika policy allow
- Jika WAREHOUSE role tidak boleh sales workspace: CTA hanya status text, create DO tetap Sales

#### Task 4.3 — Sales deliveries UX

- Pastikan empty state / help text: “Dokumen pengiriman (DO). Antrian gudang ada di modul Inventory untuk role gudang.”

**Acceptance:**
- [ ] Dua menu tidak lagi disebut sama oleh support/training.
- [ ] Tidak ada second DO CRUD di warehouse.

---

### Phase 5 — Invoice dual-entry rationalization

**Risk:** Medium–high (finance sensitivity)  
**Do not rush** — setelah Phase 1–2 stabil.

#### Task 5.1 — Define persona split

| Persona | Needs | Path |
|---|---|---|
| Sales | List unpaid, status, link customer, follow-up | `/sales/invoices` (light) |
| Finance | Full list, demand tabs, print, accounting fields | `/finance/invoices/sales` |

#### Task 5.2 — Reduce UI twin feel

Options (pick one):
1. **Shared table component + different columns/actions** (already partially shared `InvoiceTable`)
2. Sales page = filtered unpaid + link “Kelola di Finance”
3. Redirect sales invoices → finance for ADMIN only; keep light for SALES role

#### Task 5.3 — Unify data fetch if safe

Today:
- Sales: `getSalesInvoices` in `actions/finance/invoices.ts`
- Finance: `getInvoices` in `actions/finance/invoice.ts`

**Goal long-term:** one service method, two presenters.

**Acceptance:**
- [ ] Sales user never loses follow-up list.
- [ ] Finance keeps demand filters / formal tools.
- [ ] Labels: Sales “Status Invoice”; Finance “Sales Invoices (Accounting)”.

---

### Phase 6 — Maklon entry relocation

**Risk:** Low–medium (nav + permission only if pages stay)

#### Task 6.1 — Move nav entry

- From: main sidebar Maklon group under dashboard  
- To: **Warehouse** (receipts/returns ops) and/or **Purchasing** monitor

Routes may stay `/dashboard/maklon/*` short-term **or** alias `/warehouse/maklon/*` (same pattern as BOM).

#### Task 6.2 — Role access

- WAREHOUSE needs access if isolated — prefer alias under `/warehouse/...` agar tidak exception dashboard.

**Acceptance:**
- [ ] Ops maklon tidak hanya “tersembunyi” di Master Data.

---

### Phase 7 — Navigation registry (foundation modular)

**Risk:** Medium (refactor structure)  
**Prerequisite:** Phases 1–2 done so registry is clean

Align with `2026-05-28-navigation-modularity-draft.md`:

#### Task 7.1 — Single nav registry

**Create:** e.g. `src/lib/navigation/registry.ts`

```ts
type NavItem = {
  id: string;
  labelKey: string;
  href: string;
  workspace: WorkspaceKey | "master";
  owner: "sales" | "production" | "warehouse" | "purchasing" | "finance" | "master";
  roles?: Role[];           // optional hard defaults
  resourceKey?: string;     // RolePermission path
  section: string;
  deprecatedAliases?: string[];
};
```

#### Task 7.2 — Sidebars consume registry

- `sales-sidebar`, `production-sidebar`, etc. map filter by `workspace` + section.
- Eliminate hard-coded duplicate hrefs (lint rule optional).

#### Task 7.3 — Lint / test guard

**Create test:**
- No duplicate `href` within same portal sidebar group set.
- Optional: snapshot nav trees.

**Acceptance:**
- [ ] Adding a menu = one registry edit.
- [ ] Unit test fails if SJ-style duplicate reintroduced.

---

### Phase 8 — Permission DX (optional follow-up)

**Risk:** Medium

- Refresh `allowedResources` without full re-login (session update endpoint)
- Prefix match for resources (`/dashboard/boms` grants children)
- Audit script: `scripts/audit-tenant-account-roles.ts` pattern for nav resource coverage

Out of scope detail — only if tenants complain about re-login after AC changes.

---

## 6. Explicit Non-Goals

| Non-goal | Why |
|---|---|
| Full page tree per role | Maintenance explosion |
| Moving BOM domain ownership into Production permanently | BOM is engineering/master, multi-consumer |
| Merging Warehouse outgoing into Sales deliveries | Different jobs: fulfill SO vs document DO |
| Plugin marketplace / tenant module toggle full | Covered as later stage in modularity draft |
| Mass move of `src/app/dashboard/*` ke domain folders in one PR | Too large; alias first |
| Changing Prisma Role enum | Not required for nav ownership |
| Rewriting finance invoice posting | Separate concern |

---

## 7. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Alias routes drift from master pages | Double bugs | Shared components + single actions |
| Access Control still lists only old paths | Confusion | Phase 3 AC sync; document canonical keys |
| PRODUCTION gains BOM write unintended | Data quality | Action-level role checks; prefer P1 read-heavy |
| Warehouse rename confuses trained users | Support load | Changelog banner / release note |
| Invoice phase breaks sales follow-up | Revenue ops | Phase 5 after stability; feature flag optional |
| Deep links & bookmarks to `/dashboard/boms` | Still valid | Keep master routes forever; aliases additive |
| JWT stale permissions | Access surprise | Existing re-login note; Phase 8 later |

---

## 8. MVP Cutline — **SHIPPED**

| Item | Status | Commits (on `main`) |
|---|---|---|
| Phase 1 — SJ dedupe, labels, machine master | ✅ | `1285f5d` |
| Phase 2 — BOM `/production/boms` alias | ✅ | `1285f5d` |
| Phase 3 — `portal-paths.ts` helper | ✅ (partial; sidebars not consumers) | `b6cae85`, extended `4fce4ef` |
| Phase 4 — outgoing vs SJ clarity + CTA gate | ✅ | `67f65f8`, `30b7451` |
| Phase 6 — Maklon warehouse aliases + residual | ✅ | `b6cae85`, `30b7451`, `4fce4ef` |
| Phase 7.1 + 7.3 — registry + integrity test | ✅ | `ac3ef93` |
| Phase 5 — invoice dual-entry | ⏭ backlog | see follow-up doc |
| Phase 7.2 — sidebars consume registry | ⏭ backlog | see follow-up doc |
| Phase 8 — permission DX | ⏭ backlog | see follow-up doc |

**Shipped range:** `1285f5d` … `4fce4ef` → `origin/main` (2026-07-10).

---

## 9. Testing Strategy

### 9.1 Automated

| Layer | What |
|---|---|
| Unit | `access-policy.test.ts` — production can access `/production/boms`; isolation still blocks unrelated dashboard |
| Unit | Nav integrity test — no duplicate href per portal |
| Component/integration | BOM create/edit via both basePaths if basePath prop added |
| Existing | `tests/actions/boms.test.ts`, production-security tests — ensure still green |

### 9.2 Manual QA matrix

| Role | Scenario | Expected |
|---|---|---|
| ADMIN | Main → BOM | Dashboard layout, full CRUD |
| ADMIN | Production → BOM | Production layout, same data |
| PRODUCTION | Production → BOM | Production layout; no soft lock to empty dashboard |
| PRODUCTION | Direct `/dashboard/boms` | Allow only if RolePermission; else deny (current policy) |
| SALES | Sidebar | Exactly one Surat Jalan under Pengiriman |
| WAREHOUSE | Outgoing page | Label fulfillment SO; not “Surat Jalan” |
| FINANCE | Invoices | Unchanged behavior Phase 1–2 |

### 9.3 Regression watchlist

- Kiosk links  
- Global search paths to BOM/products  
- Breadcrumbs (`path-breadcrumb`)  
- Mobile sales nav (unrelated but don’t break)  
- Print surat jalan routes  

---

## 10. Rollout & Communication

1. **Changelog** internal: “Surat Jalan menu digabung; antrian gudang diganti nama; BOM bisa dibuka dari produksi tanpa ganti portal.”  
2. **Training one-liner:**  
   - *Surat Jalan = dokumen pengiriman (Sales).*  
   - *Antrian kirim gudang = SO yang perlu diproses.*  
   - *BOM master di Master Data; produksi pakai pintu yang sama.*  
3. **Feature flag:** not required for Phase 1; optional for Phase 2 if tenant-sensitive.

---

## 11. File Impact Map (expected)

### Phase 1
```txt
src/components/sales/sales-sidebar.tsx
src/components/warehouse/warehouse-sidebar.tsx
src/components/production/production-sidebar.tsx  # labels only if 1.3
src/components/layout/sidebar-nav.tsx             # labels only if 1.3
src/app/warehouse/outgoing/page.tsx
src/lib/labels/navigation.ts
src/lib/labels/sales.ts                          # optional
src/lib/labels/* warehouse                       # if exists
```

### Phase 2
```txt
src/app/production/boms/**                       # new alias pages
src/app/dashboard/boms/**                        # pass basePath / shared extract
src/components/production/bom/**                 # basePath-aware links
src/components/production/production-sidebar.tsx
src/lib/navigation/portal-paths.ts               # optional early
src/lib/auth/__tests__/access-policy.test.ts
docs/produksi-hari-ini-guide.md                  # path notes
```

### Phase 7 (later)
```txt
src/lib/navigation/registry.ts
src/components/**/**-sidebar.tsx                 # consume registry
tests/unit/nav-integrity.test.ts
```

---

## 12. Decision Log (fill on approval)

| # | Decision | Options | Choice | Date | By |
|---|---|---|---|---|---|
| D1 | SJ only under Pengiriman? | Yes / keep both | _pending_ | | |
| D2 | BOM alias pattern | A thin pages / B redirect / C route groups | **Recommend A** | | |
| D3 | PRODUCTION BOM write policy | P1 always portal / P2 RolePermission | **Recommend P1 read + action checks** | | |
| D4 | Warehouse outgoing name | “Antrian Kirim (SO)” / other | _pending_ | | |
| D5 | Invoice unify timing | With MVP / later Phase 5 | **Recommend later** | | |
| D6 | Maklon move | Phase 6 / stay master | _pending_ | | |

---

## 13. Open Questions

1. Apakah tenant Melindo/Kiyowo memakai RolePermission granular untuk BOM, atau PRODUCTION selalu boleh edit BOM?  
2. Apakah WAREHOUSE boleh create DO, atau hanya Sales? (mempengaruhi CTA di outgoing)  
3. Apakah `/sales/invoices` masih critical daily untuk sales admin, atau cukup link ke finance?  
4. Apakah Master Data group di main nav akan diganti portal `Master Data` terpisah long-term?  
5. Global Search — index alias paths atau canonical only?

---

## 14. Appendix A — “Jangan lakukan” checklist

- [ ] Jangan copy-paste `BOMForm` jadi dua file diverging  
- [ ] Jangan `redirect('/dashboard/boms')` sebagai “fix” UX production  
- [ ] Jangan taruh list DO kedua di warehouse sebagai “Surat Jalan”  
- [ ] Jangan hapus `/dashboard/boms` (canonical master)  
- [ ] Jangan expand role isolation exception ad-hoc tanpa matrix owner  
- [ ] Jangan merge Phase 5 invoice ke PR yang sama dengan Phase 1 nav fix  

## 15. Appendix B — Mapping ringkas (one-pager)

```txt
REDUNDANT NOW
  Sales sidebar: Surat Jalan ×2                    → Phase 1.1 keep one
  BOM: production link + master (layout jump)      → Phase 2 alias
  Outgoing vs SJ naming                            → Phase 1.2 + 4
  Invoice sales vs finance                         → Phase 5
  Maklon only under master                         → Phase 6

INTENTIONALLY DIFFERENT (keep)
  Machine board ≠ machine master
  Floor stock ≠ full inventory
  Costing ops ≠ HPP formal
  Mobile sales ≠ desktop sales
  Resources roster ≠ employee HR CRUD

PRINCIPLE
  1 owner path per entity
  multi-entry OK with portal layout
  multi-copy CRUD NOT OK
  role = home + permissions, not full app clone
```

## 16. Appendix C — Suggested PR sequence

| PR | Title (suggested) | Phase |
|---|---|---|
| PR1 | `fix(nav): remove duplicate Surat Jalan; clarify warehouse fulfillment labels` | 1 |
| PR2 | `feat(production): BOM alias under /production/boms with shared components` | 2 |
| PR3 | `fix(nav): machine/resources label clarity` | 1.3–1.4 (can merge PR1) |
| PR4 | `feat(warehouse): fulfillment queue CTAs toward DO` | 4 |
| PR5 | `refactor(finance/sales): invoice dual-entry persona split` | 5 |
| PR6 | `feat(nav): relocate maklon entries to warehouse` | 6 |
| PR7 | `refactor(nav): single navigation registry + integrity tests` | 7 |

---

## 17. Document History

| Date | Author | Change |
|---|---|---|
| 2026-07-10 | Planning session | Initial full plan from nav/BOM/SJ audit |
| 2026-07-10 | Close-out | Status → SHIPPED v1; remaining → follow-up backlog |

---

**v1 closed.** Sisa pekerjaan: [`2026-07-10-navigation-followup-backlog.md`](./2026-07-10-navigation-followup-backlog.md).
