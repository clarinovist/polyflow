# PolyFlow Language Guidelines & Glossary

**Tanggal:** 2026-05-27  
**Status:** Draft acuan untuk UI, marketing, sales, dokumentasi, onboarding, dan training.  
**Tujuan:** Menstandarkan bahasa PolyFlow agar terasa natural untuk pabrik Indonesia tanpa memaksakan terjemahan istilah industri yang sudah lazim.

---

## 1. Rekomendasi Bahasa Utama

PolyFlow sebaiknya menggunakan:

> **Bahasa Indonesia operasional sebagai default, dengan istilah Inggris industri yang sudah lazim tetap dipakai.**

Bukan full English.  
Bukan juga Bahasa Indonesia murni yang memaksa semua istilah diterjemahkan.

Contoh tone ideal:

> “Buat SPK Produksi dari BOM, ambil bahan dari Gudang Bahan Baku, lalu operator input hasil bagus dan scrap lewat Kiosk.”

Kalimat ini natural untuk pabrik Indonesia karena menggabungkan:

- Bahasa Indonesia untuk instruksi kerja,
- istilah industri yang sudah umum: SPK, BOM, scrap, kiosk,
- istilah operasional yang mudah dipahami user lapangan.

---

## 2. Kenapa Bukan Full English?

User PolyFlow kemungkinan campuran:

| Persona | Kebutuhan bahasa |
|---|---|
| Owner / Direktur | Bisa hybrid, peduli angka dan ringkasan. |
| Finance | Familiar dengan invoice, COA, journal, AR/AP, tapi laporan tetap perlu istilah Indonesia. |
| Admin Gudang | Lebih nyaman Bahasa Indonesia operasional. |
| Kepala Produksi | Umumnya nyaman hybrid: SPK, BOM, batch, scrap, shift. |
| Operator | Butuh bahasa sangat sederhana, pendek, dan jelas. |
| Implementor / Developer | Bisa English di kode dan dokumentasi teknis. |

Kalau aplikasi full English, hambatan terbesar muncul di:

- operator,
- gudang,
- user non-finance,
- training awal,
- error handling.

Contoh yang kurang ideal:

> “Start Production Execution”

Lebih baik:

> “Mulai Produksi”

---

## 3. Kenapa Bukan Bahasa Indonesia Murni?

Beberapa istilah sudah lazim di pabrik dan finance. Kalau dipaksa diterjemahkan, malah terasa aneh atau kurang presisi.

Contoh:

| Istilah lazim | Terjemahan paksa yang kurang ideal | Rekomendasi |
|---|---|---|
| SKU | Kode Unit Penyimpanan Stok | SKU |
| BOM | Daftar Bahan | BOM / Formula |
| Work Order | Perintah Kerja | SPK Produksi / Work Order |
| Invoice | Faktur Penagihan | Invoice / Faktur |
| Scrap | Limbah Produksi | Scrap / Reject |
| WIP | Barang Dalam Proses | WIP / Barang Dalam Proses |

Prinsipnya: **terjemahkan untuk kejelasan, pertahankan istilah jika sudah menjadi bahasa kerja.**

---

## 4. Language Principles

### 4.1 Utamakan user lapangan

Jika istilah dipakai oleh operator/gudang, pilih yang paling mudah dipahami.

Contoh:

| Kurang ideal | Lebih baik |
|---|---|
| Issue Material | Ambil Bahan |
| Source Location | Lokasi Asal |
| Destination Location | Lokasi Tujuan |
| Good Quantity | Hasil Bagus |
| Complete Job | Selesaikan SPK |

### 4.2 Gunakan hybrid untuk istilah formal

Untuk istilah yang punya padanan Indonesia tapi istilah Inggrisnya juga lazim, gunakan format:

> Bahasa Indonesia / English abbreviation

Contoh:

- Surat Jalan / DO
- Sales Order / SO
- Purchase Order / PO
- Bagan Akun / COA
- HPP Produksi / COGM
- WIP / Barang Dalam Proses

Setelah user sudah familiar di halaman yang sama, boleh pakai singkatan saja.

### 4.3 Jangan terlalu teknis di UI

Kode, database, dan service boleh English. UI untuk user bisnis harus jelas.

Contoh error teknis:

> Insufficient inventory for material issue.

Lebih baik:

> Stok bahan tidak cukup. Tersedia 80 KG, dibutuhkan 100 KG. Silakan cek lokasi bahan atau lakukan transfer stok terlebih dahulu.

### 4.4 Satu istilah untuk satu konsep

Jangan pakai banyak istilah untuk konsep yang sama.

Contoh buruk:

- Inventory
- Stock
- Persediaan
- Stok Barang

Rekomendasi:

- UI umum: **Stok**
- Finance formal: **Persediaan** jika konteks laporan akuntansi
- Dokumentasi teknis: boleh **Inventory**

### 4.5 Tombol harus berupa aksi pendek

Gunakan kata kerja aktif.

| English | Rekomendasi |
|---|---|
| Create | Buat |
| Save | Simpan |
| Update | Perbarui |
| Delete | Hapus |
| Cancel | Batal |
| Confirm | Konfirmasi |
| Approve | Setujui |
| Reject | Tolak |
| Submit | Kirim |
| Export | Ekspor |
| Import | Impor |
| Print | Cetak |

### 4.6 Hindari jargon marketing di aplikasi

Jangan gunakan frasa seperti:

- transformasi digital,
- seamless experience,
- end-to-end optimization,
- AI-powered excellence,
- operational revolution.

Di aplikasi, pakai bahasa kerja:

- “Stok bahan tidak cukup.”
- “Pilih lokasi tujuan.”
- “SPK belum memiliki bahan.”
- “Invoice berhasil dibuat.”

---

## 5. Tone of Voice

PolyFlow harus terasa:

- jelas,
- praktis,
- tegas,
- tidak bertele-tele,
- tidak menggurui,
- tidak overpromise,
- paham lapangan.

### Contoh tone yang baik

> “Belum ada bahan yang diambil untuk SPK ini.”

> “Stok di lokasi asal tidak cukup untuk transfer.”

> “Opname masih OPEN. Anda masih bisa mengubah atau menghapus session ini.”

> “Order maklon menggunakan item jasa. Bahan customer akan dikonsumsi saat produksi berjalan.”

### Contoh tone yang perlu dihindari

> “An unexpected error occurred while processing your request.”

> “Data invalid.”

> “Operation failed.”

> “You are not authorized to execute this endpoint.”

---

## 6. UI Language by Area

### 6.1 Operator Kiosk

Prioritas: paling sederhana.

Gunakan Bahasa Indonesia pendek.

| English | Rekomendasi |
|---|---|
| Start Job | Mulai SPK |
| Pause Job | Jeda SPK |
| Resume Job | Lanjutkan SPK |
| Complete Job | Selesaikan SPK |
| Good Quantity | Hasil Bagus |
| Scrap Quantity | Scrap / Reject |
| Machine | Mesin |
| Operator | Operator |
| Shift | Shift |
| Report Downtime | Catat Downtime |
| Material Used | Bahan Terpakai |

Contoh instruksi:

> “Masukkan hasil bagus dan scrap untuk SPK ini.”

> “Pastikan bahan sudah diambil sebelum produksi diselesaikan.”

---

### 6.2 Warehouse / Gudang

Prioritas: jelas untuk transaksi fisik.

| English | Rekomendasi |
|---|---|
| Warehouse | Gudang |
| Inventory | Stok |
| Stock Movement | Mutasi Stok |
| Transfer Stock | Transfer Stok |
| Stock Adjustment | Penyesuaian Stok |
| Stock Opname | Stock Opname |
| Goods Receipt | Penerimaan Barang |
| Outgoing | Barang Keluar |
| Incoming | Barang Masuk |
| Source Location | Lokasi Asal |
| Destination Location | Lokasi Tujuan |
| Available Stock | Stok Tersedia |
| Reserved Stock | Stok Terpesan |
| Low Stock | Stok Menipis |

Catatan:

- “Stock Opname” tetap dipakai karena sudah sangat lazim di Indonesia.
- “Mutasi Stok” lebih natural daripada “Stock Movement” untuk user gudang.

---

### 6.3 Production / Produksi

Prioritas: tetap memakai istilah pabrik yang lazim.

| English | Rekomendasi |
|---|---|
| Production | Produksi |
| Production Order | SPK Produksi |
| Work Order | Work Order / SPK |
| Bill of Materials | BOM / Formula |
| Material Issue | Ambil Bahan |
| Material Return | Retur Bahan |
| Production Output | Hasil Produksi |
| Scrap | Scrap / Reject |
| Rework | Rework |
| Batch | Batch |
| Machine | Mesin |
| Downtime | Downtime |
| Yield | Yield |
| Finished Good | Barang Jadi |
| Work in Progress | WIP / Barang Dalam Proses |

Contoh label:

- “Bahan Rencana”
- “Bahan Aktual”
- “Hasil Bagus”
- “Scrap / Reject”
- “Status SPK”
- “Riwayat Produksi”

---

### 6.4 Sales / Penjualan

Gunakan hybrid karena SO, DO, dan invoice sudah lazim.

| English | Rekomendasi |
|---|---|
| Sales | Penjualan |
| Customer | Customer / Pelanggan |
| Sales Quotation | Penawaran Penjualan |
| Sales Order | Sales Order / SO |
| Delivery Order | Surat Jalan / DO |
| Invoice | Invoice / Faktur |
| Sales Return | Retur Penjualan |
| Payment | Pembayaran |
| Due Date | Jatuh Tempo |
| Outstanding | Belum Dibayar |
| Paid | Lunas |
| Overdue | Lewat Jatuh Tempo |

Catatan:

- Pilih “Customer” atau “Pelanggan” secara konsisten. Untuk konteks pabrik B2B, **Customer** sering lebih natural.
- “Surat Jalan / DO” lebih cocok daripada hanya “Delivery Order”.

---

### 6.5 Purchasing / Pembelian

| English | Rekomendasi |
|---|---|
| Purchasing | Pembelian |
| Supplier | Supplier |
| Purchase Request | Permintaan Pembelian / PR |
| Purchase Order | Purchase Order / PO |
| Goods Receipt | Penerimaan Barang |
| Purchase Invoice | Invoice Pembelian |
| Purchase Return | Retur Pembelian |
| Unit Price | Harga Satuan |
| Lead Time | Lead Time |
| Received Quantity | Qty Diterima |
| Ordered Quantity | Qty Pesanan |

Catatan:

- “Supplier” lebih lazim daripada “Pemasok” di banyak pabrik.
- “PO” dan “PR” boleh dipakai setelah istilah lengkap muncul.

---

### 6.6 Finance / Accounting

Finance bisa lebih hybrid dan formal.

| English | Rekomendasi |
|---|---|
| Finance | Finance |
| Accounting | Akuntansi |
| Chart of Accounts | Bagan Akun / COA |
| Journal Entry | Jurnal |
| General Ledger | Buku Besar / GL |
| Balance Sheet | Neraca |
| Income Statement | Laba Rugi |
| Cashflow | Arus Kas / Cashflow |
| Accounts Receivable | Piutang / AR |
| Accounts Payable | Utang / AP |
| Fiscal Period | Periode Fiskal |
| Fixed Asset | Aset Tetap |
| Budget | Anggaran / Budget |
| Costing | Costing / HPP |
| COGM | HPP Produksi / COGM |
| COGS | HPP Penjualan / COGS |
| WIP Valuation | Valuasi WIP |

Catatan:

- Untuk user umum, gunakan **HPP**.
- Untuk finance advanced, boleh tampilkan COGM/COGS sebagai istilah tambahan.

---

### 6.7 Admin / System

| English | Rekomendasi |
|---|---|
| Settings | Pengaturan |
| Users | User |
| Roles | Role |
| Permissions | Hak Akses |
| Audit Logs | Log Audit |
| System Health | Status Sistem |
| Database Assistant | Asisten Database |
| Tenant | Tenant |
| API Key | API Key |

Catatan:

- Untuk istilah teknis seperti Tenant dan API Key, tetap English.
- Jika user admin non-teknis, beri helper text.

---

## 7. Navigation Recommendation

### Menu utama yang disarankan

| Current / English | Rekomendasi menu |
|---|---|
| Dashboard | Dashboard |
| Inventory | Stok |
| Warehouse | Gudang |
| Production | Produksi |
| Planning | Planning |
| Sales | Penjualan |
| Purchasing | Pembelian |
| Finance | Finance |
| Analytics | Analitik |
| Reports | Laporan |
| Settings | Pengaturan |
| Support | Bantuan |

Catatan:

- “Dashboard” tetap dipakai.
- “Finance” boleh tetap karena lazim; alternatif “Keuangan” jika ingin lebih Indonesia.
- “Planning” bisa tetap jika modul berisi MRP/schedule; alternatif “Perencanaan”. Pilih salah satu dan konsisten.

Rekomendasi final:

- Untuk aplikasi operasional: **Perencanaan**.
- Untuk user advanced/manufacturing: **Planning** masih acceptable.

---

## 8. Status Labels

### Status umum

| English | Rekomendasi |
|---|---|
| Draft | Draft |
| Open | Open |
| Pending | Menunggu |
| Approved | Disetujui |
| Rejected | Ditolak |
| Cancelled | Dibatalkan |
| Completed | Selesai |
| Closed | Ditutup |
| In Progress | Berjalan |
| Released | Dirilis |
| Posted | Diposting |
| Void | Dibatalkan / Void |

Catatan:

- “Draft” tetap lazim.
- “Open” lazim untuk session/document; kalau user lapangan, bisa “Aktif”.
- “Void” untuk finance perlu hati-hati, bisa ditampilkan sebagai “Void / Dibatalkan”.

### Invoice/payment status

| English | Rekomendasi |
|---|---|
| Unpaid | Belum Dibayar |
| Partially Paid | Dibayar Sebagian |
| Paid | Lunas |
| Overdue | Lewat Jatuh Tempo |
| Cancelled | Dibatalkan |

---

## 9. Date, Number, and Unit Format

### Tanggal

Gunakan format Indonesia:

- `27 Mei 2026` untuk tampilan formal.
- `27/05/2026` untuk tabel padat.
- Hindari `05/27/2026` karena format US membingungkan.

### Angka

Gunakan format Indonesia:

- `1.250,50 KG`
- `Rp 12.500.000`
- `15,75%`

### Unit

Gunakan uppercase untuk unit:

- KG
- ROLL
- BAL
- PCS
- ZAK

Label UI:

- “Qty” boleh dipakai di tabel padat.
- “Jumlah” lebih baik untuk form yang dibaca user umum.

Rekomendasi:

- Tabel: `Qty`
- Form: `Jumlah`
- Report: `Kuantitas` jika formal

---

## 10. Error Message Guidelines

Error yang baik harus menjawab:

1. Apa yang salah?
2. Kenapa terjadi?
3. User harus melakukan apa?

### Format

> [Masalah]. [Detail angka/konteks]. [Aksi yang disarankan].

### Contoh

#### Stok tidak cukup

Kurang ideal:

> Insufficient stock.

Baik:

> Stok bahan tidak cukup. Tersedia 80 KG, dibutuhkan 100 KG. Silakan pilih lokasi lain atau transfer stok terlebih dahulu.

#### Data wajib kosong

Kurang ideal:

> Validation failed.

Baik:

> Customer wajib dipilih sebelum Sales Order disimpan.

#### Tidak punya akses

Kurang ideal:

> Unauthorized.

Baik:

> Anda belum punya akses untuk membuka halaman ini. Hubungi admin jika akses ini diperlukan.

#### Data tidak bisa dihapus

Kurang ideal:

> Delete failed.

Baik:

> Data tidak bisa dihapus karena sudah memiliki transaksi terkait.

#### Periode finance terkunci

Baik:

> Periode fiskal sudah ditutup. Transaksi baru tidak bisa diposting ke periode ini.

---

## 11. Empty State Guidelines

Empty state jangan hanya “No data”. Beri konteks dan CTA.

### Contoh

#### Produk kosong

> Belum ada produk. Buat produk pertama untuk mulai mencatat stok dan transaksi produksi.

CTA: `Buat Produk`

#### Stock movement kosong

> Belum ada mutasi stok untuk filter ini. Coba ubah tanggal, lokasi, atau tipe transaksi.

CTA: `Reset Filter`

#### Production order kosong

> Belum ada SPK Produksi. Buat SPK dari produk dan BOM yang sudah disiapkan.

CTA: `Buat SPK Produksi`

#### Invoice kosong

> Belum ada invoice. Invoice bisa dibuat dari Sales Order atau secara manual sesuai kebutuhan.

CTA: `Buat Invoice`

---

## 12. Confirmation Dialog Guidelines

Untuk aksi aman:

> “Simpan perubahan?”

Untuk aksi berisiko:

> “Hapus produk ini?”  
> Produk yang sudah memiliki transaksi tidak dapat dihapus. Jika hanya tidak dipakai lagi, nonaktifkan produk.

Untuk finance/posting:

> “Posting jurnal ini?”  
> Setelah diposting, jurnal akan masuk ke laporan keuangan periode terkait.

Untuk void/cancel:

> “Batalkan invoice ini?”  
> Invoice yang dibatalkan tidak akan ditagihkan lagi. Pastikan pembayaran dan jurnal terkait sudah diperiksa.

---

## 13. Glossary Utama

| Concept | UI Recommendation | Catatan |
|---|---|---|
| Inventory | Stok | Untuk UI umum. |
| Stock | Stok | Gunakan konsisten. |
| Product | Produk |  |
| Product Variant | Varian Produk |  |
| SKU | SKU | Jangan diterjemahkan. |
| Location | Lokasi |  |
| Warehouse | Gudang |  |
| Stock Movement | Mutasi Stok |  |
| Transfer | Transfer | Lazim. |
| Adjustment | Penyesuaian |  |
| Stock Opname | Stock Opname | Lazim di Indonesia. |
| Raw Material | Bahan Baku |  |
| Packaging | Packaging | Bisa “Bahan Packaging” jika konteks produk. |
| WIP | WIP / Barang Dalam Proses |  |
| Finished Good | Barang Jadi |  |
| Scrap | Scrap / Reject |  |
| BOM | BOM / Formula | Jangan hanya “Daftar Bahan”. |
| Production Order | SPK Produksi |  |
| Work Order | Work Order / SPK |  |
| Material Issue | Ambil Bahan | Untuk UI lapangan. |
| Goods Receipt | Penerimaan Barang |  |
| Sales Order | Sales Order / SO |  |
| Purchase Order | Purchase Order / PO |  |
| Delivery Order | Surat Jalan / DO |  |
| Invoice | Invoice / Faktur |  |
| Customer | Customer | Alternatif: Pelanggan. Pilih konsisten. |
| Supplier | Supplier | Lebih lazim daripada Pemasok. |
| Payment | Pembayaran |  |
| Journal | Jurnal |  |
| Chart of Accounts | Bagan Akun / COA |  |
| AR | Piutang / AR |  |
| AP | Utang / AP |  |
| HPP | HPP | Untuk user Indonesia. |
| COGS | HPP Penjualan / COGS | Finance advanced. |
| COGM | HPP Produksi / COGM | Finance advanced. |
| WIP Valuation | Valuasi WIP |  |
| Maklon | Maklon | Jangan diterjemahkan. |
| Customer-owned Material | Bahan Milik Customer |  |
| Kiosk | Kiosk | Lazim untuk mode operator; bisa “Kiosk Operator”. |
| Dashboard | Dashboard | Lazim. |
| Report | Laporan |  |
| Analytics | Analitik |  |

---

## 14. Recommended Priority for Language Cleanup

Jika nanti UI ingin dirapikan, urutannya:

### Phase 1 — Glossary dan navigasi

- Tetapkan istilah resmi.
- Rapikan menu utama.
- Rapikan label modul paling sering dibuka.

### Phase 2 — Operator Kiosk dan Gudang

Prioritas tertinggi karena user lapangan paling sensitif terhadap bahasa.

- Kiosk actions.
- Material issue.
- Output/scrap.
- Transfer stock.
- Stock opname.
- Error stok tidak cukup.

### Phase 3 — Produksi

- SPK Produksi.
- BOM / Formula.
- Production history.
- Machine/shift/downtime.

### Phase 4 — Sales dan Purchasing

- SO/PO/DO/Invoice label.
- Customer/supplier forms.
- Status dokumen.

### Phase 5 — Finance

- Reports.
- COA.
- Journal.
- Costing.
- WIP/COGM/COGS.

---

## 15. Implementation Notes for Product Team

### Jangan ubah database enum dulu

Untuk tahap awal, cukup ubah UI labels dan copy.

Contoh enum tetap:

- `RAW_MATERIAL`
- `FINISHED_GOOD`
- `IN_PROGRESS`
- `COMPLETED`

UI menampilkan:

- `Bahan Baku`
- `Barang Jadi`
- `Berjalan`
- `Selesai`

### Buat mapping label terpusat

Idealnya buat file mapping seperti:

- `src/lib/labels.ts`
- `src/lib/i18n/id.ts`
- atau `src/lib/domain-labels.ts`

Contoh konsep:

```ts
export const productTypeLabels = {
  RAW_MATERIAL: 'Bahan Baku',
  INTERMEDIATE: 'Intermediate / WIP',
  PACKAGING: 'Packaging',
  WIP: 'WIP / Barang Dalam Proses',
  FINISHED_GOOD: 'Barang Jadi',
  SCRAP: 'Scrap / Reject',
};
```

### Hindari hardcoded campur-campur

Jangan setiap halaman membuat label sendiri karena nanti istilah tidak konsisten.

### Pertimbangkan i18n belakangan

Kalau market awal Indonesia, tidak perlu langsung implement full i18n multi-language. Mulai dari standard label mapping dulu.

Full i18n diperlukan jika:

- target customer multinational,
- user harus bisa switch EN/ID,
- dokumentasi resmi bilingual,
- ada investor/partner enterprise yang butuh English UI.

---

## 16. Marketing Language vs App Language

### Marketing

Marketing boleh lebih emosional dan outcome-driven.

Contoh:

> “HPP tidak lagi kira-kira.”

> “Tidak ada lagi stok versi gudang, versi admin, dan versi Excel.”

### App UI

App UI harus jelas dan langsung.

Contoh:

> “Stok bahan tidak cukup.”

> “SPK berhasil diselesaikan.”

> “Invoice berhasil dibuat.”

### Documentation / SOP

Dokumentasi boleh lebih lengkap dan edukatif.

Contoh:

> “Untuk order maklon, bahan milik customer tidak dikeluarkan lewat shipment sales. Bahan dikonsumsi saat production execution berjalan.”

---

## 17. Final Recommendation

Gunakan gaya bahasa berikut sebagai standar PolyFlow:

> **Bahasa Indonesia untuk instruksi dan navigasi, istilah Inggris untuk konsep industri yang memang lazim, dan hybrid untuk istilah formal yang perlu presisi.**

Prioritas pertama jika ingin mengubah aplikasi:

1. Kiosk operator.
2. Warehouse/gudang.
3. Production/SPK.
4. Error messages.
5. Navigation/menu.
6. Finance/reporting.

Jangan mulai dari rewrite teknis besar. Mulai dari glossary, label mapping, dan halaman paling sering dipakai user lapangan.
