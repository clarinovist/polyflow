# Peta Repository dan Penempatan File

Panduan navigasi/housekeeping, bukan migrasi arsitektur. File konfigurasi di root
sering memiliki path yang dipakai toolchain; jangan dipindah hanya agar terlihat rapi.
Kebijakan workflow tetap mengikuti [AGENTS.md](../../AGENTS.md).

## Source dan toolchain

| Lokasi | Tanggung jawab |
| --- | --- |
| `src/app/` | Route, layout, handler API, dan komponen yang khusus route tersebut |
| `src/actions/<domain>/` | Entry point server action per domain |
| `src/services/<domain>/` | Business logic dan orchestration domain |
| `src/components/<domain>/` | UI per domain; `shared/` dan `ui/` untuk komponen bersama |
| `src/lib/` | Auth, core, schema, helper, konfigurasi, dan utilitas domain |
| `src/hooks/`, `src/types/` | Hook dan tipe bersama |
| `src/modules/_template/` | Scaffold modularisasi; bukan lokasi seluruh fitur aktif |
| `src/**/__tests__/` | Test sesuai kebijakan repo dan discovery Vitest |
| `src/scripts/` | CLI legacy yang perlu ditelusuri sebelum dipindah |
| `prisma/` | Schema, seed tooling, dan migration SQL berurutan |
| `public/` | Aset statis aplikasi, bukan screenshot audit atau desain sementara |
| `scripts/` | Tool operasional, CI, guard, dan arsip; lihat [indeks skrip](../../scripts/README.md) |
| `.github/`, `.githooks/` | Workflow CI dan hook repository |
| Root config | Manifest npm, lockfile, Next/TS/Vitest/ESLint, Docker, dan entrypoint |

Jangan menggabungkan file bernama sama dari domain berbeda tanpa memetakan caller.
Memindahkan service/action, skrip DB, route, atau migration bukan housekeeping ringan:
path, import, discovery, deployment, dan invariant domain bisa terdampak.

## Dokumentasi bersama

| Lokasi | Isi |
| --- | --- |
| `README.md` | Ringkasan proyek dan pintu masuk setup |
| `ARCHITECTURE.md` | Orientasi arsitektur tingkat tinggi |
| `CHANGELOG.md` | Changelog rilis aktif |
| `docs/README.md` | Indeks seluruh kategori dokumentasi |
| `docs/development/` | Referensi development dan tooling |
| `docs/uat/` | Skenario pengujian penerimaan per modul |
| `docs/polyflow-v2/` | Roadmap/desain target modularisasi |
| `docs/archive/` | Catatan historis yang diberi konteks arsip |
| `docs/plan/_TEMPLATE.md` | Satu-satunya plan template yang dibagikan lewat Git |

Dokumen domain existing tetap di path-nya untuk menjaga referensi. Bila suatu
kelompok perlu dipindah, cari seluruh referensinya, pindahkan satu kelompok utuh,
dan perbarui indeks/tautan dalam patch yang sama. Jangan membuat salinan kedua
sebagai “versi baru” tanpa menjelaskan mana sumber utama.

## File lokal dan hasil generate

| Lokasi | Perlakuan |
| --- | --- |
| `docs/plan/` selain template | Plan, laporan, bukti verifikasi lokal; jangan otomatis dihapus setelah rilis |
| `docs/ops/` | Runbook/topologi produksi lokal; bukan dokumen tracked |
| `backups/`, `certs/`, `.env*` selain `.env.example` | Data/credential lokal; bukan sampah build |
| `.next/`, `coverage/`, `*.tsbuildinfo`, `next-env.d.ts` | Output generate; jangan dihapus saat proses terkait masih aktif |
| `graphify-out/`, `.codegraph/` | Indeks/graf lokal; berguna untuk navigasi, bukan source aplikasi |
| `node_modules/` | Dependency terpasang dari manifest/lockfile |
| `sketches/` dan folder konfigurasi agent lokal | Eksperimen/konfigurasi lokal sesuai `.gitignore` |

Folder besar tidak otomatis boleh dihapus. Bersihkan cache hanya setelah memeriksa
proses/output yang memakainya. Retensi backup, audit evidence, dan data kerja
membutuhkan keputusan terpisah; jangan memakai `git clean -fdx` untuk housekeeping.

## Checklist setelah upgrade

1. Cek `git status --short` dan index; jangan menimpa pekerjaan sesi lain.
2. Cocokkan plan fitur dengan catatan integrasi/rilis terakhir. Status WIP lama
   dapat sudah digantikan oleh hasil di worktree lain; jangan menerapkan ulang.
3. Simpan laporan historis dengan label/tanggal dan tautan ke panduan aktif.
4. Pastikan referensi file yang dipindah diperbarui; review diff aktual.
5. Jangan menghapus migration, skrip repair, atau test hanya karena tampak lama.
6. Periksa `git worktree list` sebelum membersihkan workspace. `prune --dry-run`
   hanya inventaris; metadata detached HEAD dapat menjadi satu-satunya petunjuk
   pemulihan. Jangan menghapus worktree/branch tanpa memeriksa ownership dan WIP.
7. Jalankan gate sesuai risiko di root; dokumentasi saja tidak membutuhkan build
   aplikasi atau rebuild graph.
