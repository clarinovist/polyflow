# Workflow Rules

**Verifikasi mengikuti risiko, bukan jumlah file/baris. Kurangi administrasi, bukan perlindungan data.**
File ini sumber kebijakan workflow; panduan modul hanya menambah invariant domain.
Navigasi kode: `.agents/AGENTS.md` → `AGENTS.md` area terkait. Baca bagian relevan dari
`docs/development/agent-workflow-reference.md` hanya saat trigger-nya berlaku: diagnosis coverage,
delegasi, hooks, runtime/container, recovery/arsip, atau commit dengan index campuran.

## Alur kerja: pahami → perbaiki → review & verifikasi → laporkan

1. **Pahami:** cek `git status --short`, lindungi WIP, lalu sebut jalur + alasan + acceptance criteria + verifikasi secara singkat sebelum edit. Investigasi bila dampak belum jelas.
2. **Perbaiki:** kerjakan scope yang disepakati. Ringan dan Normal kecil cukup rencana di chat; file plan wajib sebelum fix untuk Kritis, delegasi, atau pekerjaan panjang/multitahap yang perlu handoff. Gunakan `docs/plan/YYYY-MM-DD-<slug>.md`; Kritis mengikuti `_TEMPLATE.md`, termasuk failure path/rollback. Plan rutin lokal/gitignored, jangan stage. Naikkan jalur dan perbarui rencana jika risiko bertambah.
3. **Review & verifikasi:** periksa diff aktual terhadap acceptance criteria, regresi, dan guardrail; selesaikan blocker sebelum commit. Tidak perlu hitungan/checklist “Residual Gap” terpisah. Temuan di luar scope menjadi follow-up kecuali memengaruhi keamanan/kebenaran patch. Gate gagal → fix → review ulang dan ulangi pemeriksaan terdampak.
4. **Laporkan:** ringkas perubahan, jalur, pemeriksaan lolos/gagal/tidak dijalankan beserta alasan, serta cleanup. Gate wajib yang terhalang environment adalah blocker, bukan dianggap lolos.

## Matriks verifikasi lokal sebelum commit

| Jalur | Kriteria | Verifikasi |
| --- | --- | --- |
| **Ringan** | Dokumentasi, typo, styling lokal tanpa perubahan perilaku, akses, data, atau kontrak | Review diff + pemeriksaan relevan. Docs: link/guard; UI: lint file berubah + visual. Test/typecheck bila terdampak; full coverage/build tidak wajib. |
| **Normal** | Bug logika terbatas, komponen, API nonkritis dengan dampak dipahami | `npm run lint`, regression/scoped test, `npx tsc --noEmit`. Full coverage/build hanya sesuai trigger di bawah. |
| **Kritis** | HPP, stok, jurnal, pembayaran/payroll, auth/permission, isolasi tenant, transaksi/audit kritis, schema/migration/data patch, dependency/runtime, konfigurasi build/deploy | Lint + test scope/branch kritis + full coverage + typecheck + build lokal; verifikasi domain/migration sesuai perubahan. |

- Satu baris filter tenant tetap Kritis. Label keuangan murni tampilan bisa Ringan; perubahan rumus, satuan, atau makna operasional bukan typo. Interaksi/alur/akses UI minimal Normal. Refactor shared/cross-module minimal Normal: petakan caller, naikkan ke Kritis jika menyentuh invariant kritis.
- Bug logika perlu regression test yang mengeksekusi perubahan. Test di `src/**/__tests__/` bernama `*.test.ts`, `*.test.tsx`, atau `*.spec.ts`; contoh: `npm run test -- <path-atau-filter>`. Service/action/lib baru ≥100 baris wajib happy path + branch utama.
- **Full coverage lokal** (`npm run test:coverage`) wajib untuk Kritis; juga Normal yang menambah surface modul yang diuji, mengubah shared service berdampak luas, atau memperbaiki kegagalan coverage CI. Selain itu boleh mengandalkan coverage CI.
- **Build lokal** (`npm run build`) wajib untuk Kritis; juga Normal yang memengaruhi routing, server/client boundary, static generation, atau integrasi Next.js. Jalankan terakhir setelah review dan gate lain lolos.
- Normal/Kritis: lint dan typecheck harus 0 error, termasuk test. Threshold coverage **71/63/75/72** (Stmts/Branch/Funcs/Lines), target 80%, tetap dijaga CI. Jangan turunkan threshold, exclude production service demi ratio, melewati guard, atau menurunkan jalur agar cepat/hijau.
- Jangan ulang scoped suite yang sudah tercakup full coverage. Pemeriksaan independen boleh paralel jika resource aman. Gunakan ulang hasil terverifikasi hanya bila input relevan (source/dependency/config/environment) identik; patch lanjutan mengulang gate terdampak, lebih luas bila dampaknya tidak jelas.

## Environment: lokal dulu, Docker bukan default

- Gunakan environment lokal yang tersedia dan sesuai kebutuhan test. **Kritis tidak otomatis berarti Docker.** UI, lint, typecheck, dan unit test tidak memerlukan stack baru bila lokal sudah memadai.
- Jangan otomatis membuat container, menarik/build image lokal, atau menyiapkan stack baru. Jika verifikasi konkret tidak terpenuhi secara lokal, jelaskan kebutuhan, alternatif, dan resource yang akan dibuat; **minta approval eksplisit sebelum provisioning**. Approval edit code bukan approval container.
- Container masuk akal untuk DB test terisolasi yang belum tersedia, perubahan runtime/native dependency/Dockerfile, atau reproduksi khusus Linux/container—bukan kewajiban untuk semua perubahan tersebut. Baca bagian runtime/container di referensi sebelum menjalankannya.
- Jangan gunakan database produksi untuk test. Test yang membutuhkan DB nyata tidak boleh diganti mock hanya demi cepat. Jika environment wajib belum tersedia/disetujui, laporkan blocker; jangan diam-diam melemahkan test.
- Terminal lain aktif bukan otomatis blocker: cek konflik `.next`, workspace, lock, resource/RAM, dan proses DB. Bila konflik, tunggu/koordinasikan isolasi; jangan menghentikan proses sesi lain tanpa izin.

## Workspace & cleanup

- Satu writer per file; pekerjaan paralel overlap memakai worktree terpisah. Jangan menimpa/revert WIP sesi lain. Setelah edit 5+ file atau rewrite component, cek status + `git diff --stat` dan review diff aktual.
- Setelah review, stage hanya scope/hunk sendiri sebagai checkpoint, bukan bukti verifikasi. Jika perubahan hilang, bandingkan diff/index/backup dulu; jangan menulis ulang versi lama secara buta.
- **Selalu rapikan milik tugas sendiri:** cek status/artefak sebelum laporan akhir, hapus sementara/duplikat yang tak diperlukan dan hentikan hanya proses tugas sendiri yang sudah selesai; pastikan resource tidak sedang dipakai sesi lain.
- Pertahankan source, test, docs, `.env`, dependensi lokal, data bisnis, image aktif, skrip recovery, backup yang diperlukan, dan bukti test/rilis. Jangan hapus massal atau Docker prune, mengubah produksi/retensi/backup, atau commit/push hanya demi bersih. Arsip khusus mengikuti referensi; laporkan yang sengaja disimpan/ditunda tanpa dokumen cleanup tambahan.

## Batas keamanan & rilis

- Jaga isolasi tenant, permission, invariant keuangan/stok, dan transaksi atomic. Operasi kritis (cancel/confirm/ship) wajib manual `logActivity` di dalam transaction; audit otomatis memakai outer client. Saat menyentuh status/audit, baca `src/lib/AGENTS.md` dan bagian audit di referensi.
- Setiap perubahan `prisma/schema.prisma` wajib SQL migration di `prisma/migrations/YYYYMMDD_name/migration.sql`; `prisma generate` saja tidak cukup. Review SQL untuk multi-tenant dan tabel kosong, bukan mengasumsikan satu DB.
- Jangan commit secret, credential, data pelanggan, nama tenant/host, atau topologi; simpan privat di `docs/plan/` atau `docs/ops/` (gitignored). Jangan kirim data sensitif ke prompt/log worker; repo private bukan pengecualian.
- Aktifkan hooks sekali per clone: `git config core.hooksPath .githooks`. Pertahankan guard AGENTS, data-file, dan tenant-name; baca referensi saat setup/guard terblokir (sidecar lokal wajib agar guard tenant-name aktif).
- `.nvmrc` dan base Node `Dockerfile` harus sama; CI memakai `node-version-file: '.nvmrc'`. Perubahan runtime mengikuti referensi dan `bash scripts/check-node-version.sh`.
- Commit hanya setelah acceptance criteria/guardrail terpenuhi dan gate lokal jalur lolos. Stage/commit scope sendiri, bukan seluruh index; file campuran harus dipisahkan dulu. Sebut plan pada pesan commit bila ada; detail pathspec ada di referensi.
- **Jangan push tanpa perintah eksplisit user** (“push”, “ship”, “kirim”). Jelaskan bahwa push `main` memicu deploy otomatis. Operasi produksi manual, seeding/migration deploy, dan credential perlu approval eksplisit; edit code bukan izin operasi database.
- **CI tidak dikurangi:** artifact commit SHA yang dideploy wajib lolos `test` (full coverage), `lint`, dan `build-and-push` di `.github/workflows/production.yml`. Build produksi di CI → registry → VPS pull/restart; **jangan build di VPS**.
- Sebelum deploy/operasi produksi, baca `docs/ops/vps.md` lokal; jika runbook tidak ada, berhenti dan minta detail, jangan menebak. Pascadeploy: health/log + smoke test; perubahan schema/data juga wajib verifikasi migration dan invariant/isi tabel tenant target. CI green bukan bukti data benar.

## Delegasi (opsional)

- Edit kecil kerjakan langsung. Setiap dispatch perlu approval eksplisit, file plan, dan scope ownership terbatas; baca prosedur worker di referensi sebelum dispatch. Gunakan Pi, bukan OpenCode.
- Default warisi model sesi. Worker code/migration/test minimum tier Sonnet; Haiku hanya task mekanis bounded. Jangan menurunkan tier demi biaya atau mengganti model tanpa alasan.
- Orchestrator review diff aktual dan bukti verifikasi worker; gunakan hasil identik tanpa mengulang suite. Scope melenceng/overlap → hentikan dan review, jangan revert sesi lain. Operasi produksi, credential, commit/push/deploy hanya orchestrator dengan approval yang diperlukan, bukan worker.

## graphify

- Saat user mengetik `/graphify`, baca skill/instruksi terpasang terlebih dahulu.
- Untuk pertanyaan codebase, jika `graphify-out/graph.json` ada, awali dengan `graphify query "<question>"`; gunakan `graphify path "<A>" "<B>"` untuk relasi atau `graphify explain "<concept>"` untuk konsep terfokus. Dirty graph bukan alasan skip; pengecualian hanya perbaikan graph stale/salah atau user meminta skip.
- Gunakan `graphify-out/wiki/index.md` untuk navigasi luas bila ada. Baca `GRAPH_REPORT.md` hanya untuk review arsitektur luas atau hasil query/path/explain belum cukup.
- Setelah patch kode final, jalankan `graphify update .` sekali (AST-only, tanpa biaya API). Docs-only tidak perlu update.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
