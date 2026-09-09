# Workflow Rules

## Prinsip & Sumber Aturan

**Verifikasi mengikuti risiko, bukan jumlah file/baris.** Kurangi pekerjaan berulang,
bukan perlindungan data. File ini adalah sumber kebijakan workflow; panduan modul
menambah invariant domain, bukan menduplikasi gate lokal.

- Navigasi modul: `.agents/AGENTS.md`, lalu baca `AGENTS.md` pada area yang disentuh.
- Detail coverage, worker, hooks, Node, dan pelajaran insiden:
  `docs/development/agent-workflow-reference.md` — baca bagian yang relevan saja.
- Jangan mengubah threshold, melewati guard, atau menurunkan jalur hanya agar cepat/hijau.

## Workflow Berbasis Risiko — Ringan / Normal / Kritis

Sebelum edit, sebutkan **jalur + alasan + acceptance criteria + verifikasi** secara singkat.
Jika scope/risiko bertambah, naikkan jalur dan perbarui plan sebelum melanjutkan.
Jika dampak belum jelas, investigasi dulu; jangan menganggapnya ringan.

| Jalur | Kriteria / contoh | Plan | Verifikasi lokal sebelum commit |
| --- | --- | --- | --- |
| **Ringan** | Dokumentasi, typo, styling lokal tanpa perubahan perilaku, akses, data, atau kontrak | Cukup di chat; file plan tidak wajib | Review diff + pemeriksaan relevan. Docs: link/guard dokumentasi; UI: lint file berubah + cek visual. Test/typecheck bila terdampak; full coverage dan build lokal tidak wajib. |
| **Normal** | Bug logika terbatas, komponen, API nonkritis dengan dampak yang dipahami | Plan ringkas di `docs/plan/`: masalah/dugaan sebab, scope, acceptance criteria, test | `npm run lint`, regression/scoped test, `npx tsc --noEmit`. Coverage/build lokal mengikuti trigger di bawah. |
| **Kritis** | HPP, stok, jurnal, pembayaran/payroll, auth/permission, isolasi tenant, transaksi/audit kritis, schema/migration/data patch, dependency/runtime atau konfigurasi build/deploy | Plan lengkap dari `docs/plan/_TEMPLATE.md`, termasuk failure path dan rollback | Lint + test scope/branch kritis + full coverage + typecheck + build lokal; tambah verifikasi domain/migration sesuai perubahan. |

**Satu baris filter tenant tetap Kritis.** Label di halaman keuangan bisa Ringan bila
benar-benar hanya tampilan; perubahan rumus, satuan, atau makna operasional bukan typo.
Refactor shared/cross-module bukan Ringan: petakan caller dan naikkan ke Kritis bila
menyentuh invariant kritis. UI yang mengubah alur/interaksi/akses minimal Normal.

### 1. Plan → Fix

- Normal/Kritis: buat `docs/plan/YYYY-MM-DD-<slug>.md` **sebelum fix**. Dugaan root cause
  boleh belum final; perbarui sesuai temuan, jangan mengarang kepastian.
- Plan rutin lokal dan gitignored; hanya `_TEMPLATE.md` yang ditujukan untuk di-commit.
  Jangan stage plan atau memasukkan data tenant/credential ke dokumen tracked.
- Implementasikan hanya scope yang disepakati. Tidak perlu delegasi untuk edit kecil.

### 2. Review Gap — terbatas acceptance criteria

- Review diff aktual dan cek acceptance criteria, regression risk, serta guardrail.
- **Residual Gap: 0** berarti tidak ada gap terhadap scope/acceptance criteria patch ini,
  bukan semua masalah repo selesai. Ringan: cukup catatan di chat; lainnya: checklist plan.
- Temuan di luar scope dicatat sebagai follow-up, bukan otomatis ikut diperbaiki.
  Jika temuan memengaruhi keamanan/kebenaran patch, itu blocker: perluas plan/naikkan jalur.
- Setelah gap implementasi 0, jalankan gate jalurnya. Gate gagal → fix → review ulang →
  ulangi pemeriksaan terdampak. Jangan menyebut gagal/belum dijalankan sebagai lolos.

### 3. Verify — secukupnya, hasilnya jelas

- Pilih scoped test yang benar-benar mengeksekusi perubahan, misalnya
  `npm run test -- <path-atau-filter>`. Test wajib di `src/**/__tests__/` dengan nama
  `*.test.ts`, `*.test.tsx`, atau `*.spec.ts` sesuai discovery vitest. Bug logika perlu
  regression test, bukan hanya test lama yang hijau.
- Normal/Kritis: lint dan typecheck harus 0 error, termasuk file test.
- **Full coverage lokal** (`npm run test:coverage`) wajib untuk Kritis; juga untuk Normal
  bila menambah surface modul yang diuji, mengubah shared service dengan dampak luas,
  atau memperbaiki kegagalan coverage CI. Normal lainnya boleh mengandalkan coverage CI.
- Threshold **71/63/75/72** (Stmts/Branch/Funcs/Lines), target 80%, tetap dijaga CI.
  Jangan menurunkan threshold atau mengecualikan production service demi ratio.
- Service/action/lib baru ≥100 baris wajib test happy path + branch utama. Detail
  perhitungan coverage dan langkah diagnosis ada di referensi workflow.
- **Build lokal** (`npm run build`) wajib untuk Kritis dan perubahan Normal yang
  memengaruhi routing, server/client boundary, static generation, atau integrasi Next.js.
  Selain itu opsional; build image CI tetap wajib sebelum deploy.
- Full coverage yang sudah mencakup scoped test tidak perlu didahului pengulangan suite
  yang sama. Pemeriksaan independen boleh paralel jika resource aman.
- Hasil verifikasi boleh dipakai ulang hanya jika input relevannya tidak berubah
  (source/dependency/config/environment). Setelah patch lanjutan, ulangi gate terdampak;
  perubahan shared/config atau dampak tidak jelas perlu scope lebih luas.
- Ringkasan akhir: jalur, perubahan, pemeriksaan yang lolos/gagal/tidak dijalankan dan
  alasannya. Jika environment menghalangi gate wajib, laporkan blocker, bukan silent skip.

### 4. Build & Koordinasi Terminal

- Bila build lokal diperlukan, jalankan **terakhir** setelah review gap dan gate lokal lain lolos.
- Terminal lain aktif **bukan otomatis blocker**. Cek konflik output `.next`, perubahan
  workspace, lock, resource/RAM, atau proses DB yang memengaruhi verifikasi.
- Jika berkonflik, tunggu atau koordinasikan worktree/output terisolasi. Jangan mematikan
  proses sesi lain tanpa izin. Perintah “build/ship/push” tidak mengizinkan merusak workspace lain.
- Build gagal → fix → ulangi gate terdampak → build lagi.

## Shared Workspace & Batch Edit Safety

- Cek `git status --short` sebelum mulai; jangan menimpa/revert perubahan milik sesi lain.
  Satu writer per file; pekerjaan paralel yang overlap memakai worktree terpisah.
- Setelah edit massal 5+ file atau rewrite component: wajib `git status --short` +
  `git diff --stat`. Review diff sebelum lanjut; jangan percaya summary worker saja.
- Bila perubahan hilang, bandingkan diff/index/backup dulu. Jangan menulis ulang versi
  lama secara buta atau menerapkan marker dari insiden yang tidak terkait.
- Setelah review diff, **stage hanya scope sendiri** sebagai checkpoint. Jika file juga
  memuat edit sesi lain, stage hunk milik sendiri saja atau koordinasikan pemisahannya.

## Commit, Push & Deploy

- **Commit** boleh setelah gap 0 dan gate lokal jalur tersebut lolos. Ringan/Normal yang
  tidak memerlukan build lokal boleh commit tanpa build; staging bukan bukti verifikasi.
- Pesan commit jelas; sebut plan bila ada (`plan: docs/plan/...`). Jika ada file sesi lain
  di index, commit dengan pathspec scope sendiri, bukan `git commit -a`/commit seluruh index.
  Pathspec mengambil isi working tree: file dengan kepemilikan campuran harus dipisahkan dulu.
- **Jangan push tanpa perintah eksplisit user** (“push”, “ship”, “kirim”). Push ke `main`
  memicu pipeline deploy otomatis; jelaskan dampak itu saat meminta approval.
- **Gate CI tidak dikurangi:** deploy menunggu `test` (full coverage), `lint`, dan
  `build-and-push` pada `.github/workflows/production.yml`. Artifact harus berasal dari
  commit SHA yang lolos gate; jangan deploy image hanya karena berhasil dibangun.
- Build produksi di CI → registry → VPS pull/restart. **JANGAN build di VPS.**
- Operasi produksi, seeding, migration deploy, credential, commit/push/deploy tetap oleh
  orchestrator sesuai approval, bukan worker. Untuk operasi produksi manual, minta izin
  eksplisit; jangan menganggap persetujuan edit code sebagai izin mengubah database.
- Prosedur dan topologi produksi ada di **`docs/ops/vps.md`** (lokal). Jika tidak ada,
  berhenti dan minta detail, jangan menebak host/container/database.
- Pascadeploy: cek health/log dan smoke test alur yang berubah. Jika menyentuh schema/data,
  verifikasi migration serta invariant/isi tabel pada tenant target. CI green ≠ data benar.

## Guardrail Data, Database & Runtime

- Jangan commit secret, credential, data pelanggan, nama tenant/host, atau detail topology.
  Simpan detail internal di `docs/plan/` atau `docs/ops/` (gitignored); repo private bukan
  alasan melonggarkan privasi. Jangan kirim detail tersebut ke prompt/log worker.
- Aktifkan hooks sekali per clone: `git config core.hooksPath .githooks`. Pertahankan
  guard konsistensi AGENTS, data-file, dan tenant-name; detail serta sidecar lokal di referensi.
- Setiap ubah `prisma/schema.prisma` wajib file SQL migration di
  `prisma/migrations/YYYYMMDD_name/migration.sql`; `prisma generate` saja tidak cukup.
  Jangan mengasumsikan satu DB: review SQL untuk multi-tenant dan tabel yang bisa kosong.
- `.nvmrc` (dev/CI) dan `FROM node:<versi>-alpine` di `Dockerfile` (produksi) harus sama.
  Workflow memakai `node-version-file: '.nvmrc'`, bukan versi hardcoded. Jika menaikkan Node,
  ubah keduanya dan jalankan `bash scripts/check-node-version.sh`.
- Pertahankan isolasi tenant, validasi permission, invariant keuangan/stok, dan transaksi atomic.
- Status audit otomatis memakai `withStatusAudit` di `src/lib/core/prisma-audit-extension.ts`.
  Tambah model berstatus ke `AUDITABLE_MODELS`. Extension memakai outer client, bukan `tx`:
  **cancel/confirm/ship dan operasi kritis tetap wajib manual `logActivity` di dalam transaction**.
  Detail actor context dan keterbatasan ada di `src/lib/AGENTS.md`; timeline UI memakai
  `src/components/shared/EntityStatusTimeline.tsx`.

## Model & Delegasi

- Default warisi model sesi; jangan set `model:` tanpa alasan spesifik. Worker penulis
  code/migration/test minimum Sonnet. Haiku hanya untuk task mekanis bounded, bukan
  penalaran bisnis; jangan menurunkan tier untuk menghemat dengan mengorbankan review.
- Delegasi opsional untuk scope bounded yang cukup besar; edit kecil kerjakan langsung.
  **Minta approval eksplisit sebelum tiap dispatch.** Plan file wajib untuk delegasi.
- Cek `command -v opencode`; worker headless/tmux wajib `--auto`. Prompt mencantumkan
  AGENTS/plan, file yang boleh disentuh, acceptance criteria/test, dan larangan
  commit/push/deploy/operasi database produksi. Contoh perintah ada di referensi workflow.
- Orchestrator review workspace/diff aktual setelah worker selesai dan memastikan gate
  sesuai jalur. Output verifikasi worker boleh dipakai bila input identik dan hasilnya
  diperiksa; jangan menjalankan suite dua kali hanya karena pelakunya berbeda.
- Scope overlap/hasil melenceng: hentikan worker dan review; jangan revert edit sesi lain.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` once after the final patch, not after every edit (AST-only, no API cost). Documentation-only changes do not require an update.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
