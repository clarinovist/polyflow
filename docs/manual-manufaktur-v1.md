# Panduan & Logika Bisnis Manufaktur PolyFlow
**Versi Dokumen:** 1.2 (Revisi: Full Cycle Mixing-Extrusion-Packing)
**Target Pembaca:** Manajer Produksi, Admin Gudang, & Supervisor

---

## 1. Pendahuluan
Dokumen ini menjelaskan **aturan main (Business Rules)** yang berjalan di balik layar sistem PolyFlow. Dokumen ini mencakup alur produksi ujung-ke-ujung (End-to-End) dari pencampuran bahan hingga pengemasan barang jadi.

---

## 2. Alur Proses Lengkap (End-to-End)

Proses produksi plastik di PolyFlow secara umum terdiri dari 3 tahap utama yang saling berkesinambungan:
1.  **Mixing (Pencampuran)**: Biji Plastik + Pigmen -> Compound/Mix.
2.  **Extrusion (Pencetakan)**: Compound -> Gulungan Plastik (Rolls).
3.  **Packing/Slitting (Finishing)**: Roll Besar -> Pack Kecil/Potongan Siap Jual.

---

### TAHAP 1: MIXING (Pencampuran)
Di sini kita mengubah "Raw Material" menjadi "WIP (Work In Process)".

**A. Alur Normal**
1.  **Persiapan**: Admin transfer stok (Resin, Pigmen, Kapur) dari Gudang Utama ke "Gudang Mixing".
2.  **Order**: SPK Mixing turun, misal target 1.000 kg Compound Putih.
3.  **Eksekusi**: Operator mencampur bahan sesuai resep.
4.  **Output**: Operator menimbang hasil adukan per karung (sak). Misal 1 sak = 25kg.
5.  **Pencatatan**: Operator input "25kg".
    *   **Stok Masuk**: +25kg "Compound Putih" (di Gudang Mixing).
    *   **Stok Keluar**: -24kg Resin, -0.5kg Pigmen, -0.5kg Kapur (Backflush otomatis).

**B. Rules & Validasi**
*   **Must Have Stock**: Tidak bisa input hasil 25kg jika bahan baku resin/pigmen di sistem 0.
*   **Batch Tracking** (Opsional): Operator bisa scan barcode bahan baku untuk mencatat batch mana yang dipakai (First-In First-Out).

**C. Potensi Error**
| Error | Penyebab | Solusi |
| :--- | :--- | :--- |
| `Insufficient Material` | Stok fisik ada, stok sistem kosong. | Lakukan Transfer Stok segera. |
| Hasil Aduk Beda Warna | Salah takaran manual. | Perlu prosedur "Material Issue" manual untuk catat tambahan pigmen koreksi. |

---

### TAHAP 2: EXTRUSION (Pencetakan)
Disini kita mengubah "WIP (Compound)" menjadi "WIP (Rolls)" atau "FG (Barang Jadi)".

**A. Alur Normal**
1.  **Persiapan**: Stok "Compound Putih" sudah tersedia di Gudang Mixing (hasil dari Tahap 1).
2.  **Order**: SPK Extrusi turun (cetak plasik bening/putih lebar 10cm).
3.  **Eksekusi**: Operator memasukkan Compound ke corong mesin.
4.  **Output**: Mesin menghasilkan gulungan plastik (Roll).
5.  **Pencatatan**: Operator timbang roll -> misal 40kg. Input ke Kiosk.
    *   **Stok Keluar**: -40kg "Compound Putih" dari Gudang Mixing.
    *   **Stok Masuk**: +40kg "Roll Putih Polos" di Gudang Extrusion / Rewinding.

**B. Rules & Validasi**
*   **Validasi Sumber**: Sistem akan menolak jika kita mencoba pakai bahan "Compound Biru" untuk order "Plastik Putih" (Sistem lock by Recipe).
*   **Over-Production**: Diperbolehkan selama Compound masih tersedia.

**C. Potensi Error**
| Error | Penyebab | Solusi |
| :--- | :--- | :--- |
| `Source Inventory Invalid` | Mencoba pakai bahan yang tidak ada di resep. | Revisi Resep (BOM) atau ganti bahan fisik di mesin. |
| Mesin Mati/Downtime | Listrik mati, Screen buntu. | Operator WAJIB klik "Downtime" di Kiosk agar performa mesin (OEE) tidak hancur. |

---

### TAHAP 3: PACKING / FINISHING
Disini kita mengubah "Rolls" menjadi "Barang Siap Jual".

**A. Alur Normal**
1.  **Persiapan**: Roll hasil extrusi didiamkan (curing) lalu dibawa ke meja packing.
2.  **Order**: SPK Packing (Potong jadi kantong kresek / Pack per 1kg).
3.  **Eksekusi**: Roll dipotong, di-seal, dan dimasukkan ke karung luar.
4.  **Output**: Operator input hasil "1 Karung (isi 50 pack)".
    *   **Stok Keluar**: -50kg "Roll Putih Polos" (Backflush).
    *   **Stok Masuk**: +1 Karung "Kresek Putih HD" (Finished Good).

**B. Rules & Validasi**
*   **Scrap Tinggi**: Di tahap ini paling banyak potongan sisa (trim). System membolehkan input Scrap dalam jumlah besar.

**C. Potensi Error**
| Error | Penyebab | Solusi |
| :--- | :--- | :--- |
| `Quantity Mismatch` | Input hasil pack 100kg, padahal roll yang diambil cuma 90kg. | Cek timbangan. Sistem akan menolak jika stok Roll tidak cukup. |

---

## 4. Kesimpulan Studi Kasus (Integrasi)
Jika Anda melihat "Error Merah" di Extrusion, **jangan panik di Extrusion**.
Cek ke belakang (Backtrace):
1.  Apakah Mixing sudah input hasil? (Kalau Mixing belum input, Extrusi tidak punya bahan).
2.  Apakah Gudang sudah transfer bahan ke Mixing?

Sistem ini adalah rantai yang saling mengunci demi kebenaran data. Satu titik putus (lupa input), proses selanjutnya tertahan. Ini adalah fitur keamanan, bukan bug.
