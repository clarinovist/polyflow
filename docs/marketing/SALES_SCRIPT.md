# PolyFlow Sales Script

**Tanggal:** 2026-05-27  
**Tujuan:** Script praktis untuk discovery, demo, follow-up, dan objection handling PolyFlow.

---

## 1. Sales Principle

Jangan mulai dari fitur. Mulai dari pain.

Urutan bicara:

1. Pahami proses pabrik.
2. Temukan pain paling mahal.
3. Pilih demo sesuai pain.
4. Tunjukkan flow kecil end-to-end.
5. Tawarkan pilot terbatas.

PolyFlow jangan dijual sebagai “full ERP langsung”. Jual sebagai sistem untuk menyelesaikan masalah spesifik:

- stok kacau,
- produksi tidak terlihat,
- scrap tidak terukur,
- HPP tidak jelas,
- maklon tercampur dengan stok internal.

---

## 2. Opening Pitch

### Versi 15 detik

> “PolyFlow membantu pabrik plastik converting mengontrol stok, produksi, scrap, maklon, dan HPP dalam satu sistem. Biasanya cocok untuk pabrik yang sudah terlalu kompleks untuk Excel, tapi belum mau implement ERP besar sekaligus.”

### Versi 30 detik

> “Banyak pabrik plastik punya masalah yang sama: stok di gudang beda dengan laporan, bahan keluar produksi tidak selalu tercatat, scrap baru kelihatan di akhir, dan HPP masih perkiraan. PolyFlow dibuat khusus untuk alur seperti mixing, extrusion, packing, dan maklon supaya owner bisa lihat bahan keluar, hasil jadi, reject, dan costing per order dengan lebih jelas.”

### Versi owner/director

> “Tujuan PolyFlow bukan menambah kerja admin, tapi membuat owner punya angka yang bisa dipercaya: stok available, progress produksi, scrap, dan HPP. Implementasinya bisa mulai kecil dari satu lini atau satu gudang dulu.”

---

## 3. Discovery Call Script — 30 Menit

### Agenda

> “Pak/Bu, supaya tidak demo fitur yang tidak relevan, saya mau pahami dulu flow pabriknya. Setelah itu saya akan tunjukkan bagian PolyFlow yang paling sesuai dengan pain utama.”

### Pertanyaan profil

1. Produknya apa saja? Film, roll, kantong, injection, recycle, atau lainnya?
2. Proses produksinya tahap apa saja? Mixing, extrusion, slitting, packing, lainnya?
3. Berapa lokasi gudang/produksi yang aktif?
4. Berapa banyak SKU/varian aktif?
5. Ada berapa shift dan mesin utama?
6. Saat ini pakai sistem apa untuk stok, produksi, dan accounting?

### Pertanyaan pain stok

1. Seberapa sering stok sistem beda dengan stok fisik?
2. Selisih biasanya terjadi di bahan baku, WIP, atau finished goods?
3. Transfer bahan ke produksi dicatat bagaimana?
4. Stock opname dilakukan berapa sering?
5. Kalau owner tanya stok available hari ini, datanya dari mana?

### Pertanyaan pain produksi

1. Work order/SPK dibuat dari mana?
2. Bahan keluar produksi dicatat sebelum produksi, saat produksi, atau setelah selesai?
3. Operator input hasil produksi di mana?
4. Scrap/reject dicatat per order atau direkap total?
5. Apakah over-issue atau substitusi bahan sering terjadi?
6. Apakah ada masalah traceability dari bahan ke hasil jadi?

### Pertanyaan pain costing

1. HPP dihitung berdasarkan standard BOM atau aktual bahan keluar?
2. Harga bahan berubah seberapa sering?
3. Scrap masuk perhitungan HPP atau tidak?
4. Finance bisa lihat WIP dan COGM dari sistem atau manual?
5. Pernah ada order yang ternyata rugi setelah dihitung ulang?

### Pertanyaan maklon

1. Apakah menerima bahan milik customer?
2. Bahan customer disimpan terpisah atau bercampur?
3. Pemakaian bahan customer dicatat saat produksi atau saat sales order?
4. Sisa bahan customer dikembalikan atau disimpan?
5. Invoice maklon berdasarkan jasa, output, berat, atau formula lain?

### Pertanyaan buying process

1. Siapa yang akan memutuskan sistem seperti ini?
2. Siapa user harian yang paling terdampak?
3. Kalau pilot, flow mana yang paling penting dibuktikan dulu?
4. Target timeline-nya kapan?
5. Jika pilot berhasil, apakah ada budget untuk lanjut?

---

## 4. Diagnosis Setelah Discovery

Gunakan mapping ini untuk menentukan demo.

| Jawaban customer | Demo yang dipilih |
|---|---|
| “Stok sering selisih” | Stock Control demo |
| “Bahan produksi tidak jelas” | Production Control demo |
| “Scrap tinggi tapi tidak tahu dari mana” | Production + Scrap demo |
| “HPP tidak akurat” | Costing demo |
| “Kami banyak maklon” | Maklon demo |
| “Mau ganti semua sistem” | Jangan langsung iya; tawarkan phased rollout |

---

## 5. Demo Script — Stock Control 10-15 Menit

### Opening

> “Saya mulai dari stok dulu karena ini biasanya fondasi. Kalau stok tidak dipercaya, produksi dan costing juga ikut bermasalah.”

### Flow demo

1. Tunjukkan product/SKU dan unit.
2. Tunjukkan lokasi: raw material warehouse, production area, finished goods.
3. Receive bahan masuk.
4. Transfer bahan ke produksi.
5. Adjustment atau stock opname.
6. Lihat inventory dashboard.
7. Lihat movement audit trail.

### Aha moment

> “Setiap pergerakan stok ada jejaknya. Jadi kalau ada selisih, kita bisa telusuri dari transaksi, bukan debat berdasarkan ingatan.”

### Closing demo

> “Kalau untuk pabrik Bapak/Ibu, selisih terbesar biasanya terjadi di transaksi mana: bahan masuk, transfer ke produksi, atau hasil produksi masuk gudang?”

---

## 6. Demo Script — Production Control 20-30 Menit

### Opening

> “Di pabrik plastik, masalahnya sering bukan cuma stok. Masalahnya adalah bahan sudah keluar, produksi jalan, tapi data output dan scrap baru direkap belakangan. Di sini PolyFlow membuat work order punya jejak lengkap.”

### Flow demo

1. Tunjukkan BOM/formula.
2. Buat production order.
3. Release order.
4. Issue material.
5. Operator buka kiosk.
6. Input good output.
7. Input scrap/reject.
8. Complete order.
9. Lihat stock impact.
10. Lihat production history.

### Aha moment

> “Untuk setiap order, kita bisa lihat bahan rencana, bahan aktual, hasil bagus, scrap, dan statusnya.”

### Closing demo

> “Kalau flow ini dipakai di satu lini produksi dulu, produk mana yang paling cocok untuk pilot?”

---

## 7. Demo Script — Costing 20 Menit

### Opening

> “Costing hanya akurat kalau data bahan dan output akurat. Jadi PolyFlow menghubungkan material issue dan hasil produksi ke HPP.”

### Flow demo

1. Tunjukkan product cost / standard cost.
2. Tunjukkan BOM dan material cost.
3. Tunjukkan actual issue dari production order.
4. Tunjukkan output dan scrap.
5. Tunjukkan cost breakdown.
6. Tunjukkan variance atau margin view.

### Aha moment

> “HPP bisa dijelaskan: bahan apa yang dipakai, berapa qty, cost source-nya apa, dan bagaimana scrap memengaruhi biaya per unit.”

### Closing demo

> “Saat ini bagian mana dari HPP yang paling sering diperdebatkan: harga bahan, yield, scrap, atau biaya konversi?”

---

## 8. Demo Script — Maklon 20-30 Menit

### Opening

> “Untuk maklon, bahan customer sebaiknya tidak dianggap stok perusahaan. PolyFlow memisahkan kepemilikan bahan, tapi tetap mencatat pemakaiannya saat produksi.”

### Flow demo

1. Tunjukkan customer-owned location.
2. Receive bahan titipan customer.
3. Buat Sales Order tipe Maklon Jasa.
4. Buat/jalankan work order maklon.
5. Issue/consume bahan customer saat produksi.
6. Input output.
7. Invoice jasa.
8. Return sisa bahan jika ada.

### Aha moment

> “Bahan customer tetap tercatat, tetapi tidak bercampur dengan valuasi inventory perusahaan. Yang ditagihkan adalah jasa maklon.”

### Closing demo

> “Apakah pain terbesar maklon Bapak/Ibu ada di pencatatan bahan masuk, pemakaian saat produksi, sisa bahan, atau invoice jasa?”

---

## 9. Objection Handling

### “Kami sudah pakai Accurate/Jurnal.”

Jawaban:

> “Bagus. PolyFlow tidak harus langsung mengganti accounting. Biasanya kita mulai dari stok dan produksi, lalu finance bisa memakai data PolyFlow untuk validasi HPP. Kalau nanti perlu integrasi atau migrasi, itu bisa phase berikutnya.”

### “ERP ribet dan sering gagal.”

Jawaban:

> “Setuju, kalau langsung full rollout memang berat. Karena itu PolyFlow masuk bertahap: satu flow, satu lokasi, beberapa SKU prioritas. Target pilot bukan semua sempurna, tapi membuktikan data stok/produksi bisa lebih dipercaya.”

### “Operator kami gaptek.”

Jawaban:

> “Operator tidak perlu buka dashboard lengkap. Mereka cukup pakai kiosk untuk action sederhana seperti start job, input output, dan scrap. Admin tetap bisa handle bagian yang lebih detail.”

### “Proses kami unik.”

Jawaban:

> “Pabrik plastik memang sering punya variasi proses. PolyFlow sudah mendukung BOM, multi-location, material issue, scrap, dan maklon. Kita validasi dulu flow utama lewat pilot sebelum bicara custom.”

### “Data kami belum rapi.”

Jawaban:

> “Itu normal. Kita tidak perlu mulai dari semua data. Mulai dari SKU prioritas dan lokasi utama. Justru pilot membantu melihat data mana yang perlu dibersihkan dulu.”

### “Berapa lama implementasinya?”

Jawaban:

> “Untuk pilot terbatas biasanya 30-45 hari. Untuk rollout penuh tergantung jumlah lokasi, SKU, flow produksi, dan kesiapan data. Saya sarankan jangan full rollout sebelum pilot kecil berhasil.”

### “Berapa harganya?”

Jawaban:

> “Tergantung paket dan scope. Supaya fair, kita tentukan dulu pain utama dan scope pilot. PolyFlow bisa mulai dari Stock Control, Production Control, Business Control, atau Maklon Add-on. Setelah scope jelas, baru proposalnya akurat.”

### “Bisa custom?”

Jawaban:

> “Bisa dibahas, tapi saya sarankan jangan custom sebelum flow standar dicoba. Banyak masalah bisa selesai dengan konfigurasi/SOP. Custom yang benar-benar perlu kita masukkan ke phase 2 agar pilot tetap cepat.”

---

## 10. Follow-up Setelah Discovery

Template WhatsApp:

```text
Halo Pak/Bu [Nama], terima kasih waktunya tadi.

Dari diskusi, saya tangkap pain utama di pabrik Bapak/Ibu adalah:
1. [Pain 1]
2. [Pain 2]
3. [Pain 3]

Rekomendasi saya, PolyFlow tidak langsung full ERP dulu. Kita mulai pilot terbatas di area [Stock/Production/Maklon] dengan scope:
- [Lokasi]
- [Produk/SKU prioritas]
- [Flow transaksi]
- Durasi 30-45 hari

Target pilot: membuktikan [hasil yang diinginkan], lalu baru putuskan rollout berikutnya.

Saya kirimkan ringkasan scope/proposal setelah ini ya Pak/Bu.
```

---

## 11. Cold Outreach Templates

### WhatsApp owner pabrik

```text
Halo Pak/Bu [Nama], saya [Nama] dari PolyFlow.

Kami sedang membantu pabrik plastik converting merapikan stok, produksi, scrap, dan HPP — terutama untuk flow seperti mixing, extrusion, packing, dan maklon.

Biasanya masalah yang kami temui: stok gudang beda dengan laporan, bahan produksi tidak tercatat rapi, scrap baru kelihatan belakangan, dan HPP masih banyak manual Excel.

Kalau di pabrik Bapak/Ibu ada pain seperti itu, saya boleh minta 20 menit untuk diskusi dan lihat apakah PolyFlow relevan?
```

### LinkedIn connection note

```text
Halo Pak/Bu [Nama], saya sedang membangun PolyFlow, ERP operasional untuk pabrik plastik converting Indonesia. Fokusnya stok, produksi, scrap, HPP, dan maklon. Saya ingin connect karena banyak belajar dari pelaku industri plastik.
```

### LinkedIn follow-up

```text
Terima kasih sudah connect Pak/Bu [Nama].

PolyFlow membantu pabrik plastik yang sudah terlalu kompleks untuk Excel, tapi belum ingin implement ERP besar sekaligus. Biasanya kami mulai dari pilot kecil: stok, produksi, atau maklon.

Kalau Bapak/Ibu berkenan, saya ingin tanya 2-3 hal tentang proses produksi/stok di pabrik Bapak/Ibu untuk melihat apakah ada area yang bisa kami bantu.
```

### Email outreach

Subject options:

- `Stok, produksi, dan HPP pabrik plastik — bisa lebih rapi tanpa full ERP rollout`
- `Pilot 30 hari untuk kontrol stok/produksi pabrik plastik`
- `PolyFlow: ERP operasional untuk plastik converting`

Body:

```text
Halo Pak/Bu [Nama],

Saya [Nama] dari PolyFlow. Kami membangun ERP operasional untuk pabrik plastik converting di Indonesia.

Fokus PolyFlow adalah membantu tim gudang, produksi, finance, dan owner mengontrol:
- stok bahan dan finished goods,
- work order dan material issue,
- output produksi dan scrap,
- HPP dan margin,
- bahan customer untuk maklon.

Kami tidak menyarankan full ERP rollout dari awal. Biasanya kami mulai dari pilot 30-45 hari di satu area paling urgent: Stock Control, Production Control, atau Maklon.

Jika relevan, saya ingin ajak diskusi 20 menit untuk memahami flow pabrik Bapak/Ibu dan melihat apakah PolyFlow bisa membantu.

Terima kasih,
[Nama]
```

---

## 12. Proposal Structure

Gunakan struktur proposal sederhana:

1. Ringkasan pain.
2. Scope pilot.
3. Flow yang akan diuji.
4. Data yang dibutuhkan.
5. Timeline 30-45 hari.
6. Success metrics.
7. Tanggung jawab PolyFlow.
8. Tanggung jawab customer.
9. Harga pilot / commercial terms.
10. Opsi lanjut setelah pilot.

---

## 13. Closing Script

### Soft close setelah demo

> “Dari demo ini, bagian mana yang paling relevan dengan masalah pabrik Bapak/Ibu?”

### Pilot close

> “Kalau kita tidak langsung rollout besar, tapi pilot 30-45 hari untuk [stok/produksi/maklon] di [lokasi/produk], apakah itu masuk akal untuk Bapak/Ibu?”

### Decision close

> “Agar pilot berhasil, kita butuh 3 hal: sponsor dari Bapak/Ibu, PIC harian, dan scope yang tidak melebar. Kalau tiga hal ini siap, saya bisa susun proposal pilotnya.”

---

## 14. Sales Qualification Checklist

Sebelum lanjut proposal, pastikan:

- [ ] Pain jelas dan urgent.
- [ ] Ada decision maker.
- [ ] Ada user champion.
- [ ] Scope pilot bisa dibatasi.
- [ ] Data dasar tersedia.
- [ ] Mereka setuju weekly review.
- [ ] Ada potensi budget setelah pilot.
- [ ] Tidak meminta custom besar sebagai syarat awal.

Jika 5 dari 8 tidak terpenuhi, jangan buru-buru proposal. Lakukan discovery tambahan atau disqualify sementara.
