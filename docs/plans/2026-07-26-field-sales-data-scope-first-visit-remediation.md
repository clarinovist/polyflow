# Plan: Remediasi Field Sales — Data Scope, Customer Ownership, dan First Visit

> **Date:** 2026-07-26  
> **Status:** Draft — Corrective Plan, menunggu approval implementasi  
> **Surface:** `/field/sales/*`, `/sales/routes`, customer assignment, sales order/pipeline, piutang, dan kunjungan lapangan  
> **Related:**  
> - `docs/plans/2026-07-26-field-sales-crm-ux-audit.md`  
> - `docs/plans/2026-07-24-field-portal-architecture-and-migration-plan.md`  
> - `docs/plans/2026-07-20-granular-access-control.md`  
> - `docs/plans/2026-07-25-unified-so-quotation-lifecycle.md`  
> - Schema terkait: `Customer`, `SalesOrder`, `Invoice`, `SalesVisit`, `SalesRoutePlan`, `SalesRoutePlanItem`

---

## Goal (Satu Kalimat)

Menjadikan `/field/sales` sebagai workspace pribadi sales yang konsisten dan aman, dengan data operasional dibatasi ke tanggung jawab user login, route dan visit tersinkron ke server, serta kunjungan pertama ke toko baru dapat dimulai tanpa bergantung pada customer yang sudah ada.

---

## 1. Ringkasan Eksekutif

Implementasi saat ini sudah memiliki beberapa fondasi personal yang benar:

- `getTodayRoutePlan()` mencari rute berdasarkan `session.user.id`.
- `getServerVisits()` mencari kunjungan berdasarkan `session.user.id`.
- `syncVisitLogsAction()` mengisi `SalesVisit.userId` dari session, bukan dari input client.
- Order yang dibuat melalui flow field mengisi `SalesOrder.createdById` dengan user login.

Namun fondasi tersebut belum diterapkan secara konsisten di seluruh portal:

- customer list masih mengambil seluruh customer tenant;
- order list masih mengambil seluruh order tenant;
- statistik pipeline memakai seluruh order tenant, sedangkan daftar tiga pipeline terbaru sudah personal;
- piutang memakai seluruh outstanding invoice tenant;
- detail customer dan order belum memiliki object-level authorization;
- route server belum dikonsumsi oleh field home;
- status route item hanya berubah di `localStorage`;
- metadata Extra Call dibuat di browser tetapi hilang saat sync;
- first visit hanya bisa dimulai dari customer yang sudah ada.

Remediasi tidak cukup berupa filter UI. Perlu satu kontrak domain yang eksplisit untuk menjawab:

1. Siapa pemilik atau sales penanggung jawab customer?
2. Data apa yang boleh dilihat oleh sales, supervisor, dan admin?
3. Apakah order mengikuti creator atau account owner?
4. Bagaimana toko baru dibuat tanpa menghasilkan master customer sampah?
5. Bagaimana route, visit, dan offline queue tetap konsisten dengan server?

---

## 2. Problem Statement Terverifikasi

### 2.1 Data scope tidak konsisten

| Surface | Query saat ini | Scope aktual | Target |
|---|---|---|---|
| Home route | `getTodayRoutePlan()` | User login, tetapi belum dipakai UI | User login |
| Home stats | `getSalesOrderStats()` | Seluruh tenant | User login / customer assignment |
| Home next pipeline | `getRecentPipelineOrders()` | `createdById = user login` | User login / customer assignment |
| Customer list | `getCustomers()` | Seluruh tenant | Customer yang ditangani + route hari ini; pencarian global terkontrol |
| Customer detail | `getCustomerById(id)` | Record tenant mana pun | Object authorization |
| Order list | `getSalesOrders(false)` | Seluruh tenant | Order milik scope sales |
| Order detail | `getSalesOrderById(id)` | Record tenant mana pun | Object authorization |
| Piutang | `getOutstandingInvoices()` | Seluruh tenant | Invoice dari order/customer scope sales |
| Visit history | `getServerVisits()` | User login | User login |

### 2.2 Tidak ada customer ownership permanen

Model `Customer` saat ini tidak memiliki `salesRepId`, `ownerId`, atau tabel assignment. `SalesRoutePlanItem` hanya menyatakan penugasan customer untuk satu tanggal. `SalesOrder.createdById` menyatakan pembuat order, bukan pemilik account.

Konsekuensinya:

- sistem tidak bisa mendefinisikan `Customer Saya` secara stabil;
- customer yang berpindah sales tidak punya histori assignment;
- admin yang membuat order atas nama sales akan mengacaukan ownership jika hanya memakai `createdById`;
- detail dan piutang tidak dapat diamankan berdasarkan account ownership;
- route harian tidak cukup sebagai sumber ownership jangka panjang.

### 2.3 First visit terblokir oleh customer master

`VisitCheckInCard` membutuhkan `customerId`, sedangkan `SalesVisit.customerId` wajib. Check-in hanya tersedia pada `/field/sales/customers/[id]`. Sales yang tiba di toko baru harus membuat customer melalui flow lain sebelum dapat check-in.

Flow tersebut tidak cocok untuk canvassing karena:

- konteks GPS dan waktu kedatangan terputus;
- sales berpotensi memilih customer yang salah agar dapat check-in;
- toko baru dapat tidak tercatat sama sekali;
- quick-create customer saat ini hanya tersedia di order wizard;
- tidak ada status prospect atau verifikasi duplikasi customer.

### 2.4 Route dan visit memiliki dua source of truth

- Route resmi disimpan di `SalesRoutePlan` dan `SalesRoutePlanItem`.
- Field home dan check-in membaca/mengubah `today_journey_plan_*` di `localStorage`.
- `getTodayRoutePlan()` belum dipanggil UI.
- Check-in/check-out tidak memperbarui `SalesRoutePlanItem.status` di server.

Akibatnya supervisor dan sales dapat melihat status berbeda.

### 2.5 Extra Call tidak persisten

Browser membuat `isOutsideRoute` dan `extraReason`, tetapi:

- payload `VisitSyncBanner` tidak mengirim field tersebut;
- `VisitLogInput` tidak menerima field tersebut;
- `SalesVisit` tidak menyimpan field tersebut;
- `SalesRoutePlanItem.isExtraCall` tidak pernah diubah oleh flow visit;
- statistik compliance membaca `SalesRoutePlanItem.isExtraCall`, sehingga hasilnya tidak merepresentasikan kunjungan aktual.

### 2.6 Offline sync belum idempotent

Log lokal memiliki ID client, tetapi server membuat ID baru tanpa menyimpan client ID. Jika request berhasil di server namun client gagal menerima respons atau gagal menandai log sebagai synced, retry dapat membuat duplicate `SalesVisit`.

---

## 3. Keputusan Arsitektur yang Direkomendasikan

### 3.1 Customer ownership memakai tabel assignment eksplisit

**Rekomendasi:** tambah `CustomerSalesAssignment`, bukan hanya `Customer.salesRepId`.

Alasan:

- mendukung perpindahan account tanpa kehilangan histori;
- dapat membedakan primary owner dan supporting rep;
- memungkinkan satu customer ditangani lebih dari satu sales jika bisnis berkembang;
- assignment route harian tetap terpisah dari ownership account;
- backfill dan unassignment lebih aman daripada overwrite foreign key tunggal.

Konsep schema:

```prisma
model CustomerSalesAssignment {
  id           String   @id @default(cuid())
  customerId   String
  userId       String
  isPrimary    Boolean  @default(true)
  assignedAt   DateTime @default(now())
  unassignedAt DateTime?
  assignedById String
  notes        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  customer     Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  user         User     @relation("CustomerSalesAssignee", fields: [userId], references: [id])
  assignedBy   User     @relation("CustomerSalesAssignmentCreator", fields: [assignedById], references: [id])

  @@index([userId, unassignedAt])
  @@index([customerId, unassignedAt])
  @@index([customerId, isPrimary, unassignedAt])
}
```

Rule domain:

- assignment aktif jika `unassignedAt IS NULL`;
- satu customer hanya boleh memiliki satu primary assignment aktif;
- supporting assignment boleh lebih dari satu;
- perubahan ownership dilakukan dengan menutup assignment lama dan membuat assignment baru dalam satu transaction;
- hanya supervisor/admin yang boleh mengubah assignment existing;
- first-visit prospect otomatis membuat primary assignment ke sales pembuat.

Catatan implementasi PostgreSQL:

- Prisma tidak dapat mengekspresikan partial unique index penuh pada schema;
- migration SQL perlu menambahkan unique partial index untuk primary aktif:

```sql
CREATE UNIQUE INDEX "CustomerSalesAssignment_one_active_primary"
ON "CustomerSalesAssignment" ("customerId")
WHERE "isPrimary" = true AND "unassignedAt" IS NULL;
```

### 3.2 Scope personal dihitung oleh policy terpusat

Jangan hardcode `createdById` di setiap page. Tambah helper/service terpusat, misalnya:

```text
src/services/sales/field-sales-scope-service.ts
src/lib/auth/field-sales-access.ts
```

Kontrak minimal:

```ts
type FieldSalesActorScope = {
  actorUserId: string;
  canViewAllSalesData: boolean;
  managedUserIds: string[];
};

getFieldSalesActorScope(session): Promise<FieldSalesActorScope>
getScopedCustomerWhere(scope): Prisma.CustomerWhereInput
getScopedSalesOrderWhere(scope): Prisma.SalesOrderWhereInput
assertCanAccessFieldCustomer(scope, customerId): Promise<void>
assertCanAccessFieldOrder(scope, orderId): Promise<void>
```

Policy default:

| Persona | Customer | Order/Pipeline | Piutang | Visit |
|---|---|---|---|---|
| Sales | Assignment aktif miliknya, route hari ini, prospect yang dibuatnya | Assignment customer miliknya atau `createdById` miliknya | Invoice dari order yang masuk scope | Visit miliknya |
| Supervisor / Sales Admin | User yang berada dalam cakupan timnya; jika struktur tim belum ada, all-sales via permission eksplisit | Scope tim / all-sales permission | Scope tim / all-sales permission | Scope tim / all-sales permission |
| Admin | Seluruh tenant | Seluruh tenant | Seluruh tenant | Seluruh tenant |

Untuk fase awal, jika hierarki supervisor belum dimodelkan:

- `ADMIN` dan `SALES_ADMIN` dapat melihat seluruh tenant;
- `SALES` hanya personal scope;
- jangan menebak struktur tim dari role atau nama department.

### 3.3 `createdById` adalah transaction attribution, bukan customer ownership

Rule yang disepakati:

- `CustomerSalesAssignment` menentukan account ownership;
- `SalesOrder.createdById` tetap menunjukkan siapa membuat transaksi;
- field order list memasukkan order jika customer di-assigned ke actor **atau** order dibuat actor;
- setelah customer berpindah owner, order historis tetap dapat dilihat sesuai policy bisnis yang dipilih.

Rekomendasi policy histori untuk v1:

- owner baru dapat melihat seluruh histori customer untuk continuity account;
- creator lama tidak otomatis dapat melihat customer setelah assignment ditutup, kecuali order tersebut masih aktif dan dibuat olehnya;
- admin/supervisor selalu dapat audit.

### 3.4 Toko baru dibuat sebagai customer prospect minimal

**Rekomendasi:** jangan membuat `SalesVisit.customerId` nullable. Buat customer/prospect minimal dan visit session dalam satu flow.

Tambahkan lifecycle customer ringan:

```prisma
enum CustomerLifecycleStatus {
  PROSPECT
  ACTIVE
  INACTIVE
  REJECTED
  MERGED
}
```

Field pada `Customer` yang disarankan:

```prisma
lifecycleStatus CustomerLifecycleStatus @default(ACTIVE)
createdById     String?
verifiedAt      DateTime?
verifiedById    String?
mergedIntoId    String?
```

Jika perubahan enum dianggap terlalu besar untuk rilis pertama, minimum yang masih aman adalah `isProspect Boolean @default(false)` + attribution fields. Namun enum lebih jelas untuk verification dan merge lifecycle.

Data minimum `Toko Baru`:

- nama toko, wajib;
- nomor telepon, opsional;
- GPS dari device, wajib jika izin tersedia;
- foto toko, dapat diwajibkan saat checkout;
- alamat/catatan singkat, opsional;
- `lifecycleStatus = PROSPECT`;
- primary assignment ke sales login;
- source `FIELD_FIRST_VISIT` jika field source ditambahkan.

### 3.5 Server menjadi source of truth; localStorage hanya offline cache/queue

Rule:

- route resmi selalu dibaca dari `getTodayRoutePlan()`;
- localStorage route hanya cache dari payload server, bukan record independen;
- status route item berubah melalui server action dan dicerminkan ke cache setelah sukses;
- visit offline disimpan sebagai queue dengan client-generated idempotency key;
- setelah sync, server response menentukan canonical visit ID dan status;
- UI boleh optimistic, tetapi harus reconcile dari server.

### 3.6 Visit dan route item harus terhubung

Tambahkan relasi opsional dari visit ke route item:

```prisma
routePlanItemId String?
routePlanItem   SalesRoutePlanItem? @relation(fields: [routePlanItemId], references: [id])
```

Tambahkan metadata visit:

```prisma
clientVisitId  String
isExtraCall    Boolean @default(false)
extraReason    SalesVisitExtraReason?
checkInDistance Float
reviewStatus   SalesVisitReviewStatus @default(NOT_REQUIRED)
```

Index/constraint:

```prisma
@@unique([userId, clientVisitId])
@@index([routePlanItemId])
@@index([isExtraCall, checkInTime])
```

`clientVisitId` harus dibuat sebelum check-in dan dipertahankan hingga sync berhasil.

### 3.7 Extra Call adalah properti visit, bukan route assignment palsu

Aturan:

- kunjungan terhadap item route: `isExtraCall = false`, `routePlanItemId` terisi;
- customer existing di luar route: `isExtraCall = true`, reason wajib;
- toko baru: `isExtraCall = true`, reason otomatis `TOKO_BARU`;
- tidak perlu membuat `SalesRoutePlanItem` palsu untuk setiap EC;
- compliance dihitung dari assigned route item yang selesai;
- Extra Call dihitung dari `SalesVisit.isExtraCall`.

Formula:

```text
assigned = jumlah SalesRoutePlanItem pada route published
completedInRoute = jumlah item route unik yang memiliki visit selesai valid
compliance = completedInRoute / assigned
extraCalls = jumlah SalesVisit valid dengan isExtraCall = true
```

---

## 4. Target User Experience

### 4.1 Home `/field/sales`

Home hanya menampilkan scope actor:

1. Rute hari ini dari server.
2. Pipeline saya.
3. Piutang customer saya.
4. Order aktif saya.
5. Visit sync status.

CTA utama:

- `Mulai Kunjungan`
- `Order Baru`
- `Cari Customer`

### 4.2 Mulai Kunjungan

Flow baru:

```text
Mulai Kunjungan
  -> Customer di Rute Hari Ini
  -> Customer Existing di Luar Rute
  -> Toko / Prospek Baru
```

#### Customer di rute

- tampil paling atas;
- check-in mengirim `routePlanItemId`;
- tidak perlu alasan EC;
- status item server menjadi `VISITING` lalu `COMPLETED`.

#### Customer existing di luar rute

- pencarian global tersedia sebagai aksi eksplisit, bukan daftar default;
- tampil warning `Di Luar Rute`;
- alasan EC wajib sebelum check-in;
- akses customer yang ditemukan bersifat visit-context, bukan otomatis menjadi ownership permanen;
- setelah checkout, supervisor dapat memilih assign customer ke sales jika diperlukan.

#### Toko/prospek baru

- form minimum di satu layar;
- deteksi kemungkinan duplikat berdasarkan telepon, nama, dan jarak GPS;
- jika kandidat ditemukan, user diarahkan memilih existing atau tetap membuat prospect dengan alasan;
- customer prospect + assignment + visit draft dibuat atomik;
- setelah checkout, prospect masuk queue verifikasi back-office.

### 4.3 Customer list

Default tabs/filter:

```text
Rute Hari Ini | Customer Saya | Prospek Saya
```

Aksi sekunder:

```text
Cari Semua Customer
```

`Cari Semua Customer` harus:

- menggunakan server-side search;
- minimum query 2-3 karakter;
- hasil terbatas/paginated;
- tidak mengirim seluruh customer tenant ke browser;
- tidak membuka data finansial sampai access policy lolos;
- menyediakan flow EC tanpa otomatis mengubah ownership.

### 4.4 Order dan pipeline

- list hanya mengambil order actor scope;
- home stats dan top items memakai predicate scope yang sama;
- label `Pipeline Saya` dilarang jika query masih tenant-wide;
- order create dari customer prospect tetap diperbolehkan sesuai credit/approval policy;
- customer baru tidak otomatis dianggap credit-approved.

### 4.5 Piutang

- summary dan list memakai invoice dari scoped sales order/customer;
- detail invoice tetap mengikuti permission finance/back-office existing;
- field sales hanya melihat informasi yang diperlukan untuk collection context;
- bila harga/financial visibility memakai `feature:view-prices`, policy tersebut tetap dihormati.

### 4.6 Prospect verification back-office

Tambahkan queue sederhana di customer admin, misalnya:

```text
/sales/customers?status=prospect
```

Aksi:

- verifikasi dan aktifkan;
- lengkapi data;
- assign ulang;
- merge ke customer existing;
- reject dengan alasan.

Merge harus transaction-safe dan tidak menghapus histori visit. Jika merge diimplementasikan pada fase lanjutan, MVP dapat menandai `MERGED` dan memindahkan relasi secara terkontrol melalui service khusus.

---

## 5. Query dan Authorization Contract

### 5.1 Pisahkan query back-office dan field

Jangan mengubah `getCustomers()` atau `getSalesOrders()` global secara diam-diam karena dipakai back-office. Tambah action khusus field:

```text
getFieldSalesHome()
getMyFieldCustomers(filters)
searchFieldCustomers(query)
getMyFieldSalesOrders(filters)
getMyFieldPipelineStats()
getMyFieldReceivables(filters)
getFieldCustomerById(id, context?)
getFieldOrderById(id)
```

Keuntungan:

- tidak merusak halaman desktop;
- kontrak personal terlihat dari nama;
- test scope lebih mudah;
- tidak ada boolean ambigu seperti `onlyMine = true` yang mudah terlupa.

### 5.2 Predicate customer scope

Sales boleh melihat customer bila salah satu benar:

- memiliki assignment aktif;
- customer berada pada route miliknya untuk tanggal relevan;
- customer prospect dibuat oleh dirinya dan belum reassigned;
- mendapat temporary visit context dari pencarian global untuk memulai EC;
- memiliki permission all-sales/admin.

Temporary visit context tidak boleh menjadi bypass permanen untuk membuka semua detail lewat URL. Opsi implementasi:

- action `searchFieldCustomers()` mengembalikan summary minimum;
- `startVisitForExistingCustomer(customerId, reason)` melakukan authorization khusus EC;
- setelah visit dibuat, detail field dapat diakses melalui visit context aktif;
- direct `getFieldCustomerById()` tetap menolak record di luar scope kecuali ada active/recent authorized visit yang valid.

### 5.3 Predicate order scope

Sales boleh melihat order jika:

- order customer memiliki assignment aktif ke actor; atau
- `createdById = actorUserId` dan order masih aktif; atau
- actor memiliki all-sales permission.

Status aktif harus menggunakan helper lifecycle terpusat, bukan array status duplikat.

### 5.4 Predicate receivable scope

Invoice masuk scope jika `invoice.salesOrder` masuk order scope. Query harus menerapkan predicate di database, bukan filter hasil di JavaScript.

### 5.5 Mutasi dan object authorization

Semua field mutation harus memanggil assertion server-side:

- create/update order;
- confirm/cancel order jika tersedia di field;
- check-in/check-out visit;
- update customer/prospect;
- create quotation;
- membaca detail order/customer.

UI filtering bukan authorization.

---

## 6. Desain Service dan Action

### 6.1 Service baru

| Service | Tanggung jawab |
|---|---|
| `field-sales-scope-service.ts` | Resolve actor scope dan Prisma predicates |
| `customer-assignment-service.ts` | Assign, reassign, close assignment, invariant primary owner |
| `field-visit-service.ts` | Start/check-in/check-out/sync visit, idempotency, route status |
| `field-prospect-service.ts` | Duplicate check, create prospect + assignment + visit atomik |

### 6.2 Action baru/diubah

| Action | Perubahan |
|---|---|
| `getTodayRoutePlan()` | Tetap session-scoped; dipakai langsung oleh field home |
| `getMyFieldCustomers()` | Query assignment/route/prospect actor |
| `searchFieldCustomers()` | Global summary search terkontrol |
| `getMyFieldSalesOrders()` | Predicate order scope |
| `getMyFieldPipelineStats()` | Predicate sama dengan pipeline list |
| `getMyFieldReceivables()` | Predicate invoice -> scoped order |
| `startFieldVisit()` | Validasi customer/route/EC, buat active server visit atau visit session |
| `startFirstVisitProspect()` | Customer prospect + assignment + visit dalam transaction |
| `completeFieldVisit()` | Notes/photo, complete visit dan route item secara atomik |
| `syncVisitLogsAction()` | Terima `clientVisitId`, EC metadata, route item; idempotent upsert |

### 6.3 Transaction boundaries

#### First visit

Satu transaction:

1. duplicate check final;
2. create customer prospect;
3. create active primary assignment;
4. create visit/check-in record atau visit session;
5. audit log.

Jika salah satu gagal, tidak boleh ada prospect yatim tanpa visit atau assignment.

#### Checkout route customer

Satu transaction:

1. complete `SalesVisit`;
2. update `SalesRoutePlanItem.status = COMPLETED`;
3. simpan notes/photo/EC metadata;
4. audit log.

#### Reassignment

Satu transaction:

1. close primary assignment lama;
2. create primary assignment baru;
3. audit from/to user;
4. opsional: update future unpublished route items jika policy mengharuskan.

---

## 7. Desain Migrasi dan Backfill

Perubahan `prisma/schema.prisma` wajib disertai migration SQL sesuai `AGENTS.md`.

### 7.1 Migration yang disarankan

Folder:

```text
prisma/migrations/20260726_field_sales_scope_first_visit/migration.sql
```

Isi utama:

- create enum customer lifecycle;
- alter `Customer` attribution/lifecycle fields;
- create `CustomerSalesAssignment`;
- alter `SalesVisit` dengan `clientVisitId`, `routePlanItemId`, `isExtraCall`, `extraReason`, review metadata;
- foreign keys dan indexes;
- partial unique index primary assignment aktif;
- idempotency unique index;
- bila diperlukan, tambah reverse relation di Prisma schema.

### 7.2 Strategi backfill ownership

Jangan otomatis menganggap seluruh customer tanpa assignment sebagai milik sales tertentu.

Backfill bertahap:

1. Jika customer memiliki route plan published terbaru yang konsisten ke satu user, jadikan kandidat assignment.
2. Jika tidak, cari creator order customer paling baru atau paling dominan sebagai kandidat, bukan keputusan final.
3. Tulis hasil ke audit report terlebih dahulu:
   - exact candidate;
   - ambiguous multi-sales;
   - no evidence;
   - inactive customer.
4. Auto-apply hanya kandidat confidence tinggi setelah approval bisnis.
5. Ambiguous/unassigned masuk queue admin.

Untuk rollout pertama, field dapat memakai compatibility scope:

```text
assignment aktif
OR route hari ini
OR order aktif yang createdById = actor
```

Compatibility scope harus dihapus setelah coverage assignment mencapai target yang disepakati, bukan dipertahankan tanpa batas.

### 7.3 Data historis visit

- generate `clientVisitId` deterministik untuk visit lama, misalnya prefix `legacy:<visit.id>`;
- `isExtraCall` historis hanya diisi jika evidence kuat;
- jangan menebak `routePlanItemId` untuk kunjungan lama jika timestamp/customer memiliki ambiguity;
- field baru boleh nullable selama backfill/deploy compatibility, lalu diperketat bila aman.

### 7.4 Multi-tenant deployment

Migration diterapkan ke:

- `polyflow`;
- `kiyowo`;
- `melindo_rafia`.

Sebelum deploy:

- verifikasi SQL idempotency dan index names;
- ukur jumlah customer/order/visit per tenant;
- jalankan backfill report per tenant;
- jangan menjalankan destructive reassignment otomatis.

---

## 8. Phased Implementation Plan

### Phase 0 — Contract Lock dan Test Harness

**Tujuan:** mengunci definisi `milik saya` sebelum schema/UI berubah.

Tasks:

- [ ] Setujui policy persona pada §3.2.
- [ ] Setujui ownership table pada §3.1.
- [ ] Setujui lifecycle prospect pada §3.4.
- [ ] Dokumentasikan order history policy pada §3.3.
- [ ] Buat test factory dua sales, tiga customer, mixed orders/invoices/routes/visits.
- [ ] Tambah characterization tests yang membuktikan query existing masih tenant-wide.
- [ ] Inventarisasi semua caller action global yang dipakai `/field/sales`.

Exit criteria:

- definisi scope tidak ambigu;
- fixture lintas-sales tersedia;
- tidak ada perubahan behavior production.

### Phase 1 — Security Containment Tanpa Customer Assignment

**Tujuan:** menghentikan eksposur paling jelas dengan field-specific query menggunakan data yang sudah ada.

Tasks:

- [ ] Tambah field-specific actions, jangan ubah query back-office global.
- [ ] Filter order/pipeline dengan `createdById = session.user.id` sebagai containment sementara.
- [ ] Filter piutang melalui sales order yang dibuat actor.
- [ ] Home stats dan pipeline list memakai predicate identik.
- [ ] Tambah authorization pada field order detail.
- [ ] Customer default sementara = route hari ini + customer dari active order actor + prospect actor setelah schema tersedia.
- [ ] Global customer lookup hanya summary search, bukan full list preload.
- [ ] Tambah test sales A tidak melihat order/invoice sales B.

Catatan:

- Phase ini bukan end-state ownership;
- customer tanpa route/order actor mungkin sementara tidak terlihat;
- admin/sales admin tetap dapat all-tenant melalui policy eksplisit.

Exit criteria:

- tidak ada angka tenant-wide berlabel `Saya`;
- list dan detail memakai authorization yang sama;
- back-office tidak berubah.

### Phase 2 — Customer Assignment Foundation

**Tujuan:** membuat account ownership eksplisit dan dapat diaudit.

Tasks:

- [ ] Tambah schema `CustomerSalesAssignment` dan migration SQL.
- [ ] Tambah assignment service + transaction invariant.
- [ ] Tambah UI admin assignment pada customer list/detail atau `/sales/routes` side panel.
- [ ] Tambah audit trail assign/reassign/unassign.
- [ ] Buat backfill report script read-only.
- [ ] Apply assignment confidence tinggi setelah review.
- [ ] Ubah field-specific query memakai assignment sebagai predicate utama.
- [ ] Tambah tab `Rute Hari Ini`, `Customer Saya`, `Prospek Saya`.

Exit criteria:

- setiap customer aktif target memiliki primary owner atau status explicitly unassigned;
- reassign memiliki histori;
- sales A tidak dapat membuka detail assignment sales B melalui direct URL.

### Phase 3 — Server Route Integration dan Atomic Visit

**Tujuan:** menghapus split-brain route antara server dan localStorage.

Tasks:

- [ ] Field home memanggil `getTodayRoutePlan()` server.
- [ ] `RouteTodaySection` menerima server route payload.
- [ ] Cache route memakai key tenant/user/date/version.
- [ ] Check-in mengirim `routePlanItemId` jika inside route.
- [ ] Checkout mengubah visit dan route item dalam transaction.
- [ ] Supervisor/admin route UI membaca status server yang sama.
- [ ] Hapus logic local-only yang menjadi source of truth.
- [ ] Tambah stale-cache reconciliation saat online kembali.

Exit criteria:

- rute admin muncul di device sales;
- status yang dilihat supervisor sama dengan field;
- refresh/ganti device tidak menghilangkan progress yang sudah sync.

### Phase 4 — First Visit / Prospect Flow

**Tujuan:** sales dapat check-in ke toko baru dalam satu flow lapangan.

Tasks:

- [ ] Tambah lifecycle/attribution customer dan migration.
- [ ] Buat `startFirstVisitProspect()` transaction.
- [ ] Tambah CTA `Mulai Kunjungan` dan pilihan `Toko Baru`.
- [ ] Form minimum nama, telepon, GPS, foto/catatan.
- [ ] Duplicate detection nama/telepon/nearby GPS.
- [ ] Auto assignment ke actor.
- [ ] Auto EC reason `TOKO_BARU`.
- [ ] Tambah prospect verification queue back-office.
- [ ] Batasi credit/order behavior prospect sesuai policy.

Exit criteria:

- toko yang belum ada dapat di-check-in tanpa keluar flow;
- tidak ada visit tanpa customer identity;
- prospect dapat diverifikasi, direassign, atau digabung;
- duplicate warning teruji.

### Phase 5 — Extra Call Persistence dan Offline Idempotency

**Tujuan:** kunjungan offline, EC, dan retry menghasilkan record server yang akurat tanpa duplicate.

Tasks:

- [ ] Tambah `clientVisitId` unique per user.
- [ ] Kirim/persist `isExtraCall`, `extraReason`, dan `routePlanItemId`.
- [ ] Ubah sync menjadi idempotent create-or-return-existing.
- [ ] Server response memetakan client ID ke canonical visit ID.
- [ ] Reconcile local queue per item, bukan menandai seluruh batch sukses secara buta.
- [ ] Validasi partial failure batch.
- [ ] Compliance membaca completed route items; EC membaca visits.
- [ ] Tambah badges Server/Belum Sync/Gagal/Extra/Review.

Exit criteria:

- retry request sama tidak membuat duplicate;
- EC reason terlihat setelah ganti device;
- partial sync failure tidak menandai record gagal sebagai sukses;
- KPI compliance dan EC dapat direkonsiliasi ke data visit.

### Phase 6 — Hardening, Rollout, dan Cleanup

**Tujuan:** menghapus fallback sementara dan memastikan kesiapan produksi.

Tasks:

- [ ] Audit semua `/field/sales` action untuk object authorization.
- [ ] Audit pagination dan payload customer/order tenant besar.
- [ ] Tambah observability sync duplicate/failure.
- [ ] Tambah data-scope audit query per tenant.
- [ ] Hapus compatibility `createdById` scope setelah assignment coverage memenuhi target.
- [ ] Redirect/cleanup twin `/sales/mobile` sesuai plan portal.
- [ ] Update UAT Sales & Distribution khusus field personas.
- [ ] Update help article/SOP admin assignment dan prospect verification.

Exit criteria:

- assignment coverage memenuhi threshold rollout;
- tidak ada query tenant-wide pada field personal surface tanpa permission eksplisit;
- fallback sementara terhapus atau diberi expiry owner/date;
- lint, test, build, dan UAT hijau.

---

## 9. File Touch Map

| Area | File/Folder | Aksi |
|---|---|---|
| Schema | `prisma/schema.prisma` | Assignment, customer lifecycle, visit metadata |
| Migration | `prisma/migrations/20260726_field_sales_scope_first_visit/migration.sql` | SQL multi-tenant |
| Scope | `src/services/sales/field-sales-scope-service.ts` | Baru |
| Assignment | `src/services/sales/customer-assignment-service.ts` | Baru |
| Visit | `src/services/sales/field-visit-service.ts` | Baru/refactor |
| Prospect | `src/services/sales/field-prospect-service.ts` | Baru |
| Field actions | `src/actions/sales/field-sales.ts` | Baru, query personal |
| Customer actions | `src/actions/sales/customer.ts` | Attribution/assignment integration |
| Visit actions | `src/actions/sales/visits.ts` | Atomic + idempotent sync |
| Route actions | `src/actions/sales/route-plans.ts` | Consume/update route item server |
| Home | `src/app/field/sales/page.tsx` | Personal aggregate + server route |
| Customer list | `src/app/field/sales/customers/*` | Scoped tabs + global search |
| Customer detail | `src/app/field/sales/customers/[id]/*` | Object authorization + visit context |
| Orders | `src/app/field/sales/orders/*` | Scoped list/detail/create |
| Receivables | `src/app/field/sales/receivables/*` | Scoped invoice query |
| Visits | `src/app/field/sales/visits/page.tsx` | Server-first reconciliation |
| Route UI | `src/components/field/RouteTodaySection.tsx` | Server payload/cache |
| Check-in UI | `src/components/sales/mobile/VisitCheckInCard.tsx` | Route/EC/prospect flow |
| Sync UI | `src/components/sales/mobile/VisitSyncBanner.tsx` | Per-item idempotent sync |
| Admin customer | `src/app/sales/customers/*` | Assignment + prospect verification |
| Tests | `src/services/sales/__tests__/*`, `src/actions/sales/__tests__/*` | Cross-user scope, visit, migration behavior |
| UAT | `docs/uat/06-sales-distribution.md` | Field sales scenarios |

---

## 10. Test Strategy

### 10.1 Unit tests

- scope resolver untuk `SALES`, `SALES_ADMIN`, `ADMIN`;
- customer predicate assignment aktif/nonaktif;
- order predicate assignment vs creator fallback;
- invoice predicate mengikuti scoped order;
- one active primary assignment invariant;
- first-visit duplicate matching;
- EC classification;
- compliance formula;
- visit idempotency key.

### 10.2 Integration tests

Fixture wajib:

```text
Sales A
  Customer A assigned
  Order A + Invoice A
  Route A + Visit A

Sales B
  Customer B assigned
  Order B + Invoice B
  Route B + Visit B

Customer C unassigned
```

Assertions:

- Sales A tidak melihat Customer/Order/Invoice/Visit B;
- Sales A direct URL ke detail B ditolak/not found;
- Sales Admin melihat A dan B;
- customer route hari ini dapat diakses walau assignment belum selesai backfill;
- EC existing customer dapat dimulai melalui controlled search;
- first visit membuat prospect + assignment + visit atomik;
- transaction rollback tidak meninggalkan prospect yatim;
- duplicate sync mengembalikan visit existing;
- checkout menyelesaikan route item dan visit bersama.

### 10.3 Migration tests

- migration dari schema production snapshot;
- partial unique index menolak dua primary aktif;
- legacy visit mendapat idempotency value valid;
- nullable compatibility fields tidak merusak existing rows;
- migration deploy ke database kosong dan populated.

### 10.4 E2E/UAT

Persona tests:

1. Sales A login dan hanya melihat datanya.
2. Admin assign route Customer A untuk hari ini.
3. Device Sales A melihat route tanpa seed local.
4. Sales A check-in, refresh, dan status tetap `VISITING`.
5. Sales A checkout, supervisor melihat `COMPLETED`.
6. Sales A mencari customer existing di luar route, memilih reason, dan tercatat EC.
7. Sales A mengunjungi toko baru, membuat prospect, check-in, checkout, dan sync.
8. Admin memverifikasi/reassign prospect.
9. Offline checkout lalu retry dua kali hanya menghasilkan satu visit.
10. Sales B tidak dapat membuka ID customer/order Sales A.

### 10.5 Quality gates

Sebelum commit, wajib berurutan:

```bash
npm run lint
npm run test
npm run build
```

Jika schema berubah:

```bash
npx prisma validate
npx prisma generate
```

`prisma generate` tidak menggantikan migration SQL.

---

## 11. Acceptance Criteria Global

### AC-1 — Personal customer scope

Sales hanya melihat customer assignment aktif, route hari ini, dan prospect miliknya pada default field views.

### AC-2 — Personal order/pipeline scope

Order list, active count, pipeline amount, dan next items berasal dari predicate actor yang sama.

### AC-3 — Personal receivable scope

Nilai dan daftar piutang tidak mencakup invoice customer sales lain.

### AC-4 — Object authorization

Mengetahui ID customer/order sales lain tidak memberikan akses detail atau mutasi.

### AC-5 — Server route source of truth

Rute yang dipublish admin muncul di field dan progress tetap konsisten setelah refresh/ganti device.

### AC-6 — First visit

Sales dapat memulai kunjungan toko baru dengan data minimum dan sistem menghasilkan prospect, assignment, serta visit yang terhubung.

### AC-7 — Extra Call persistence

Kunjungan luar route menyimpan flag dan reason di server serta tampil kembali di riwayat lintas device.

### AC-8 — Offline idempotency

Retry payload visit yang sama tidak membuat duplicate database record.

### AC-9 — Admin visibility

Admin/sales admin tetap dapat melihat seluruh tenant melalui permission eksplisit dan UI back-office tidak kehilangan data.

### AC-10 — Multi-tenant safety

Migration dan query bekerja pada seluruh tenant tanpa cross-tenant leakage atau destructive backfill.

---

## 12. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Assignment existing belum lengkap | Sales kehilangan customer yang seharusnya terlihat | Compatibility scope terbatas + backfill report + staged rollout |
| `createdById` dianggap owner permanen | Ownership salah setelah admin create/reassign | Jadikan hanya attribution/fallback sementara |
| Customer duplicate dari first visit | Master data kotor | Search telepon/nama/nearby GPS + verification queue + merge flow |
| Global customer search menjadi data leak | Sales dapat enumerate tenant | Server search minimum chars, result limit, summary fields, rate limit bila perlu |
| Route status dan visit divergen | Compliance salah | Atomic checkout transaction + reconcile job/report |
| Offline photo payload besar | Sync gagal | Existing compression + ukuran maksimum + error per item |
| Batch sync partial failure | Log gagal ditandai sukses | Result per `clientVisitId`, bukan satu boolean batch |
| Migration partial unique index berbeda dari Prisma | Dev/prod drift | SQL review + migration integration test + schema docs |
| Admin workflow bertambah | Assignment/prospect queue terbengkalai | Bulk assign, clear unassigned queue, operational KPI |
| Historical order visibility membingungkan | Sales lama/baru kehilangan konteks | Policy histori eksplisit + supervisor override |

---

## 13. Rollout dan Observability

### 13.1 Feature flags yang disarankan

```text
FIELD_SALES_PERSONAL_SCOPE
FIELD_SALES_SERVER_ROUTE
FIELD_SALES_FIRST_VISIT
FIELD_SALES_IDEMPOTENT_VISIT_SYNC
```

Jika project tidak memiliki runtime feature flag system, rollout dapat per tenant melalui company setting, tetapi jangan menambah flag tanpa owner dan removal date.

### 13.2 Metrics

- persentase customer aktif dengan primary assignment;
- jumlah customer unassigned/ambiguous;
- denied cross-scope access count;
- field customer/order/invoice result count per actor;
- visit sync success/failure/retry/duplicate prevented;
- route assigned vs completed;
- Extra Call count by reason;
- prospect created/verified/merged/rejected;
- median waktu dari prospect create ke verification.

### 13.3 Rollout order

```text
Local/test tenant
  -> satu tenant pilot
  -> assignment coverage review
  -> personal scope enforcement
  -> server route
  -> first visit
  -> idempotent sync
  -> semua tenant
```

Rollback harus mematikan enforcement/fitur melalui flag tanpa menghapus assignment, prospect, atau visit yang sudah dibuat.

---

## 14. Open Decisions Sebelum Implementasi

1. Apakah satu customer secara bisnis hanya boleh punya satu sales aktif, atau boleh primary + supporting reps? Rekomendasi plan: primary + supporting.
2. Apakah owner baru boleh melihat seluruh histori customer? Rekomendasi plan: ya, untuk continuity account.
3. Siapa yang boleh melihat all-sales: hanya `ADMIN`, atau `SALES_ADMIN` juga? Rekomendasi plan: keduanya, dengan permission eksplisit untuk future hardening.
4. Apakah prospect boleh langsung membuat order? Rekomendasi plan: boleh draft/quotation, tetapi confirm mengikuti approval/credit policy.
5. Apakah telepon wajib untuk toko baru? Rekomendasi plan: tidak wajib jika GPS + foto tersedia, agar first visit tidak terblokir.
6. Berapa lama temporary access customer dari EC berlaku? Rekomendasi plan: selama active visit dan periode review terbatas, bukan permanen.
7. Apakah backfill high-confidence boleh auto-apply? Rekomendasi plan: hasil report dahulu, apply hanya setelah sample review bisnis.

Jika belum diputuskan, implementasi berhenti setelah Phase 0. Jangan menebak rule ownership karena dampaknya langsung ke akses data dan operasional sales.

---

## 15. Non-Goals

- CRM Lead/Opportunity entity lengkap; pipeline tetap memakai lifecycle SO/quotation existing.
- Live GPS tracking sales sepanjang hari.
- Full route optimization/TSP.
- Offline-first order creation penuh.
- Auto-merge customer tanpa review.
- Commission calculation per sales.
- Territory/geographic hierarchy lengkap.
- Mengubah query back-office menjadi personal scope.

---

## 16. Definition of Done

Plan dianggap selesai diimplementasikan jika:

- seluruh default surface `/field/sales` memakai personal scope yang teruji;
- admin/sales admin memiliki jalur all-data yang eksplisit;
- customer ownership tersimpan dan memiliki histori assignment;
- route server ditampilkan serta progress di-update atomik dengan visit;
- first visit toko baru tersedia tanpa workaround order wizard;
- EC metadata persisten dan compliance benar;
- offline retry idempotent;
- object authorization diterapkan pada list, detail, dan mutation;
- migration SQL tersedia dan lolos pada seluruh tenant;
- UAT cross-sales, first visit, route, EC, dan offline sync lulus;
- `npm run lint`, `npm run test`, dan `npm run build` lulus berurutan;
- dokumentasi UAT dan SOP admin diperbarui.

---

## 17. Urutan Eksekusi yang Direkomendasikan

```text
Phase 0  Contract lock + fixtures
  -> Phase 1  Security containment
  -> Phase 2  Customer assignment foundation
  -> Phase 3  Server route + atomic visit
  -> Phase 4  First visit / prospect
  -> Phase 5  EC persistence + offline idempotency
  -> Phase 6  Hardening + rollout + cleanup
```

Urutan ini sengaja menempatkan security containment sebelum UX first visit, tetapi menunda enforcement ownership final sampai assignment dan backfill siap. Dengan demikian kebocoran scope dihentikan lebih cepat tanpa langsung menyembunyikan seluruh data customer secara destruktif.
