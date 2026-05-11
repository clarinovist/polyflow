# Melindo Fresh-Start Evaluation Plan

> Mode sekarang: evaluasi dan audit dulu. Belum ada perubahan data ke tenant `melindo` / database `melindo_rafia`.

## Goal
Menentukan apakah tenant Melindo Rafia sebaiknya:
1. dipertahankan lalu dibersihkan sebagian,
2. di-zero-kan seluruh angka transaksionalnya,
3. atau di-reset total ke kondisi fresh-start yang siap diisi ulang.

## Context
Tenant production saat ini:
- tenant slug: `melindo`
- subdomain: `melindo.polyflow.uk`
- database: `melindo_rafia`

User mengindikasikan kemungkinan ingin memulai fresh dan mengosongkan seluruh angka yang ada. Karena ini menyentuh data finansial dan inventory, keputusan tidak boleh diambil tanpa audit read-only dan baseline backup.

## Decision Principles
1. Audit dulu, write belakangan.
2. Selalu tenant-first (`melindo`), bukan nama DB mentah.
3. Jika sampai tahap write/reset, backup wajib dibuat dulu.
4. Jangan campur akun yang dikelola UI module ke journal OB jika nanti rebuild opening balance.

## Evaluation Questions
Audit harus menjawab:
1. Apakah `melindo_rafia` berisi transaksi nyata yang masih dipakai?
2. Apakah angka yang ada konsisten atau sudah kacau/placeholder?
3. Apakah lebih murah secara operasional untuk repair vs fresh-start?
4. Jika fresh-start dipilih, apakah master data (COA, products, customers, suppliers, users, locations) ingin dipertahankan?

## Phase 1 — Read-only Audit

### A. Footprint transaksi
Hitung jumlah row inti:
- JournalEntry / JournalLine
- Inventory / StockMovement / StockOpname / StockOpnameItem
- SalesOrder / Invoice / Payment
- PurchaseOrder / PurchaseInvoice / Payment jika ada
- FixedAsset
- ProductionOrder / BOM-related tables (sekadar count)

### B. Financial baseline
Cek secara read-only:
- trial balance ringkas per akun utama
- saldo Opening Balance Equity (30000)
- ada tidaknya AR/AP balance
- nilai inventory total dan distribusinya

### C. Master data baseline
Hitung jumlah:
- Account
- Product / ProductVariant
- Customer
- Supplier
- User
- Location

### D. Fresh-start suitability
Klasifikasikan isi tenant menjadi:
- master data yang layak dipertahankan
- transaksi yang perlu dihapus jika reset
- data anomali yang bikin repair mahal

## Phase 2 — Decision Output

Setelah audit, buat rekomendasi salah satu dari 3 opsi:

### Option A — Keep + repair
Dipilih kalau:
- transaksi sedikit
- struktur masih sehat
- angka cukup dekat dengan target

### Option B — Zero transaction values / cleanup transactional tables
Dipilih kalau:
- master data sudah bagus
- transaksi/angka existing tidak dipercaya
- user ingin mulai ulang tanpa kehilangan COA + master

### Option C — Full reset / reprovision logic
Dipilih kalau:
- tenant kacau total
- bahkan master data juga perlu ditata ulang
- lebih murah mulai dari nol dibanding repair

## Phase 3 — Execution Plan (only after explicit approval)
Jika user memilih reset, rencana write harus mencakup:
1. backup `melindo_rafia`
2. export counts pre-reset
3. FK-safe cleanup order untuk tabel transaksional
4. verification counts post-reset
5. plan rebuild opening balance via OBE + UI modules

## Suggested Read-only Commands
Gunakan guardrail baru:
- `./scripts/tenant-db.sh melindo`
- `./scripts/tenant-psql-read.sh melindo`
- `./scripts/tenant-psql-read.sh melindo /tmp/query.sql`

## Success Criteria
Evaluasi dianggap selesai jika kita bisa menjawab dengan angka konkret:
- berapa banyak transaksi yang ada,
- master data mana yang akan dipertahankan,
- apakah reset parsial atau full reset lebih masuk akal,
- dan apa langkah write paling aman jika nanti disetujui.
