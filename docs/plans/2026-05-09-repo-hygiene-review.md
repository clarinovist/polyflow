# PolyFlow Repo Hygiene Review

Tanggal: 2026-05-09
Status: completed review, low-risk cleanup applied

## Ringkasan

Tujuan review ini adalah merapikan status working tree setelah push Cost Guardrail Phase 1 tanpa menyentuh dokumen riset/analisis yang mungkin masih mau dipertahankan.

Yang dilakukan hanya cleanup aman dan reversible:
- meninjau file untracked yang tersisa
- memastikan mana yang sebaiknya tetap sebagai dokumen project
- merapikan `.gitignore` agar artefak lokal agent/cache tidak terus muncul di repo status

## Temuan utama

### 1. `.hermes/context.md` masih muncul sebagai untracked
Ini jelas artefak lokal project context, bukan source project.

Aksi:
- `.hermes/` ditambahkan ke `.gitignore`

### 2. Rule ignore untuk cache/dev artifacts masih kurang lengkap
Sebelumnya `.gitignore` belum mencakup beberapa artefak lokal umum.

Aksi:
- tambah `/.pytest_cache/`
- tambah `/.ruff_cache/`
- tambah `**/.DS_Store`
- tambah `.claude/`
- tambah `.hermes/`

### 3. Sisa file untracked mayoritas berupa dokumen kerja, bukan sampah teknis
File yang masih untracked setelah cleanup bukan cache/tooling, tetapi dokumen yang secara isi tampak valid dan relevan dengan project:
- `docs/HARMONISASI_GOOGLE_SHEETS.md`
- `docs/plans/2026-05-07-migrasi-rafia-ke-polyflow.md`
- `docs/plans/2026-05-09-polyflow-cost-guardrail-enhancements-draft.md`
- `docs/plans/2026-05-09-review-live-ori-after-packing-bom.md`
- `docs/plans/2026-05-09-review-residue-avg-cost-legacy-kiyowo.md`
- `docs/polyflow_audit.md`

Kesimpulan:
- file-file ini bukan kandidat `.gitignore`
- perlu diputuskan terpisah: commit sebagai project docs, pindah ke archive, atau biarkan lokal dulu

## Klasifikasi file untracked

| File | Jenis | Rekomendasi |
|---|---|---|
| `.hermes/context.md` | local agent/project context | ignore |
| `docs/HARMONISASI_GOOGLE_SHEETS.md` | project analysis doc | review lalu commit/archive |
| `docs/plans/2026-05-07-migrasi-rafia-ke-polyflow.md` | migration plan | review lalu commit/archive |
| `docs/plans/2026-05-09-polyflow-cost-guardrail-enhancements-draft.md` | feature draft | review lalu commit/archive |
| `docs/plans/2026-05-09-review-live-ori-after-packing-bom.md` | investigation note | review lalu commit/archive |
| `docs/plans/2026-05-09-review-residue-avg-cost-legacy-kiyowo.md` | investigation note | review lalu commit/archive |
| `docs/polyflow_audit.md` | audit note (contains secret-location references) | review carefully before any commit |

## Perubahan yang diterapkan

File:
- `.gitignore`

Perubahan:
- tambah cache ignore: `/.pytest_cache/`, `/.ruff_cache/`
- tambah nested macOS artifact ignore: `**/.DS_Store`
- tambah local tool dir ignore: `.claude/`, `.hermes/`

## Dampak

Sesudah perubahan ini:
- artefak lokal agent tidak lagi mengotori `git status`
- cache/dev file umum lebih bersih
- dokumen kerja yang tersisa jadi lebih jelas untuk direview satu per satu

## Yang sengaja belum dilakukan

- belum menghapus file untracked mana pun
- belum meng-archive dokumen investigasi/draft
- belum commit perubahan `.gitignore`
- belum menyentuh `docs/polyflow_audit.md` karena perlu review ekstra sebelum dianggap aman untuk repo

## Rekomendasi next step

Opsi A — konservatif
- commit hanya `.gitignore` + dokumen review ini
- biarkan dokumen untracked lain tetap lokal sampai dipilih satu-satu

Opsi B — rapikan docs kerja
- review isi dokumen untracked satu per satu
- commit yang memang berguna untuk project history
- pindahkan sisanya ke `docs/plans/archive/` atau folder arsip lain yang disepakati

Rekomendasi saya:
- lakukan Opsi A dulu sekarang karena low-risk
- lalu lanjut batch review dokumen untracked agar repo benar-benar bersih tanpa buang konteks kerja penting
