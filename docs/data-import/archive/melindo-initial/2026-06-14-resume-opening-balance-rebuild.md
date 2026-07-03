# Resume — Melindo Opening Balance Rebuild
Tanggal: 14 Juni 2026

---

## Latar Belakang

Admin Melindo sudah mengupdate Google Sheet dengan data terbaru:
- Neraca (NR_opening) sudah balance: Total Aset = Total Hutang+Ekuitas = Rp 3,481,696,221.37
- Data AR (11 invoices), AP (106 tagihan), Inventory (192 item), Fixed Asset (89 aset) sudah diisi lengkap
- 2 sheet baru ditambahkan: NR_opening (Neraca) dan LR_Opening (Laba Rugi)
- Angka berbeda dari staging lama → perlu rebuild total

Jurnal lama (OB-MEL-2026-0001) sudah POSTED ke DB dengan angka lama → perlu di-replace.

---

## Yang Dikerjakan

### 1. Audit COA Melindo
- Cek seluruh akun yang ada di `melindo_rafia`
- Menemukan: akun AR (1-115), Hutang Dagang (2-110), Fixed Assets (1-212/213/215), dan akumulasi penyusutan TIDAK ADA di DB
- Semua akun yang ada pakai suffix 'b' untuk Rafia (misal: 1-115b, 2-110b, 1-212b)
- Akun 3-201b Laba Tahun Berjalan tidak ada → perlu dibuat

### 2. Reverse Jurnal Lama
- Hapus OB-MEL-2026-0001 (21 JournalLines + 1 JournalEntry)
- Backup sebelum reverse: `/opt/backups/polyflow/melindo_pre_ob_rebuild_20260614_142831.dump`

### 3. Posting Jurnal Baru (OB-MEL-2026-0002)
- Source: NR_opening dari Google Sheet
- 27 JournalLines, status POSTED
- Debit = Credit = Rp 4,584,202,687.69
- Bridge 1-199: AR debit Rp 192.5M + AP credit Rp 1.6M

**Akun yang diposting langsung ke GL:**
| Akun | Debit | Credit |
|------|-------|--------|
| 1-112 Kas Kecil | 22,692,766 | - |
| 1-113 Bank Mandiri | 9,169,511 | - |
| 1-114 Bank BCA | 635,384 | - |
| 1-116b Pajak Dibayar Dimuka | 647,584,521 | - |
| 1-117 Piutang Karyawan | 15,040,000 | - |
| 1-125 Sewa Dibayar Dimuka | 51,502,003 | - |
| 1-127 Bahan Penolong | 3,650,432 | - |
| 1-133 Uang Muka ke Supplier | 45,204,716 | - |
| 1-130 Bahan Baku | 415,987,052 | - |
| 1-131 Bahan Kemasan | 118,213,686 | - |
| 1-132 Barang Dalam Proses | 26,546,600 | - |
| 1-128 Barang Jadi | 308,169,441 | - |
| 1-134 Alat Tulis | 4,994,323 | - |
| 1-212b Bangunan | 394,643,000 | - |
| 1-213b Mesin | 2,201,648,880 | - |
| 1-214 Kendaraan | 27,000,000 | - |
| 1-215b Peralatan Kantor | 98,993,009 | - |
| 1-199 Bridge (AR) | 192,527,366 | - |
| 1-216b Akum Depr Bangunan | - | 95,501,581 |
| 1-217b Akum Depr Mesin | - | 921,353,337 |
| 1-218 Akum Depr Kendaraan | - | 843,750 |
| 1-219b Akum Depr Peralatan | - | 84,807,798 |
| 1-199 Bridge (AP) | - | 1,604,281,151 |
| 2-120b PPN Keluaran | - | 667,916,028 |
| 2-390 Hutang Nugroho | - | 681,000,000 |
| 3-200b Laba Ditahan | - | 355,473,088 |
| 3-201b Laba Tahun Berjalan | - | 173,025,954 |

### 4. AR Injection (11 Invoices)
- 11 SalesOrders (status CONFIRMED) + 11 Invoices (status UNPAID)
- Total: Rp 192,527,366
- Customers: JOY PLASTIK, SANTOSO JAYA, SAUDIN, SAHABAT ABADI, HILAL GEMILANG, RUKUN SEJAHTERA, WIDOKO, RIBUT SNACK, WAHYU PURNO WIDODO (x2), BAROKAH PLASTIK

### 5. AP Injection (106 Tagihan)
- 106 PurchaseOrders (status RECEIVED) + 106 PurchaseInvoices (status UNPAID)
- Total: Rp 1,604,281,151
- Supplier terbesar: Fadila (92 tagihan, Rp 1.48M)
- Supplier lain: Intera Lestari (5), Solo Multipacking (1), Bahana Buanabox (2), Keisha Chemicals (1), Rukun Sejahtera (1), Sahabat Abadi (2), Guwatirta (2)

### 6. Fixed Asset Injection (89 Aset)
- 89 FixedAsset rows terdaftar
- 4 kategori: BANGUNAN (5), MESIN (52), KENDARAAN (2), PERALATAN KANTOR (30)
- Total Purchase Value: Rp 2,722,284,889
- Acc Depr: Rp 1,102,506,466 (distribusi proporsional dari NR_opening)
- NBV: Rp 1,619,778,423

**Catatan penting:** Data acc depr di sheet individual TIDAK dipakai karena ada error ~Rp 1.07M berlebih. Dipakai NR_opening sebagai source of truth, didistribusi proporsional per kategori.

### 7. Inventory Seed (161 Item)
- 161 Inventory records terbuat dengan quantity dan averageCost
- 2 lokasi: Gudang Utama (existing) + Gudang Barat (baru dibuat)
- Total value: Rp 733,313,128
- Kategori: Bahan Baku (37), Bahan Kemasan (52), Bahan Penolong (7), Barang Jadi (43), Lainnya (22)

### 8. Buat Akun Baru
- 3-201b Laba Tahun Berjalan (Equity, Retained Earnings)
- Lokasi Gudang Barat

---

## Issues yang Tercatat

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 001 | MEDIUM | 31 item inventory tidak match ke product variant (Rp 144M) | OPEN |
| 002 | LOW | Acc depr individual aset berbeda dari NR_opening | RESOLVED (workaround) |
| 003 | LOW | Mapping akun 1-125 ambigu (Sewa vs Bahan Penolong) | OPEN |
| 004 | MEDIUM | Bridge 1-199 balance -Rp 1.4M (credit) | OPEN (expected) |
| 005 | HIGH | Double-count risk jika stock opname dijalankan | OPEN (needs decision) |
| 006 | LOW | FixedAsset depreciation schedule belum jalan | OPEN |
| 007 | LOW | Gudang Barat location baru dibuat | RESOLVED |

---

## File yang Dihasilkan

| File | Lokasi | Keterangan |
|------|--------|------------|
| Catatan lengkap | `docs/data-import/melindo-initial/2026-06-14-opening-balance-rebuild-notes.md` | Semua issues + detail |
| Handoff status | `docs/data-import/melindo-initial/2026-06-14-handoff-status.md` | Status terkini |
| Backup | `/opt/backups/polyflow/melindo_pre_ob_rebuild_20260614_142831.dump` | Sebelum rebuild |

---

## Rekomendasi Next Steps

1. **Resolve 31 unmatched inventory items** — buat product variant baru atau match manual
2. **Konfirmasi approach inventory** — rekomendasi: JANGAN jalankan stock opname, GL sudah benar
3. **Verify di UI** — buka melindo.polyflow.uk, cek balance sheet, AR, AP, Fixed Assets
4. **Monitor bridge 1-199** — settlement otomatis saat AR/AP dibayar
5. **Verifikasi acc depr** — minta admin cek data per aset
6. **Jalankan depreciation batch** — untuk periode Juni 2026 dst

---

## Data Source Reference

Google Sheet: https://docs.google.com/spreadsheets/d/1cXysOGPjR03xzMatQrV-qA-fNBZwRYdlgd0nzHJWO_E/edit

Tabs:
- NR_opening → Neraca per 31 Mei 2026 (source of truth)
- LR_Opening → Laba Rugi Mei 2026
- AR_opening → 11 invoices
- AP_opening → 106 tagihan
- Inventory_opening → 192 item
- FixedAsset_opening → 89 aset
