# PolyFlow Beta Plan

**Tanggal:** 2026-05-27  
**Target:** Menjalankan beta PolyFlow secara terukur, tidak melebar, dan menghasilkan bukti market fit.

---

## 1. Tujuan Beta

Beta PolyFlow bukan sekadar “user coba aplikasi”. Beta harus membuktikan 5 hal:

1. Target customer benar-benar punya pain yang cukup kuat.
2. PolyFlow menyelesaikan pain tersebut lebih baik dari Excel/manual/current system.
3. Implementasi bisa dilakukan bertahap tanpa membuat tim customer kewalahan.
4. Customer bersedia membayar setelah melihat value.
5. PolyFlow mendapat insight untuk packaging, onboarding, pricing, dan product roadmap.

---

## 2. Hipotesis yang Diuji

### Hipotesis market

> Pabrik plastik converting kecil-menengah di Indonesia butuh sistem operasional yang lebih spesifik dari accounting software, tetapi lebih ringan dan bertahap dari ERP enterprise.

### Hipotesis value

> Pain paling kuat ada di stok, produksi, scrap, HPP, dan maklon.

### Hipotesis packaging

> Customer lebih mudah membeli PolyFlow jika dimulai dari paket Stock Control atau Production Control, bukan full ERP.

### Hipotesis adoption

> Operator dan gudang mau memakai sistem jika UI-nya sederhana dan flow-nya mengikuti pekerjaan harian.

### Hipotesis monetization

> Setelah pilot berhasil, customer bersedia lanjut ke subscription + implementation fee.

---

## 3. Struktur 18 Beta Accounts

Jangan menjalankan 18 beta sebagai satu kelompok besar. Pecah menjadi 3 cohort.

| Cohort | Jumlah | Fokus | Target hasil |
|---|---:|---|---|
| Cohort A | 6 akun | Stock Control | Validasi pain stok dan opname. |
| Cohort B | 6 akun | Production Control | Validasi work order, material issue, output, scrap. |
| Cohort C | 6 akun | Maklon / Costing | Validasi niche value dan premium willingness-to-pay. |

### Kenapa perlu cohort

- Feedback lebih jelas.
- Demo dan onboarding lebih fokus.
- Tim support tidak kewalahan.
- Data keberhasilan bisa dibandingkan.
- Roadmap produk lebih mudah diprioritaskan.

---

## 4. Kriteria Seleksi Beta Account

### Must-have

- Pabrik plastik/converting atau proses produksi yang mirip.
- Ada sponsor internal: owner, direktur, atau operational manager.
- Ada minimal 1 admin operasional yang akan aktif input/validasi data.
- Bersedia menyediakan sample data produk, lokasi, stok, dan flow produksi.
- Bersedia ikut weekly review selama beta.
- Bersedia memberi feedback jujur dan case study internal jika berhasil.

### Nice-to-have

- Sudah punya data Excel yang bisa diimport.
- Punya masalah stok atau produksi yang jelas.
- Punya 1 lini produksi prioritas untuk pilot.
- Punya volume transaksi cukup agar value terlihat.
- Punya willingness-to-pay setelah beta.

### Red flags

- Tidak ada owner/sponsor yang peduli.
- Minta custom besar sebelum mencoba flow standar.
- Data master sangat kacau tapi tidak ada PIC cleanup.
- Ingin full accounting migration dari hari pertama.
- Tidak mau meluangkan waktu untuk training dan review.
- Menganggap beta sebagai implementasi gratis tanpa komitmen.

---

## 5. Scope Beta yang Disarankan

### Scope maksimal per beta

- 1 pabrik/site.
- 1-2 lokasi gudang/produksi utama.
- 1 lini produksi atau 1 flow utama.
- 5-20 SKU prioritas.
- 1-3 admin.
- 1-5 operator/gudang.
- 30-45 hari.

### Yang tidak boleh masuk scope awal kecuali sangat perlu

- Migrasi semua data historis.
- Semua SKU dan semua cabang.
- Full accounting migration.
- Custom report besar.
- Integrasi mesin/IoT.
- Integrasi marketplace/e-commerce.
- Semua approval kompleks.

---

## 6. Timeline Beta 45 Hari

### Minggu 0 — Qualification & Scoping

Aktivitas:

- Discovery call.
- Pilih cohort: Stock, Production, Maklon/Costing.
- Tentukan champion internal.
- Tentukan produk/lokasi/order prioritas.
- Set expectation: beta bukan full rollout.

Deliverable:

- Beta scope 1 halaman.
- Success criteria.
- Data checklist.

### Minggu 1 — Setup & Master Data

Aktivitas:

- Import/setup produk prioritas.
- Setup lokasi.
- Setup user/role.
- Setup initial stock terbatas.
- Setup BOM jika Production/Maklon cohort.

Deliverable:

- Master data siap untuk pilot.
- Training admin 1.

### Minggu 2 — First Live Transaction

Aktivitas per cohort:

- Stock: receive, transfer, adjustment/opname.
- Production: production order, material issue, output, scrap.
- Maklon: receive bahan customer, SO maklon, work order.

Deliverable:

- Minimal 1 transaksi end-to-end berhasil.
- Issue log pertama.

### Minggu 3 — Daily Usage

Aktivitas:

- Pakai untuk transaksi harian scope pilot.
- Weekly review data quality.
- Catat blocker adoption.
- Perbaiki training/SOP, bukan langsung custom fitur.

Deliverable:

- 5-10 transaksi real masuk sistem.
- Adoption score awal.

### Minggu 4 — Reporting & Value Review

Aktivitas:

- Review stok, production history, scrap, costing basic.
- Bandingkan dengan proses lama.
- Interview owner dan user lapangan.

Deliverable:

- Value report beta.
- List gap produk.
- List operational habit yang perlu diperbaiki.

### Minggu 5-6 — Conversion Decision

Aktivitas:

- Present hasil beta ke decision maker.
- Tawarkan paket lanjut.
- Tentukan rollout phase 2.
- Minta testimonial/case study jika cocok.

Deliverable:

- Go/no-go subscription.
- Proposal paket lanjut.
- Roadmap implementasi customer.

---

## 7. Success Metrics

### Adoption metrics

| Metric | Target minimum |
|---|---:|
| Admin aktif mingguan | >= 1 PIC aktif |
| Transaksi pilot masuk sistem | >= 80% dari scope pilot |
| Weekly review hadir | >= 4 dari 5 sesi |
| Operator/gudang bisa pakai flow dasar | Ya |
| Data master dipakai tanpa banyak correction | >= 70% cukup valid |

### Operational metrics

| Cohort | Metric | Target minimum |
|---|---|---:|
| Stock | Stock movement tercatat | >= 30 movement atau sesuai volume pilot |
| Stock | Opname selesai | >= 1 session |
| Production | Work order selesai | >= 10 WO atau sesuai volume pilot |
| Production | Output & scrap tercatat | >= 80% WO pilot |
| Maklon | Order maklon end-to-end | >= 3 order |
| Costing | Cost breakdown bisa dibaca owner/finance | Ya |

### Commercial metrics

| Metric | Target |
|---|---:|
| Beta ke paid conversion | >= 30-50% awal |
| Qualified case study | >= 3 akun |
| Clear willingness-to-pay signal | >= 50% akun |
| Referral/intro dari beta | >= 2 intro |

---

## 8. Beta Scorecard

Gunakan score 1-5.

| Area | Pertanyaan | Score |
|---|---|---:|
| Pain strength | Apakah masalahnya penting dan urgent? | 1-5 |
| Sponsor strength | Apakah owner/manager aktif? | 1-5 |
| Data readiness | Apakah data cukup bersih untuk pilot? | 1-5 |
| Adoption | Apakah user mau pakai sistem? | 1-5 |
| Product fit | Apakah fitur standar cukup cocok? | 1-5 |
| Value proof | Apakah hasil beta terlihat jelas? | 1-5 |
| Willingness to pay | Apakah mau lanjut bayar? | 1-5 |

Interpretasi:

- 28-35: strong fit, prioritas conversion.
- 20-27: moderate fit, butuh scope/enablement lebih tajam.
- <20: jangan dipaksa, dokumentasikan alasan.

---

## 9. Data Checklist per Cohort

### Stock Control

Data wajib:

- Daftar produk/SKU prioritas.
- Unit utama dan unit penjualan.
- Lokasi gudang/produksi.
- Stok awal per lokasi.
- Daftar transaksi umum: receive, transfer, adjustment, issue manual.

Data opsional:

- Minimum stock alert.
- Supplier utama.
- Customer utama.
- Kategori produk.

### Production Control

Data wajib:

- Produk output prioritas.
- Material input.
- BOM/formula sederhana.
- Lokasi source material.
- Lokasi output.
- Mesin/lini produksi.
- Operator/supervisor.

Data opsional:

- Scrap standard.
- Cycle time.
- Shift.
- Downtime categories.

### Maklon / Costing

Data wajib:

- Customer maklon.
- Item service/jasa.
- Bahan titipan customer.
- Lokasi customer-owned.
- Flow receive bahan.
- Flow consumption.
- Dasar penagihan jasa.

Data opsional:

- Cost item maklon.
- Return bahan.
- Contract/rate card.

---

## 10. Weekly Review Format

Agenda 45 menit:

1. 5 menit — status usage minggu ini.
2. 10 menit — transaksi yang berhasil.
3. 10 menit — masalah data/proses.
4. 10 menit — issue produk/UX.
5. 5 menit — keputusan perubahan scope.
6. 5 menit — action items minggu depan.

Catatan penting:

- Pisahkan masalah produk vs masalah disiplin operasional.
- Jangan semua feedback langsung dijadikan fitur.
- Tanya “apakah ini blocker go-live atau nice-to-have?”

---

## 11. Interview Questions

### Untuk owner

1. Sebelum PolyFlow, laporan apa yang paling tidak Anda percaya?
2. Setelah pilot, data apa yang mulai terlihat lebih jelas?
3. Apakah PolyFlow membantu mengambil keputusan lebih cepat?
4. Jika harus bayar bulan depan, alasan utama bayar atau tidak bayar apa?
5. Fitur apa yang wajib ada agar Anda lanjut rollout?

### Untuk kepala gudang

1. Transaksi apa yang paling sering lupa dicatat?
2. Apakah flow receive/transfer/adjustment cukup mudah?
3. Apakah stock opname lebih mudah atau lebih sulit?
4. Data apa yang masih perlu dicatat di luar PolyFlow?
5. Bagian mana yang bikin tim gudang keberatan?

### Untuk kepala produksi/operator

1. Apakah input work order/material/output mudah dipahami?
2. Apakah kiosk cukup sederhana?
3. Kapan operator paling mungkin lupa input?
4. Apa yang masih lebih cepat dilakukan di kertas?
5. Apakah scrap/reject bisa dicatat sesuai kebiasaan lapangan?

### Untuk finance

1. Apakah data produksi membantu menjelaskan HPP?
2. Apakah costing report cukup mudah dipahami?
3. Data apa yang masih kurang untuk closing/reporting?
4. Apakah PolyFlow harus integrasi dengan accounting existing atau menggantikan?
5. Apa syarat minimal agar finance mau pakai data PolyFlow?

---

## 12. Beta Offer

Contoh offer:

> “Kami sedang membuka beta terbatas untuk pabrik plastik converting. Fokusnya bukan implementasi ERP besar, tapi pilot 30-45 hari untuk membuktikan satu pain utama: stok, produksi, atau maklon. Jika hasilnya jelas dan cocok, baru kita lanjutkan ke paket berbayar dan rollout bertahap.”

### Yang diberikan PolyFlow

- Setup environment pilot.
- Import master data terbatas.
- Training admin/user.
- Weekly review.
- Value report akhir beta.

### Yang diminta dari customer

- PIC aktif.
- Data master prioritas.
- Akses ke proses nyata.
- Feedback mingguan.
- Keputusan lanjut/tidak lanjut di akhir beta.

---

## 13. Conversion Plan Setelah Beta

### Jika beta berhasil

Tawarkan:

1. Subscription paket sesuai cohort.
2. Rollout phase 2.
3. Add-on costing/maklon jika relevan.
4. Implementation support berbayar.
5. Testimonial/case study.

### Jika beta cukup tapi belum kuat

Tawarkan:

1. Perpanjangan pilot berbayar ringan.
2. Scope lebih sempit.
3. Training tambahan.
4. Data cleanup service.

### Jika beta gagal

Dokumentasikan:

- Pain kurang kuat?
- Sponsor lemah?
- Produk tidak fit?
- Data terlalu kacau?
- Harga tidak cocok?
- Workflow terlalu berbeda?

Jangan dipaksakan menjadi customer berbayar jika fit rendah.

---

## 14. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Scope melebar | Beta tidak selesai | Batasi lokasi, SKU, dan flow. |
| User tidak input | Data tidak valid | Pilih champion, training, weekly review. |
| Owner tidak aktif | Conversion rendah | Wajib owner review di awal dan akhir. |
| Data master kacau | Implementasi lambat | Mulai dari SKU prioritas. |
| Semua dianggap bug | Roadmap kacau | Klasifikasi product gap vs process gap. |
| Minta custom besar | Margin project rusak | Simpan sebagai phase 2 berbayar. |
| Finance terlalu cepat masuk | Risiko tinggi | Mulai dari operasi dulu. |

---

## 15. Output yang Harus Dihasilkan dari Beta

Minimal setelah 18 beta:

1. 3 case study kuat.
2. 5-10 testimonial pendek.
3. Conversion data per cohort.
4. Objection list nyata.
5. Pricing feedback.
6. Product gap ranking.
7. Onboarding playbook.
8. Demo dataset yang makin realistis.
9. Sales deck yang sudah tervalidasi.
10. Decision: paket mana yang paling marketable.

---

## 16. Rekomendasi Eksekusi

Mulai dengan 3 beta pertama saja:

1. 1 Stock Control.
2. 1 Production Control.
3. 1 Maklon/Costing.

Setelah 2 minggu, review:

- Mana yang paling cepat aha moment?
- Mana yang paling sulit onboarding?
- Mana yang paling besar willingness-to-pay?

Baru scale ke sisa 15 akun.
