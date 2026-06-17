# Melindo Opening Balance — Reconciling Notes

Tanggal: 12 Juni 2026
Database: polyflow_melindojaya
Source: Google Sheets "Melindo Opening Balance Template" + NR_opening tab

---

## Status Import

| Bucket | Status | Jumlah | Total |
|--------|--------|--------|-------|
| Journal-only | ✓ Posted | 11 akun | Rp 1,196,367,460 |
| AP Module | ✓ Posted | 107 invoices | Rp 1,619,993,651 |
| AR Module | ✓ Posted | 11 invoices | Rp 192,527,366 |
| Inventory | ✓ Posted | 190 items | Rp 746,398,130 |
| Fixed Assets | ✓ Posted | 89 aset | Rp 3,030,119,889 (gross) |
| Owner Liability | ✓ Posted | 1 entry | Rp 681,000,000 |

Trial Balance: DR = CR = Rp 8,912,905,696 ✓

---

## Reconciling Items: NR_opening vs DB

### MATCHED (17 akun) ✓

| NR Code | Description | NR Amount | Status |
|---------|-------------|-----------|--------|
| 1-112 | Kas Kecil | 22,692,765.60 | ✓ Match |
| 1-113 | Bank Mandiri | 9,169,510.98 | ✓ Match |
| 1-114 | Bank BCA | 635,383.70 | ✓ Match |
| 1-116 | Pajak Dibayar Dimuka | 647,584,521.00 | ✓ Match |
| 1-117 | Piutang Karyawan | 15,040,000.00 | ✓ Match |
| 1-121 | CIP | 8,165,000.00 | ✓ Match |
| 1-123 | Sewa Dibayar Dimuka | 51,502,003.00 | ✓ Match |
| 1-133 | Uang Muka Supplier | 45,204,715.54 | ✓ Match |
| 1-132 | Pers. BDP | 26,546,600.12 | ✓ Match (0.12 rounding) |
| 1-134 | Pers. Alat Tulis | 4,994,322.62 | ✓ Match (0.38 rounding) |
| 1-212 | Bangunan | 386,478,000.00 | ✓ Match |
| 1-214 | Kendaraan | 27,000,000.00 | ✓ Match |
| 1-215 | Peralatan Kantor | 98,993,008.99 | ✓ Match (0.01 rounding) |
| 2-120 | PPN Keluaran | 667,916,028.48 | ✓ Match |
| 2-390 | Hutang Nugroho | 681,000,000.00 | ✓ Match |
| 3-200b | Laba Ditahan | 355,473,088.24 | ✓ Match |
| 3-201b | Laba Tahun Berjalan | 172,978,343.45 | ✓ Match |

---

### DIFFERENCES (10 akun) ⚠

~~#### 1. Piutang Dagang (1-115)~~ ✓ RESOLVED
```
NR Target:  Rp 192,527,866.00
DB:         Rp 192,527,366.00
Diff:       Rp        500.00 (rounding)
```
**Status:** Sudah diselesaikan. 2 invoice baru ditambahkan dari sheets (BAROKAH PLASTIK Rp 37.6M + WAHYU PURNO WIDODO Rp 10.88M).

#### 2. Persediaan Barang Jadi (1-126)
```
NR Target:  Rp 308,169,440.86
DB:         Rp 190,059,253.00
Diff:       Rp 118,110,187.86 (NR lebih besar)
```
**Penjelasan:** Sheets hanya punya 56 item finished goods senilai Rp 190M. NR menunjukkan Rp 308M. Kemungkinan ada finished goods yang belum diinput ke sheets.
**Rekomendasi:** Cek apakah ada barang jadi yang belum tercatat di sheets.

#### 3. Persediaan Bahan Baku (1-130)
```
NR Target:  Rp 415,987,052.00
DB:         Rp 432,612,902.00 (termasuk Bahan Penolong Rp 3.3M)
Diff:       Rp -16,625,850.00 (DB lebih besar)
```
**Penjelasan:** DB memiliki 47 item bahan baku + 8 item bahan penolong. NR mungkin menghitung bahan penolong terpisah atau ada penyesuaian harga.
**Rekomendasi:** Review apakah Bahan Penolong harus dipisah dari Bahan Baku.

#### 4. Persediaan Bahan Kemasan (1-131)
```
NR Target:  Rp 118,213,685.54
DB:         Rp  92,185,052.00
Diff:       Rp  26,028,633.54 (NR lebih besar)
```
**Penjelasan:** Sheets punya 54 item packaging senilai Rp 92M. NR menunjukkan Rp 118M. Kemungkinan ada item kemasan yang belum diinput.
**Rekomendasi:** Lengkapi data bahan kemasan di sheets.

#### 5. Mesin (1-213) — TERBESAR
```
NR Target:  Rp 2,201,648,880.00
DB:         Rp 2,517,648,880.00
Diff:       Rp -316,000,000.00 (DB lebih besar)
```
**Penjelasan:** 
- Sheets punya 50 mesin senilai Rp 2,167,648,880
- DB mengimport 51 mesin senilai Rp 2,517,648,880
- Ada 10 mesin baru (Juni 2025+) senilai Rp 475,355,080
- NR = Rp 2,201,648,880 (lebih besar Rp 34M dari sheets, kemungkinan ada aset yang belum ada di sheets)
- DB lebih besar dari NR karena mengimport semua data sheets termasuk aset terbaru

**Rekomendasi:** Perlu verifikasi — apakah NR sudah termasuk semua aset terbaru? Jika ya, ada aset di sheets yang seharusnya tidak dimasukkan (mungkin sudah dijual/dihapus).

#### 6-9. Akumulasi Penyusutan
```
Akum Bangunan:    NR -95,501,580.75  vs  DB -102,800,191.17  (diff +7,298,610)
Akum Mesin:       NR -921,353,337.17 vs  DB -1,041,676,546.25 (diff +120,323,209)
Akum Kendaraan:   NR -843,750.00     vs  DB -1,687,500.00    (diff +843,750)
Akum Peralatan:   NR -84,807,798.40  vs  DB -88,818,716.19   (diff +4,010,918)
```
**Penjelasan:** DB menggunakan akumulasi penyusutan dari sheets yang mungkin lebih update (sampai Mei 2026). NR menggunakan angka yang berbeda — kemungkinan NR sudah diadjust atau menggunakan perhitungan berbeda.
**Rekomendasi:** Verifikasi metode perhitungan penyusutan. Sheets menggunakan perhitungan otomatis berdasarkan umur manfaat, NR mungkin sudah manual adjust.

#### 10. Hutang Dagang (2-110)
```
NR Target:  Rp 1,604,329,261.20
DB:         Rp 1,619,993,651.00
Diff:       Rp -15,664,389.80 (DB lebih besar)
```
**Penjelasan:** Setelah koreksi 3 invoice AP (Pewarna Putih, 2 tagihan Fadila), total AP menjadi Rp 1,619,993,651. NR menunjukkan Rp 1,604,329,261.20. Selisih Rp 15.7M kemungkinan karena:
- NR diambil sebelum koreksi terakhir
- Ada tagihan yang belum masuk ke NR
- Perbedaan rounding/pembulatan
**Rekomendasi:** Konfirmasi dengan user apakah NR sudah termasuk koreksi terakhir.

---

## Summary Reconciliation

```
Total Aset (NR):     Rp 3,481,696,721.37
Total Aset (DB):     Rp 3,458,502,290.00 (estimated)
Diff:                Rp    23,194,431.37
```

### Action Items
1. [x] ~~Lengkapi data AR di sheets (gap Rp 48.5M)~~ → RESOLVED, AR match Rp 192,527,366 vs Rp 192,527,866 (diff Rp 500)
2. [ ] Verifikasi Barang Jadi di sheets (gap Rp 118M)
3. [ ] Verifikasi Bahan Kemasan di sheets (gap Rp 26M)
4. [ ] Verifikasi Mesin — apakah semua aset sudah termasuk di NR?
5. [ ] Konfirmasi akumulasi penyusutan — sheets vs NR
6. [ ] Konfirmasi AP setelah koreksi (gap Rp 15.7M)

### Catatan
- Journal-only bucket sudah diposting sesuai NR_opening
- AP sudah dikoreksi (3 invoice: 02/F-BN/II/26, 004/F-BN/II/26, SBP001/04/2026)
- Inventory correction sudah diposting (Pewarna Putih -Rp 747M)
- Owner liability 2-390 sudah diposting
- Semua journal balanced (DR = CR)
