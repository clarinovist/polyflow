# SOP: Order Besar → SPK Batch Harian → Gudang → Kiosk → Selesai

**Untuk:** Kepala Produksi / Admin Produksi (Ika), Gudang RM, Operator, Supervisor  
**Konteks:** Order/demand besar (contoh 1000 kg) dipecah SPK sesuai kapasitas mesin (contoh ~300 kg/hari)  
**Mesin:** 1 SPK = 1 mesin  
**Versi:** 1.1 · 2026-07-22 (update: Papan Permintaan FG + Prioritas SPK)

---

## 1. Prinsip yang harus diingat semua orang

| Layer | Arti | Contoh |
|--------|------|--------|
| **Order / demand** | Komitmen total (SO atau plan) | **1000 kg** |
| **SPK** | Batch yang di-commit ke mesin hari ini | **300 kg** |
| **Hasil (execution)** | Catatan per shift: operator + helper + qty | Shift 1: 110 kg |

**Tiga aturan emas:**

1. **Sisa di dalam SPK** (mis. target 300, baru jadi 200) → **lanjut SPK yang sama**, jangan bikin SPK baru untuk sisa itu.
2. **Sisa demand** (1000 − batch yang sudah di-SPK) → **boleh / harus SPK baru** (batch berikutnya), gudang issue untuk batch itu.
3. **Bahan yang sudah keluar gudang menempel ke SPK** — bukan ke “hari” dan bukan otomatis pindah ke SPK baru.

---

## 2. Diagram alur (big picture)

```
┌─────────────────────────────────────────────────────────────┐
│  ORDER / DEMAND                          1000 kg            │
│  (Sales Order atau rencana produksi)                        │
│                                                             │
│  Sudah di-SPK: 300+300+…    Sisa belum di-SPK: …            │
│  Sudah jadi (output): …     Sisa masih harus diproduksi: …  │
└───────────────────────────┬─────────────────────────────────┘
                            │ Admin pecah sesuai kapasitas
                            ▼
        ┌───────────────┬───────────────┬───────────────┐
        │   SPK-001     │   SPK-002     │   SPK-00n     │
        │   300 kg      │   300 kg      │   100 kg      │
        │   Mesin A     │   Mesin A     │   Mesin A     │
        │   Hari 1…     │   Hari 2…     │   Hari n      │
        └───────┬───────┴───────┬───────┴───────┬───────┘
                │               │               │
                ▼               ▼               ▼
         Gudang issue    Gudang issue    Gudang issue
         utk batch ini   utk batch ini   utk batch ini
                │               │               │
                ▼               ▼               ▼
         Kiosk multi-    Kiosk multi-    Kiosk multi-
         shift + op+hlp  shift + op+hlp  shift + op+hlp
                │               │               │
                ▼               ▼               ▼
         Complete        Complete        Complete
         (≥ target auto  (≥ target auto  (≥ target auto
          / admin tutup)  / admin tutup)  / admin tutup)
```

---

## 3. Siapa ngapain

| Peran | Tugas utama |
|--------|-------------|
| **Admin / Ika** | Lihat sisa demand → buat SPK batch (mis. 300) → assign mesin → pantau progress → tutup SPK bila perlu |
| **Gudang RM** | Issue bahan **per SPK / per batch** (bukan full 1000 kecuali diminta khusus) |
| **Operator** | Di kiosk: pilih mesin & SPK aktif → catat hasil + diri sebagai operator |
| **Helper** | Tercatat di execution (bukan “mengganti” SPK) |
| **Supervisor** | Ganti operator jika absen; pastikan shift kosong = tidak ada input (bukan data palsu) |

---

## 4. SOP harian (langkah demi langkah)

### 4.1 Sebelum produksi (Admin)

1. Buka **Papan Permintaan FG** (`/production/requests`) — ini menampilkan semua item FG yang perlu diproduksi dari SO aktif.
2. Cek:
   - **Perlu (net stok):** demand FG dikurangi stok FG yang tersedia
   - **Belum di-SPK:** sisa yang belum ditutup SPK
   - Sinyal urgensi (🔴 URGENT / 🟡 NORMAL / 🟢 LOW)
3. **Klik "Buat SPK"** pada item yang perlu diproduksi.
4. Isi:
   - Jumlah (hint dari "Belum di-SPK")
   - Mesin (opsional)
   - Lokasi output
   - Prioritas (default NORMAL; set URGENT jika perlu)
5. SPK yang dibuat dari papan **tidak terikat SO** — bekerja sebagai batch produksi mandiri.
6. Setelah SPK dibuat, papan otomatis update: `uncoveredNeed` berkurang.

### 4.2 Bahan (Gudang)

1. Lihat SPK yang **RELEASED / IN_PROGRESS** dan perlu bahan.
2. Issue bahan **untuk SPK itu** (partial boleh: tidak harus exact full BOM 300 di sekali jalan).
3. **Jangan** issue seolah untuk “sisa 1000” ke satu SPK kecuali ada instruksi bulk + prosedur staging.
4. SPK batch berikutnya (besok) = **issue terpisah** ke SPK baru — itu **bukan double**, itu batch baru.

### 4.3 Saat ganti shift (Operator / Supervisor)

1. Operator buka **Kiosk** → pilih **mesin** → pilih **SPK yang masih jalan**.
2. Catat:
   - Qty bagus (dan scrap bila ada)
   - **Operator** yang benar-benar kerja
   - **Helper** yang membantu
   - Shift aktual
3. **Shift kosong / orang tidak masuk**  
   → **Tidak perlu input apa pun.**  
   → Supervisor boleh re-assign operator untuk shift berikutnya di SPK **yang sama**.
4. Jangan “timpa” qty kemarin. Setiap input = **baris hasil baru** (execution).

### 4.4 Akhir batch / complete (Sistem + Admin)

| Kondisi | Tindakan |
|---------|----------|
| Produced **≥** planned (mis. ≥ 300) | Sistem **boleh auto COMPLETED** |
| Produced **<** planned, job masih dilanjut | Biarkan **IN_PROGRESS** (boleh lewat tengah malam / ke esok hari) |
| Produced **<** planned, job **dihentikan** (ganti prioritas, cancel, dll.) | **Admin tutup SPK** secara manual |
| Setelah tutup under-complete, ada sisa bahan di lantai | Wajib pilih: **Return gudang** / **Transfer ke SPK lain** / **Write-off** (lihat §6) |

### 4.5 Batch berikutnya dari sisa demand (Admin + Gudang)

1. Pastikan SPK sebelumnya **sudah complete** (atau kebijakan: 1 mesin 1 SPK open — disarankan).
2. Hitung sisa demand, buat SPK baru (mis. 300 lagi).
3. Gudang issue **untuk SPK baru**.
4. Ulangi sampai demand 1000 terpenuhi (atau ditutup dari sisi SO).

---

## 5. Contoh angka (1000 kg, kapasitas ~300/hari)

### Rencana ideal

| Hari | Aksi | SPK | Demand sisa belum di-SPK | Keterangan |
|------|------|-----|---------------------------|------------|
| H1 | Buat SPK-001 | 300 | 700 | Issue bahan batch 1 |
| H1 malam | Output 300 | Complete auto | 700 | Batch 1 selesai |
| H2 | Buat SPK-002 | 300 | 400 | Issue bahan batch 2 |
| H3 | Buat SPK-003 | 300 | 100 | Issue bahan batch 3 |
| H4 | Buat SPK-004 | 100 | 0 | Issue bahan batch 4 |

### Kalau H1 hanya jadi 200 kg (belum full 300)

| Salah | Benar |
|--------|--------|
| Tutup SPK-001, buat SPK-002 “sisa 100 + batch 300” | **Lanjut SPK-001** sisa 100 kg |
| Minta gudang issue lagi “untuk 100 kg sisa” seolah order baru tanpa cek sisa bahan di SPK-001 | Cek dulu sisa bahan di SPK-001; issue **tambahan partial** hanya jika kurang |
| Operator shift 3 bikin SPK baru karena “bukan operator shift 1” | Shift 3 input **ke SPK-001 yang sama**, ganti nama operator/helper di form hasil |

**Urutan H2 yang benar jika SPK-001 sisa 100:**

1. Selesaikan sisa 100 di **SPK-001** (bisa pagi shift 1).  
2. Setelah SPK-001 complete → baru buat **SPK-002 = 300** dari sisa demand.  
3. Gudang issue untuk **SPK-002**.

---

## 6. Sisa bahan saat admin tutup SPK (under-complete)

Hanya relevan kalau SPK ditutup **sebelum** target tercapai dan masih ada bahan di lantai / di order.

| Opsi | Kapan dipakai | Apa yang terjadi |
|------|----------------|------------------|
| **Return ke gudang RM** | Bahan masih layak, mau dipakai job lain | Stok RM naik; SPK “bersih” |
| **Transfer ke SPK lain** | Langsung dilanjut di SPK baru (ganti mesin/spek, dll.) | **Bukan** issue RM dari nol; pindah kepemilikan bahan |
| **Write-off / scrap / adjust** | Rusak, kotor, tidak terukur | Harus ada alasan; jangan diam-diam |

**Dilarang:** Tutup SPK under-complete → buka SPK baru → minta gudang issue full seolah bahan belum pernah keluar, padahal fisik masih di lantai.

---

## 7. Operator absen / shift kosong

```
SPK-001  Target 300  Mesin A
├── Shift 1  Budi + helper Andi   → ada input hasil
├── Shift 2  (tidak masuk)        → tidak ada input
└── Shift 3  Siti + helper Rina   → ada input hasil di SPK yang SAMA
```

- Re-assign operator: **boleh** kapan saja (rencana shift).  
- Upah: dari **operator + helper di tiap baris hasil**, bukan dari “pemilik” header SPK saja.  
- Shift kosong: **cukup tidak ada input** — tidak wajib isi nol.

---

## 8. Ceklist cepat

### Admin / Ika — buat SPK

- [ ] Tahu sisa demand total  
- [ ] Cek mesin: apakah masih ada SPK open under-target?  
- [ ] Qty SPK ≤ sisa demand dan masuk akal vs kapasitas  
- [ ] 1 SPK = 1 mesin  
- [ ] Tidak memecah sisa SPK berjalan jadi SPK baru tanpa alasan

### Gudang

- [ ] Issue mengacu **nomor SPK**, bukan “order 1000” secara buta  
- [ ] Batch baru = SPK baru = issue baru (normal)  
- [ ] SPK belum selesai: cek sisa bahan di order dulu sebelum issue besar  
- [ ] SPK ditutup under-complete: pastikan return/transfer/write-off sudah diputuskan

### Operator kiosk

- [ ] Mesin benar  
- [ ] SPK yang masih IN_PROGRESS (bukan bikin angka di kepala)  
- [ ] Qty + operator + helper benar  
- [ ] Shift kosong = skip, jangan isi asal

### Complete

- [ ] ≥ target → auto complete OK  
- [ ] < target & masih lanjut → biarkan open  
- [ ] < target & stop → admin tutup + urus sisa bahan

---

## 9. FAQ lapangan

**Q: Order 1000, kenapa SPK cuma 300?**  
A: Karena kapasitas mesin ~300/hari. 1000 = payung demand; 300 = batch kerja.

**Q: Besok gudang harus keluarin bahan lagi?**  
A: Ya, untuk **SPK batch baru**. Itu normal. Bukan double dari SPK kemarin.

**Q: SPK 300 baru 200, sisa 100 — bikin SPK baru?**  
A: **Tidak.** Lanjut SPK yang sama sampai complete atau admin tutup dengan alasan.

**Q: Kapan boleh SPK baru 300 lagi?**  
A: Kalau batch sebelumnya sudah complete (disarankan), dan masih ada sisa **demand**.

**Q: Shift 2 tidak masuk, hasil siapa?**  
A: Tidak ada baris hasil shift 2. Shift 3 catat atas nama operator shift 3 di SPK yang sama.

**Q: Siapa yang boleh tutup SPK di bawah target?**  
A: **Admin.** Sistem hanya auto-complete jika produced ≥ planned.

**Q: 1 mesin boleh 2 SPK jalan bersamaan?**  
A: Hindari. Disarankan **1 mesin = 1 SPK open**, supaya kiosk dan bahan tidak campur.

---

## 10. Ringkas satu kalimat

> **Demand 1000 dipecah SPK batch (mis. 300) sesuai kapasitas; tiap SPK punya bahan + hasil + upah sendiri; sisa di dalam SPK dilanjut di SPK itu; sisa demand dikerjakan SPK berikutnya; gudang issue per batch, bukan full 1000 kecuali prosedur khusus.**

---

## 11. Glosarium singkat

| Istilah | Arti |
|---------|------|
| **Demand / SO** | Kebutuhan total (1000 kg) |
| **SPK** | Surat Perintah Kerja / work order batch |
| **Planned** | Target qty di SPK |
| **Produced** | Total qty bagus dari semua execution |
| **Sisa SPK** | Planned − Produced |
| **Sisa demand** | Total order − (qty yang sudah di-cover SPK / sudah jadi — sesuai definisi layar) |
| **Issue** | Pengeluaran bahan dari gudang ke SPK |
| **Execution** | Satu baris pencatatan hasil di kiosk |
| **Under-complete** | SPK ditutup meski produced < planned |

---

*Dokumen ini untuk kesepakatan operasional. Perilaku tombol di Polyflow mengikuti aturan di atas; detail teknis material path (RM vs floor WIP) merujuk `docs/production-logic.md`.*
