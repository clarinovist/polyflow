# 📋 Dokumen UAT — PolyFlow ERP System

## Informasi Umum

| Field | Detail |
|-------|--------|
| **Nama Aplikasi** | PolyFlow ERP System |
| **Versi** | v1.0 (Maret 2026) |
| **Jenis Industri** | Manufaktur Plastik (Plastic Converting) |
| **Tanggal Dokumen** | 29 Maret 2026 |
| **Disusun Oleh** | Tim QA PolyFlow |

---

## Apa Itu UAT?

**User Acceptance Testing (UAT)** adalah proses pengujian yang dilakukan oleh pengguna akhir untuk memastikan semua fitur aplikasi **berfungsi sesuai harapan** sebelum digunakan secara penuh di lingkungan produksi.

Dokumen ini berisi **panduan langkah demi langkah** yang bisa diikuti oleh siapa saja (tidak perlu latar belakang teknis) untuk menguji setiap fungsi di aplikasi PolyFlow.

---

## Cara Menggunakan Dokumen Ini

### 1. Persiapan

- Pastikan Anda memiliki akun login di PolyFlow
- Siapkan data contoh (produk, supplier, customer) jika belum ada
- Buka aplikasi di browser (Chrome/Firefox/Edge terbaru)
- Catat versi aplikasi dan tanggal pengujian

### 2. Pelaksanaan Testing

- Buka file UAT sesuai modul yang ingin diuji
- Ikuti setiap **Test Case** dari langkah pertama sampai terakhir
- Di setiap test case, tandai hasilnya:
  - ✅ **LULUS** — Fitur berjalan sesuai harapan
  - ❌ **GAGAL** — Fitur tidak berjalan atau hasil tidak sesuai
  - ⚠️ **SEBAGIAN** — Sebagian berjalan, ada catatan
- Tulis catatan di kolom **Catatan** jika ada temuan

### 3. Pelaporan

Setelah selesai, isi **Tracking Sheet** di bawah ini dan laporkan kepada Project Manager.

---

## Tingkat Prioritas Test Case

| Kode | Arti | Penjelasan |
|------|------|------------|
| **P1** | 🔴 Kritis | Fitur utama yang HARUS berfungsi. Jika gagal, aplikasi tidak bisa dipakai. |
| **P2** | 🟡 Penting | Fitur penting untuk operasional sehari-hari. Jika gagal, ada workaround. |
| **P3** | 🟢 Pelengkap | Fitur pendukung atau tampilan. Jika gagal, tidak menghambat operasional. |

---

## Daftar Peran (Role) Pengguna

Setiap pengguna di PolyFlow memiliki **peran/role** yang menentukan halaman apa saja yang bisa diakses:

| Role | Akses Utama | Keterangan |
|------|-------------|------------|
| **ADMIN** | Semua halaman | Pengelola utama sistem |
| **WAREHOUSE** | `/warehouse` | Staf gudang — kelola stok & penerimaan barang |
| **PRODUCTION** | `/production` | Staf produksi — kelola mesin & work order |
| **FINANCE** | `/finance`, `/dashboard` | Staf keuangan — jurnal, laporan, pembayaran |
| **SALES** | `/sales`, `/dashboard` | Staf penjualan — quotation, order, invoice |
| **PPIC** | `/planning`, `/dashboard` | Staf perencanaan — MRP, jadwal produksi |
| **PROCUREMENT** | `/planning`, `/dashboard` | Staf pengadaan — purchase order, supplier |
| **SUPER ADMIN** | `/admin` | Admin super — kelola tenant & sistem |

---

## Daftar File UAT

| No | File | Modul | Jumlah TC | Prioritas Utama |
|----|------|-------|-----------|-----------------|
| 1 | [01-auth-rbac.md](./01-auth-rbac.md) | Login & Hak Akses | 15 | P1 |
| 2 | [02-dashboard-analytics.md](./02-dashboard-analytics.md) | Dashboard & Analitik | 12 | P2 |
| 3 | [03-master-data.md](./03-master-data.md) | Data Master (Produk, BOM, Mesin) | 25 | P1 |
| 4 | [04-inventory-management.md](./04-inventory-management.md) | Inventori & Stok Opname | 30 | P1 |
| 5 | [05-production-mes.md](./05-production-mes.md) | Produksi & Eksekusi Pabrik | 25 | P1 |
| 6 | [06-sales-distribution.md](./06-sales-distribution.md) | Penjualan & Distribusi | 20 | P1 |
| 7 | [07-purchasing-procurement.md](./07-purchasing-procurement.md) | Pembelian & Pengadaan | 20 | P1 |
| 8 | [08-finance-accounting.md](./08-finance-accounting.md) | Keuangan & Akuntansi | 25 | P1 |
| 9 | [09-warehouse-portal.md](./09-warehouse-portal.md) | Portal Gudang | 12 | P2 |
| 10 | [10-operator-kiosk.md](./10-operator-kiosk.md) | Kiosk Operator Pabrik | 10 | P2 |
| 11 | [11-admin-system.md](./11-admin-system.md) | Admin & Pengaturan Sistem | 10 | P2 |
| 12 | [12-cross-module-integration.md](./12-cross-module-integration.md) | Integrasi Antar Modul | 15 | P1 |

---

## Tracking Sheet — Ringkasan Hasil UAT

Isi tabel ini setelah selesai melakukan UAT pada setiap modul.

| No | Modul | Tester | Tanggal | Total TC | Lulus | Gagal | Sebagian | Status |
|----|-------|--------|---------|----------|-------|-------|----------|--------|
| 1 | Login & Hak Akses | | | 15 | | | | ☐ |
| 2 | Dashboard & Analitik | | | 12 | | | | ☐ |
| 3 | Data Master | | | 25 | | | | ☐ |
| 4 | Inventori | | | 30 | | | | ☐ |
| 5 | Produksi | | | 25 | | | | ☐ |
| 6 | Penjualan | | | 20 | | | | ☐ |
| 7 | Pembelian | | | 20 | | | | ☐ |
| 8 | Keuangan | | | 25 | | | | ☐ |
| 9 | Portal Gudang | | | 12 | | | | ☐ |
| 10 | Kiosk Operator | | | 10 | | | | ☐ |
| 11 | Admin & Sistem | | | 10 | | | | ☐ |
| 12 | Integrasi | | | 15 | | | | ☐ |
| | **TOTAL** | | | **~220** | | | | |

**Status**: ☐ Belum Dimulai / 🔄 Sedang Dikerjakan / ✅ Selesai

---

## Istilah Penting (Glossary)

| Istilah | Arti |
|---------|------|
| **BOM** (Bill of Materials) | Resep/formula produksi — daftar bahan baku yang dibutuhkan untuk membuat 1 produk |
| **SKU** (Stock Keeping Unit) | Kode unik untuk setiap varian produk |
| **WIP** (Work in Progress) | Barang yang sedang dalam proses produksi, belum jadi barang jadi |
| **COGM** (Cost of Goods Manufactured) | Biaya total untuk memproduksi barang |
| **FIFO** (First In First Out) | Sistem pengambilan bahan: yang masuk duluan, dipakai duluan |
| **MRP** (Material Requirements Planning) | Perencanaan kebutuhan bahan baku berdasarkan pesanan |
| **PO** (Purchase Order) | Surat pesanan pembelian ke supplier |
| **SO** (Sales Order) | Surat pesanan penjualan dari customer |
| **GR** (Goods Receipt) | Penerimaan barang masuk dari supplier |
| **DO** (Delivery Order) | Surat jalan pengiriman barang ke customer |
| **AR** (Accounts Receivable) | Piutang — uang yang harus diterima dari customer |
| **AP** (Accounts Payable) | Hutang — uang yang harus dibayar ke supplier |
| **CoA** (Chart of Accounts) | Daftar akun/rekening dalam pembukuan keuangan |
| **Backflush** | Pengurangan otomatis bahan baku dari gudang saat produksi selesai |
| **Stock Opname** | Penghitungan fisik stok di gudang untuk memastikan kesesuaian dengan sistem |
| **Scrap** | Limbah/sisa produksi (Affal Prongkol = gumpalan, Affal Daun = serpihan) |
| **Tenant** | Perusahaan/unit bisnis yang menggunakan PolyFlow secara terpisah |

---

## Environment Testing

| Item | Keterangan |
|------|------------|
| **URL Aplikasi** | *(isi sesuai environment)* |
| **Browser** | Chrome / Firefox / Edge (versi terbaru) |
| **Resolusi Layar** | Desktop: 1920×1080, Mobile: 375×812 |
| **Koneksi Internet** | Stabil, minimal 5 Mbps |

---

**Dokumen ini adalah panduan hidup (living document) yang akan diperbarui sesuai perkembangan fitur PolyFlow.**
