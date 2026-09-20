# Dokumentasi PolyFlow

Pintu masuk dokumentasi proyek. Bedakan panduan aktif, roadmap, dan catatan historis:
status “selesai” di laporan lama bukan bukti verifikasi untuk versi sekarang.

## Mulai di sini

| Kebutuhan | Dokumen |
| --- | --- |
| Setup lokal dan kontribusi | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Peta folder dan penempatan file | [Repository structure](development/repository-structure.md) |
| Arsitektur tingkat tinggi | [ARCHITECTURE.md di root](../ARCHITECTURE.md) |
| Navigasi modul untuk agent | [.agents/AGENTS.md](../.agents/AGENTS.md) |
| Kebijakan workflow, risiko, dan verifikasi | [AGENTS.md di root](../AGENTS.md) |
| Referensi coverage, worker, hooks, dan Node | [Agent workflow reference](development/agent-workflow-reference.md) |
| Riwayat rilis | [CHANGELOG.md di root](../CHANGELOG.md) |
| Inventaris kategori skrip | [scripts/README.md](../scripts/README.md) |

## Produk, operasional, dan pengujian

- [Ringkasan fitur](FEATURES.md)
- [Design system](DESIGN_SYSTEM.md)
- [Manual manufaktur](manual-manufaktur-v1.md)
- [Panduan produksi hari ini](produksi-hari-ini-guide.md)
- [Panduan routing produksi](panduan-routing-produksi.md)
- [SOP SPK batch harian](SOP_SPK_BATCH_HARIAN.md)
- [SOP MTO, hot loading, dan surat jalan](SOP_MTO_HOT_LOADING_SURAT_JALAN.md)
- [Standar SKU](SKU_STANDARD.md)
- [Checklist UAT per modul](uat/README.md)

Dokumen domain dapat tertinggal dari implementasi. Untuk perubahan transaksi,
cek source, test, dan `AGENTS.md` modul terkait; jangan memakai SOP lama sebagai
pengganti validasi permission, tenant, stok, atau jurnal.

## Development dan arah arsitektur

- [Referensi arsitektur terperinci](ARCHITECTURE.md) — memuat contoh legacy;
  mulai dari overview root untuk orientasi.
- [PolyFlow v2](polyflow-v2/README.md) — roadmap dan desain target, bukan pernyataan
  bahwa seluruh aplikasi sudah berpindah ke `src/modules/`.
- [CI performance](development/ci-performance.md)
- [Assistant persona](development/assistant-persona.md)
- [Assistant evaluation](assistant-evaluation/golden-questions.md)
- [Environment reference](ENV.md) — nilai rahasia tetap di environment lokal.

## Riwayat dan dokumen lokal

- [Arsip dokumentasi](archive/README.md) — laporan implementasi/desain lama.
- [Changelog historis](CHANGELOG.md) — dipertahankan untuk riwayat; rilis baru hanya
  masuk changelog root.
- `docs/plan/` — plan dan bukti kerja **lokal/gitignored**; hanya
  [template plan](plan/_TEMPLATE.md) yang tracked. Bukan daftar backlog otomatis:
  periksa catatan integrasi terbaru sebelum menganggap status lama masih berlaku.
- `docs/ops/` — runbook produksi lokal. Untuk operasi produksi baca
  `docs/ops/vps.md`; jika tidak tersedia, minta detail/approval, jangan menebak.
- `docs/runbooks/`, `docs/deploy/`, `DEPLOYMENT.md`, dan `RUNBOOK.md` memuat referensi
  serta catatan historis. Jangan menjalankan command produksi dari sana tanpa
  memvalidasi runbook lokal dan izin operasi.

Jangan tambahkan credential, identitas tenant, topologi internal, dump, atau data
pelanggan ke dokumen tracked. Aturan lengkap tetap di [AGENTS.md](../AGENTS.md).
