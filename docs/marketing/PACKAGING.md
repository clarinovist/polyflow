# PolyFlow Packaging & Modularization Strategy

**Tanggal:** 2026-05-27  
**Tujuan:** Membuat PolyFlow terasa modular untuk market, sales, pricing, demo, dan onboarding tanpa harus langsung memecah arsitektur teknis.

---

## 1. Prinsip Packaging

PolyFlow harus dijual sebagai sistem modular bertahap:

1. Mulai dari pain paling urgent.
2. Implementasi kecil tapi berhasil.
3. Data operasional mulai disiplin.
4. Baru naik ke costing, finance, dan integrasi lebih kompleks.

Jangan memaksa customer membeli atau mengimplementasikan “full ERP” sejak awal.

### Prinsip utama

- **Commercial modularity dulu, technical modularity belakangan.**
- Paket harus mudah dipahami owner non-teknis.
- Entry package harus punya value cepat.
- Paket premium harus terkait ROI jelas: margin, HPP, efisiensi, kontrol.
- Accounting/finance jangan selalu jadi entry point karena sensitif dan onboarding berat.

---

## 2. Struktur Paket yang Direkomendasikan

### Paket 1 — PolyFlow Stock Control

**Target:** pabrik yang stoknya sering selisih.

**Value proposition:**

> “Stop selisih stok gudang vs produksi.”

**Masalah yang diselesaikan:**

- Stok raw material dan finished goods tidak akurat.
- Transfer antar lokasi tidak tercatat rapi.
- Stock opname masih manual.
- Owner tidak tahu stok available yang benar.

**Fitur utama:**

- Product & SKU management.
- Product variant dan unit dasar.
- Dual-unit basic: KG, ROLL, BAL, PCS, ZAK.
- Multi-location inventory.
- Stock movement: IN, OUT, TRANSFER, ADJUSTMENT.
- Stock opname session.
- Low-stock alert.
- Warehouse portal.
- Inventory dashboard.

**Persona buyer:** owner, kepala gudang, operational manager.

**Demo utama:**

1. Buat produk dan varian.
2. Terima bahan masuk.
3. Transfer ke lokasi produksi.
4. Lakukan adjustment/opname.
5. Lihat movement audit trail.

**Exit criteria implementasi:**

- 80% transaksi gudang harian masuk PolyFlow.
- Minimal 1 stock opname selesai.
- Tim gudang bisa baca stok per lokasi.

---

### Paket 2 — PolyFlow Production Control

**Target:** pabrik yang produksi masih black box.

**Value proposition:**

> “Tahu bahan keluar berapa, hasil jadi berapa, scrap berapa, dan order mana yang bermasalah.”

**Masalah yang diselesaikan:**

- Material issue tidak tercatat real-time.
- Hasil produksi dan scrap telat direkap.
- Work order tidak punya jejak bahan.
- Produksi over/under issue tanpa visibility.
- Operator tidak cocok memakai dashboard ERP penuh.

**Fitur utama:**

- Semua fitur Stock Control.
- BOM/formula.
- Production order/work order.
- Material issue.
- Production execution.
- Operator kiosk.
- Good output dan scrap/reject.
- Machine master.
- Shift/operator tracking basic.
- Production history.

**Persona buyer:** owner, kepala produksi, supervisor, kepala gudang.

**Demo utama:**

1. Buat BOM produk.
2. Buat production order.
3. Issue bahan dari gudang/lokasi produksi.
4. Operator input output dan scrap via kiosk.
5. Lihat production history dan stock impact.

**Exit criteria implementasi:**

- Minimal 10 work order berjalan penuh dari issue bahan sampai output.
- Scrap tercatat per order.
- Stok bahan berkurang dan finished goods bertambah sesuai flow.

---

### Paket 3 — PolyFlow Business Control

**Target:** pabrik yang ingin stok, produksi, sales, purchasing, dan finance lebih terhubung.

**Value proposition:**

> “Kontrol operasional dan angka bisnis dari order sampai HPP.”

**Masalah yang diselesaikan:**

- Sales, purchasing, produksi, dan finance memakai data berbeda.
- HPP tidak nyambung ke transaksi produksi.
- Invoice, delivery, PO, dan stock tidak sinkron.
- Finance kesulitan menghitung WIP dan COGM.

**Fitur utama:**

- Semua fitur Production Control.
- Sales quotation/order.
- Delivery order.
- Sales invoice.
- Purchase request/order.
- Goods receipt.
- Purchase invoice.
- Standard cost history.
- Actual costing.
- COGM.
- WIP valuation.
- AR/AP tracking.
- Basic financial reports.

**Persona buyer:** owner, finance manager, operation manager.

**Demo utama:**

1. Sales order masuk.
2. Demand masuk ke production/procurement.
3. Production execution mencatat bahan dan output.
4. Delivery dan invoice dibuat.
5. Lihat costing dan margin.

**Exit criteria implementasi:**

- Minimal 1 siklus order-to-cash selesai.
- Minimal 1 siklus procure-to-pay selesai.
- Finance bisa melihat costing per order/produk prioritas.

---

### Paket 4 — PolyFlow Maklon Add-on

**Target:** pabrik jasa maklon plastik atau pabrik yang menerima bahan customer.

**Value proposition:**

> “Pisahkan bahan milik customer dari stok perusahaan tanpa Excel terpisah.”

**Masalah yang diselesaikan:**

- Bahan customer tercampur dengan bahan perusahaan.
- Stok titipan tidak jelas sisa dan pemakaiannya.
- Sales order maklon diperlakukan seperti penjualan barang biasa.
- Invoice jasa dan konsumsi bahan tidak sinkron.

**Fitur utama:**

- Customer-owned location.
- Receive bahan titipan.
- Sales order tipe Maklon Jasa.
- Service item untuk invoice jasa.
- Work order maklon.
- Consumption bahan customer saat produksi.
- Off-balance material movement.
- Return bahan customer.
- Maklon cost item.

**Persona buyer:** owner, kepala produksi, finance, admin sales maklon.

**Demo utama:**

1. Receive bahan customer ke lokasi customer-owned.
2. Buat SO Maklon Jasa.
3. Jalankan work order maklon.
4. Konsumsi bahan customer saat production execution.
5. Invoice jasa.
6. Lihat sisa/return bahan customer.

**Exit criteria implementasi:**

- Minimal 3 order maklon tercatat end-to-end.
- Bahan customer tidak bercampur dengan stok internal.
- Finance bisa invoice jasa tanpa mengakui bahan sebagai inventory perusahaan.

---

## 3. Module Matrix

| Modul / Fitur | Stock Control | Production Control | Business Control | Maklon Add-on |
|---|:---:|:---:|:---:|:---:|
| Product & SKU | ✅ | ✅ | ✅ | ✅ |
| Dual Unit | ✅ Basic | ✅ | ✅ | ✅ |
| Multi-location Inventory | ✅ | ✅ | ✅ | ✅ |
| Stock Movement | ✅ | ✅ | ✅ | ✅ |
| Stock Opname | ✅ | ✅ | ✅ | ✅ |
| Warehouse Portal | ✅ | ✅ | ✅ | ✅ |
| BOM / Formula | ❌ | ✅ | ✅ | ✅ |
| Production Order | ❌ | ✅ | ✅ | ✅ |
| Material Issue | ❌ | ✅ | ✅ | ✅ |
| Operator Kiosk | ❌ | ✅ | ✅ | ✅ |
| Output & Scrap | ❌ | ✅ | ✅ | ✅ |
| Machine & Shift | ❌ | ✅ Basic | ✅ | ✅ |
| Sales Order | ❌ | Optional | ✅ | ✅ Service-based |
| Delivery Order | ❌ | Optional | ✅ | Optional |
| Purchase Order | ❌ | Optional | ✅ | Optional |
| Goods Receipt | ✅ Basic | ✅ | ✅ | ✅ Customer material receipt |
| Standard Cost | ❌ | Basic | ✅ | ✅ |
| Actual Costing | ❌ | Basic | ✅ | ✅ |
| WIP / COGM | ❌ | ❌/Basic | ✅ | ✅ |
| AR/AP | ❌ | ❌ | ✅ | Optional |
| Full Accounting | ❌ | ❌ | ✅ | Optional |
| Customer-owned Stock | ❌ | ❌ | Optional | ✅ |
| Maklon SO Flow | ❌ | ❌ | Optional | ✅ |
| Maklon Material Return | ❌ | ❌ | Optional | ✅ |

---

## 4. Recommended Entry Path

### Path A — Stok dulu

Cocok untuk customer yang belum disiplin transaksi gudang.

Urutan:

1. Stock Control.
2. Production Control.
3. Costing basic.
4. Business Control.

Risiko rendah karena tidak langsung menyentuh accounting dan flow produksi kompleks.

### Path B — Produksi dulu

Cocok untuk customer yang owner-nya paling pusing bahan, output, dan scrap.

Urutan:

1. Production Control dengan produk prioritas.
2. Stock Control dipakai sebagai fondasi.
3. Costing basic.
4. Business Control.

Risiko sedang karena butuh training operator/supervisor.

### Path C — Maklon dulu

Cocok untuk customer yang punya pain spesifik bahan customer.

Urutan:

1. Maklon Add-on + Stock Control terbatas.
2. Work order maklon.
3. Invoice jasa.
4. Costing dan return bahan.

Risiko sedang, tapi diferensiasi tinggi.

### Path D — Full business rollout

Hanya untuk customer yang sudah siap data, tim, dan sponsor internal kuat.

Urutan:

1. Master data cleanup.
2. Stock + production.
3. Sales + purchasing.
4. Finance/accounting.
5. Reporting and optimization.

Risiko tinggi. Jangan jadikan default beta.

---

## 5. Pricing Direction

Catatan: angka final harus divalidasi lewat market conversation. Struktur di bawah adalah arah, bukan harga final wajib.

### Komponen pricing

1. **Implementation / setup fee**
   - Master data setup.
   - Workflow mapping.
   - Training.
   - Data import.
   - Go-live assistance.

2. **Monthly subscription**
   - Berdasarkan paket.
   - Bisa dibedakan berdasarkan lokasi, user, atau transaksi.

3. **Add-on fee**
   - Maklon.
   - Advanced costing.
   - Custom report.
   - Integration.
   - Dedicated support.

### Rekomendasi model awal

Jangan mulai dengan terlalu banyak variable pricing. Buat sederhana:

| Paket | Harga relatif | Catatan |
|---|---:|---|
| Stock Control | Entry | Murah cukup untuk masuk dan validasi. |
| Production Control | Core | Paket utama yang harus paling sering dijual. |
| Business Control | Premium | Untuk customer yang sudah siap integrasi sales/purchase/finance. |
| Maklon Add-on | Add-on premium | Harga berdasarkan kompleksitas dan volume order maklon. |

### Pilot pricing

Untuk beta/pilot, gunakan paket 30-45 hari:

- Scope terbatas.
- 1-2 lokasi.
- 1 lini produksi.
- 5-20 SKU prioritas.
- 1-3 user admin, 1-5 user operator/gudang.
- Weekly review.

Tujuan pilot bukan revenue maksimal. Tujuan pilot:

1. Membuktikan value.
2. Mendapat testimonial.
3. Mendapat data implementasi.
4. Menemukan objection nyata.
5. Menghasilkan case study.

---

## 6. Technical Modularization Ringan Nanti

Tidak perlu microservice. Kalau nanti masuk implementasi produk, cukup mulai dari feature gating.

### Konsep tenant module config

Contoh modul:

- `inventory`
- `warehouse`
- `production`
- `operator_kiosk`
- `sales`
- `purchasing`
- `finance`
- `costing`
- `maklon`
- `analytics`

### Dampak UI

- Sidebar hanya menampilkan modul aktif.
- Dashboard menyesuaikan paket.
- Admin tenant bisa melihat paket aktif.
- Demo environment bisa dibuat per paket.
- Sales bisa demo lebih fokus.

### Kenapa jangan sekarang langsung besar

Karena nilai marketing bisa diuji dulu tanpa refactor besar. Kalau packaging terbukti diterima market, baru feature gating teknis menjadi prioritas.

---

## 7. Demo Packaging

Buat minimal 4 demo environment/script:

1. **Stock Demo** — 10 menit.
2. **Production Demo** — 20 menit.
3. **Costing Demo** — 20 menit.
4. **Maklon Demo** — 20 menit.

Setiap demo harus punya:

- persona target,
- problem opening,
- data sample,
- expected aha moment,
- CTA setelah demo.

---

## 8. Packaging Copy

### Stock Control

> Cocok untuk pabrik yang ingin merapikan stok bahan, WIP, dan barang jadi sebelum masuk ke kontrol produksi penuh.

### Production Control

> Cocok untuk pabrik yang ingin setiap work order punya jejak bahan, output, scrap, dan status real-time.

### Business Control

> Cocok untuk pabrik yang ingin menghubungkan produksi dengan sales, purchasing, invoice, HPP, dan laporan finance.

### Maklon Add-on

> Cocok untuk pabrik jasa maklon yang perlu memisahkan bahan customer dari stok perusahaan, namun tetap mencatat pemakaian dan invoice jasa secara rapi.

---

## 9. Keputusan Rekomendasi

Untuk 3 bulan pertama, fokus jual:

1. **Production Control** sebagai paket utama.
2. **Stock Control** sebagai entry package untuk customer yang belum siap produksi.
3. **Maklon Add-on** sebagai diferensiasi niche.
4. **Business Control** hanya untuk customer yang sudah mature atau setelah pilot berhasil.

Jangan menjual finance/accounting sebagai headline utama. Jadikan finance sebagai nilai lanjutan setelah stok dan produksi valid.
