# Panduan Direktori Scripts

Indeks navigasi, **bukan daftar command yang aman dijalankan**. Baca isi skrip,
caller, target database, dan runbook sebelum eksekusi. Nama `audit`, `check`, atau
`dry-run` saja bukan jaminan tidak ada efek samping.

## Struktur

| Lokasi | Peran |
| --- | --- |
| `scripts/` | Entrypoint operasional dan tool yang path-nya mungkin dipakai npm, image, runbook, atau scheduler |
| `ci/` | Benchmark, timing, dan pelaporan CI; lihat [CI performance](../docs/development/ci-performance.md) |
| `lib/` | Helper bersama untuk skrip operasional |
| `data/` | Mapping/config pendukung legacy; bukan tempat menambahkan dump atau data pelanggan |
| `archive/` | Skrip historis; baca [peringatan arsip](archive/README.md) sebelum menyentuhnya |

## Kelompok entrypoint

| Kategori | Contoh file untuk diperiksa |
| --- | --- |
| Guard repository | `check-agents-consistency.sh`, `check-node-version.sh` |
| Lifecycle database/tenant | `migrate-all-tenants.ts`, `provision-tenant.ts`, `tenant-db.sh` |
| Sync/backup database | `sync-db-prod.sh`, `push-db-to-prod.sh`, `backup-db.sh` |
| Akses SQL eksplisit | `tenant-psql-read.sh`, `tenant-psql-write.sh` |
| Diagnosis dan audit | `check-ob.js`, `audit-permission-orphans.ts`, `audit-duplicate-production-voids.js` |
| Repair/backfill/retention | `backfill-missing-finance-journals.ts`, `patch-stuck-routing-runs.ts`, `cleanup-performance-metrics.ts` |
| Printing | `autoprint-epson.ps1` |

Daftar ini bukan inventaris status aktif setiap skrip. Skrip yang tidak tercantum
belum tentu usang, dan tidak dirujuk source aplikasi belum tentu tidak dipakai
operator/scheduler. Jangan memindahkan atau menghapusnya berdasarkan nama saja.

## Batas operasi dan penataan

- **`npm run dev` menjalankan sync database produksi ke lokal** melalui
  `sync-db-prod.sh`. Untuk menjalankan Next tanpa sync tersebut, lihat
  [setup lokal](../docs/CONTRIBUTING.md).
- Eksekusi produksi membutuhkan approval eksplisit dan runbook lokal
  `docs/ops/vps.md`; bila tidak tersedia, berhenti dan minta detail.
- Path dapat digunakan oleh `package.json`, `Dockerfile`, `entrypoint.sh`, CI,
  runbook, atau scheduler eksternal. Audit caller sebelum rename/pemindahan.
- Jangan menjalankan repair, migration, seed, atau restore sebagai bagian dari
  merapikan folder. Perubahan tool tersebut mengikuti jalur risiko di
  [AGENTS.md](../AGENTS.md).
- Skrip sekali pakai hanya masuk `archive/` setelah status dan penggantinya
  diverifikasi; perbarui seluruh referensi. Pertahankan jejak audit.
- Data kerja, dump, credential, log, dan laporan tenant tetap lokal/gitignored.
