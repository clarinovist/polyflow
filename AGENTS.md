# Workflow Rules

## Workflow Utama — WAJIB (Plan → Fix → Gap → Verify → Build)

Urutan ini JANGAN dibalik. Setiap ada masalah model / feature / bug:

### 1. PLAN — simpan di `docs/plan/`

- File: `docs/plan/YYYY-MM-DD-<slug>.md` (contoh: `docs/plan/2026-07-26-fix-packing-karung-hpp.md`)
- Isi minimal: konteks masalah, root cause, scope file yang kena, rencana fix, residual gap checklist, test scope.
- Template: `docs/plan/_TEMPLATE.md` (satu-satunya file di folder ini yang di-commit)
- Jika model ada masalah: tulis dulu plan, jangan langsung edit code.
- Plan harus ada sebelum mulai fix.
- **`docs/plan/` di-gitignore** — repo ini publik, dan plan rutin memuat detail
  internal (alamat host, email akun, nama tenant). Jadi plan tetap lokal: jangan
  coba `git add` isinya, dan jangan berasumsi plan lama ada di clone baru.

### 2. FIX — jalankan sesuai plan

- Implementasi fix sesuai plan.
- Setelah edit massal 5+ file: wajib `git status --short` + `git diff --stat` (lihat Batch Edit Safety).

### 3. RESIDUAL GAP CHECK — loop sampai 0

- Setelah fix selesai, cek lagi apa yang masih kurang / tidak sesuai plan.
- Buat checklist gap di plan file bagian `## Residual Gap`.
- Fix gap → cek lagi → ulang sampai `Residual Gap: 0`.
- Gap 0 baru boleh lanjut ke verify.

### 4. VERIFY — Lint + Test Scope + Coverage

- **Lint**: `npm run lint` — wajib lolos. Jika gagal, fix dulu.
- **Test Scope**: `npm run test` atau scoped test sesuai area yang diubah (contoh: `npm run test -- packing`, `vitest run src/modules/foo`).
    - Pilih scope paling relevan dengan perubahan, jangan asal full test kalau scope kecil — tapi minimal scope tersebut harus lolos.
    - Jika ada test terkait di `docs/plan`, jalankan itu.
    - Semua test wajib berada di dalam `src/`, memakai folder `__tests__`. Glob
      `include` milik vitest hanya mencakup `src/`, jadi test di luar itu tidak
      pernah dijalankan — direktori `tests/` di root sempat mati diam-diam
      selama 5 bulan karena hal ini.
- **Coverage**: `npm run test:coverage` — wajib lolos sebelum push. Config di `vitest.config.ts` → `test.coverage.thresholds`.
    - Threshold `71/63/75/72` (Stmts/Branch/Funcs/Lines) itu **ratchet guard**, target 80%. **Jangan turunkan hanya untuk hijauin CI** — turunin = hutang coverage naik. Kalau fail, tambah test dulu, jangan sentuh config.
    - Provider `v8` tanpa `include` broad sengaja (hanya surface yang ke-exercise test). Konsekuensinya: menambah test untuk modul yang tadinya tidak tersentuh justru bisa menurunkan rasio global — anggarkan test ekstra sebelum mulai.
    - **Setiap service/action baru ≥100 baris** wajib ada `__tests__/*.test.ts` yang cover happy path + branch utama sebelum PR. Jika tidak, coverage global drop (gate di job `test` → `npx vitest run --coverage`).
    - **Jika CI gagal coverage**: `npm run test:coverage` lokal, lihat file di paling bawah tabel (Lowest %), tambah test untuk uncovered lines yang di-list di kolom paling kanan. Commit coverage fix sebelum push.
    - **Boleh exclude** hanya untuk: `*.d.ts`, `src/lib/schemas/**`, `src/generated/**`, `**/*.test.ts` (sudah di config). Jangan exclude service prod untuk boost ratio.
    - **When stuck**: tulis plan di `docs/plan/` dulu — scope file yang bikin coverage drop, rencana test, residual gap — lalu fix test, bukan config.
    - Riwayat: aturan mitigasi ini ditambahkan 2026-07-27 setelah CI berulang kali gagal di gate coverage.
- **Typecheck**: `npx tsc --noEmit` — wajib 0 error. Error di file test tetap dihitung; vitest lolos bukan berarti typecheck lolos.
- Jika lint/test/coverage gagal: balik ke step 2 (FIX), update residual gap.

### 5. BUILD — terakhir, dengan koordinasi terminal

- **Build**: `npm run build` — ini step paling terakhir setelah lint + test scope lolos + gap 0.
- **Aturan build + terminal lain**:
    - Jika ada aktivitas di terminal lain yang masih jalan (dev server, test watcher, migration, e2e, dsb), **JANGAN** langsung build.
    - Tunggu sampai terminal lain idle / selesai, ATAU tunggu perintah eksplisit user ("build", "gas build", "ship", "push").
    - Alasan: build berat (Next.js standalone), bisa konflik port / lock file / OOM kalau barengan.
- Jika build gagal: fix → ulang lint + test scope → build lagi.

### Batch Edit Safety

- Setelah edit massal 5+ file / write ulang component, **WAJIB** `git status --short` + `git diff --stat` sebelum next step.
- Pernah terjadi file revert hilang: `contextual-help.tsx` + `production/orders/page.tsx` + `support/page.tsx` + `chat-panel.tsx` + `virtual-cs-service.ts` dll reverted setelah write ulang — karena codegraph index lag + tool overwrite.
- Jika file hilang dari `git status`, re-apply via `Write` atau `Edit` dan verify lagi `grep -n "citedArticles\|prefillQuestion"` ada.
- Begitu review diff selesai, **langsung `git add` scope sendiri**. Perubahan yang belum di-stage hilang permanen kalau ke-overwrite; yang sudah di-stage masih bisa dipulihkan lewat `git fsck --unreachable`.

## Model & Delegasi

Berlaku untuk sub-agent Claude Code, worker OpenCode, dan agent definition apa pun yang
nanti dibuat di `.claude/agents/`.

- **Default: warisi model sesi.** Jangan set `model:` di agent definition kecuali alasannya
  bisa ditulis. Per 2026-08-07 belum ada satu pun file di `.claude/agents/` maupun
  `~/.claude/agents/`, jadi semua sub-agent otomatis ikut model sesi — itu perilaku yang
  diinginkan, bukan kelalaian.
- **Worker yang menulis atau mengubah code: minimum Sonnet.** Termasuk migration SQL dan test.
- **Haiku hanya untuk task mekanis murni yang bounded** — rename massal, format ulang,
  ekstraksi list, pemetaan satu-satu yang polanya sudah ada di file lain. Hasilnya tetap
  masuk residual gap loop + verify yang sama; tidak ada jalur cepat.
- **Jangan turunkan tier untuk menghemat.** Biaya review orchestrator sama saja siapa pun
  yang menulis. Satu putaran gap loop tambahan sudah menghapus seluruh selisih tier.
  Penghematan nyata ada di `/clear` lebih sering dan menghindari `Read` file besar berulang
  — cache-read yang mendominasi biaya, bukan output.
- **Alasan spesifik repo ini**: kegagalan mahal di sini senyap, bukan crash — coverage drop
  kecil baru ketahuan di CI, `AuditLog` ke-create pakai outer client bukan `tx`, migration
  lolos di satu database tenant tapi bermasalah di tenant lain. Yang bikin worker aman adalah
  kemampuan berhenti dan bilang "ini di luar scope yang saya paham" — dan itu yang paling
  dulu hilang saat tier diturunkan.
- **Belum diukur.** Per 2026-08-07 belum pernah ada worker Haiku di repo ini; poin di atas
  penilaian dari bentuk masalah, bukan data. Kalau mau diuji: ambil satu task mekanis
  bounded, jalankan di Haiku, catat berapa putaran gap loop sampai 0, lalu bandingkan.
- **Konflik dengan rule global**: `~/.claude/rules/common/performance.md` (di luar repo)
  menyarankan Haiku untuk "worker agents in multi-agent systems". Untuk repo ini, aturan di
  file ini yang menang.

## OpenCode Worker Orchestration (Primary Agent → OpenCode)

Agent utama yang aktif (misalnya Codex atau Claude Code) boleh bertindak sebagai
**orchestrator** dan memakai OpenCode lokal sebagai coding worker. Delegasi ini
opsional, bukan pengganti workflow utama. Orchestrator tetap bertanggung jawab
atas plan, pembatasan scope, review diff aktual, residual gap, verifikasi akhir,
dan keputusan commit/push.

### Kapan dipakai

- Cocok untuk task implementasi yang jelas, bounded, dan cukup besar sehingga
  eksplorasi/penulisan patch bisa dipisahkan dari review.
- Untuk edit kecil atau one-line fix, kerjakan langsung; delegasi biasanya
  menambah overhead.
- Jangan menjalankan beberapa worker pada file yang sama. Repo ini shared
  workspace; gunakan satu writer per file/scope. Jika benar-benar perlu paralel,
  pakai git worktree terpisah dan integrasikan hasil satu per satu.
- Operasi production/VPS, seeding, migration deploy, credential, commit, push,
  dan deploy tetap dijalankan oleh orchestrator sesuai approval dan aturan repo.
  Worker boleh menulis code atau migration file yang sudah tercakup dalam plan,
  tetapi tidak boleh mengeksekusi perubahan ke database production.

### Urutan wajib

1. Orchestrator inspect repo dan membuat plan di `docs/plan/` terlebih dahulu.
2. Pastikan runtime tersedia dengan `command -v opencode`; jangan berasumsi
   instalasi atau konfigurasi model/provider selalu sama di setiap environment.
3. Berikan prompt worker yang menyebutkan:
    - root/module `AGENTS.md` dan plan yang harus dibaca;
    - file/scope yang boleh disentuh;
    - acceptance criteria dan test scope;
    - larangan commit, push, deploy, dan operasi database production.
4. Jalankan worker. Mode headless adalah default:

    ```bash
    opencode run \
      --dir "$PWD" \
      --format json \
      "Baca AGENTS.md dan docs/plan/<plan>.md. Implementasikan hanya scope plan. Jangan commit, push, atau deploy."
    ```

5. Untuk proses panjang, boleh jalankan melalui `tmux` dan simpan log di `/tmp`
   agar root repo tetap bersih:

    ```bash
    tmux new-session -d -s opencode-worker \
      "cd '$PWD' && opencode run --dir '$PWD' '...task bounded...' 2>&1 | tee /tmp/opencode-worker.log"
    tail -f /tmp/opencode-worker.log
    ```

6. Setelah worker selesai, orchestrator **wajib** memeriksa workspace nyata dengan
   `git status --short`, `git diff --stat`, dan `git diff`. Jangan percaya summary
   worker tanpa verifikasi file aktual — worker bisa exit `rc=0` tanpa mengedit
   apa pun.
7. Orchestrator menjalankan residual gap loop sampai 0, lalu lint, scoped test,
   coverage, typecheck, dan build sesuai workflow utama. Verifikasi worker tidak
   menggantikan verifikasi orchestrator.
8. Setelah code berubah, jalankan `graphify update .` sesuai aturan graphify.

### Guardrail

- **Mode headless/tmux wajib pakai `--auto`.** Worker jalan di background/tmux
  tanpa ada yang bisa approve permission prompt secara manual — tanpa `--auto`,
  proses macet permanen di tool call pertama yang butuh izin (dikonfirmasi
  2026-08-06). Orchestrator tetap wajib minta persetujuan eksplisit user sebelum
  tiap dispatch (jangan diam-diam diasumsikan boleh), dan syarat lain tetap
  berlaku tanpa kompromi: scope terisolasi sesuai plan, tanpa commit/push/deploy/
  operasi database production.
- Jangan memasukkan secret, credential, production connection string, atau data
  tenant sensitif ke prompt/log worker.
- Jika worker menyentuh file di luar scope atau hasilnya tidak sesuai plan,
  hentikan/reject perubahan tersebut dan review sebelum melanjutkan.
- Jangan jalankan build dari worker ketika terminal lain masih aktif; aturan
  koordinasi build tetap berlaku.
- Sesi tmux yang hidup bukan bukti worker bekerja. Pantau pertumbuhan file log;
  worker bisa menggantung di tengah task berjam-jam tanpa mati.

### Dampak token dan biaya

OpenCode worker **dapat mengurangi token/konteks yang dipakai sesi orchestrator**
karena eksplorasi dan implementasi detail dipindahkan ke worker. Namun ini bukan
jaminan total token atau biaya lebih rendah: OpenCode memakai token provider/model
worker sendiri, sedangkan duplikasi konteks, prompt terlalu luas, atau rework bisa
menaikkan konsumsi total. Untuk efisiensi, delegasikan task yang bounded, kirim
context minimum yang cukup, dan hentikan worker setelah acceptance criteria
terpenuhi.

## Commit & Push

- **Commit** diperbolehkan setelah gap 0 + lint + test scope + build lolos.
- **Jangan pernah push** ke remote tanpa perintah eksplisit dari user. Tunggu user bilang "push" atau "ship" atau "kirim".
- Commit message: jelas, mention plan file kalau ada (`plan: docs/plan/...`).
- Kalau ada session/terminal lain yang juga punya file ter-stage, **commit dengan pathspec** (`git commit <file>...`), jangan `git commit -a` atau tanpa path — index itu dipakai bersama.

### Pre-commit Guard

`git config core.hooksPath .githooks` — **jalankan sekali per clone**, kalau tidak semua guard di bawah ini mati tanpa peringatan.

Tiga penjaga di `.githooks/pre-commit`, masing-masing dengan bypass sendiri (melewati satu tidak melewati yang lain):

| #   | Penjaga                                                                     | Bypass                 |
| --- | --------------------------------------------------------------------------- | ---------------------- |
| 1   | Konsistensi AGENTS.md — jalan saat ada `AGENTS.md` ter-stage                | —                      |
| 2   | Data-file — tolak CSV/XLSX/SQL berisi baris data                            | `ALLOW_DATA_FILES=1`   |
| 3   | Tenant-name — tolak nama tenant/host di file tracked, termasuk di nama file | `ALLOW_TENANT_NAMES=1` |

Guard #3 hanya memindai baris yang **ditambahkan**, jadi mengedit file lama yang sudah terlanjur memuat nama tenant tetap bisa selama tidak menambah yang baru. Polanya dibaca dari `.githooks/sensitive-names.local` — gitignored, karena `pre-commit` sendiri ter-track dan menaruh nama di dalamnya akan mem-publish persis yang dijaga. **Sidecar hilang = guard mati diam-diam**; itu disengaja supaya clone orang lain tidak terblokir file yang tidak bisa mereka lihat, tapi artinya di mesin baru kamu harus membuatnya lagi.

Ada tenant baru? Tambahkan polanya ke sidecar **sebelum** menulis dokumen apa pun tentangnya.

## Database Migration — WAJIB

- Setiap ubah `prisma/schema.prisma` **WAJIB** bikin folder migration:
  `prisma/migrations/YYYYMMDD_name/migration.sql`
- `npx prisma generate` saja TIDAK cukup — deploy menjalankan `prisma migrate deploy`, dan itu butuh file SQL-nya.
- Cara buat migration lokal (tanpa DB): tulis manual SQL, atau `npx prisma migrate dev --name xxx` jika DB lokal ada.
- Setup ini **multi-tenant**: satu migration di-apply ke beberapa database sekaligus. Jangan tulis SQL yang berasumsi cuma ada satu DB, dan jangan kaget kalau ada table yang sengaja kosong di sebagian tenant.
- Daftar database target dan prosedur apply di produksi: `docs/ops/vps.md` (lokal).

## Operasi Produksi & Deploy

Topologi VPS, nama container, daftar database tenant, prosedur deploy, seeding prod, dan
checklist verifikasi setelah deploy ada di **`docs/ops/vps.md`** — lokal, tidak di-commit
karena repo ini publik.

Yang tetap berlaku tanpa perlu membuka file itu:

- **JANGAN build di VPS.** Build dikerjakan CI (GitHub Actions) → image di-push ke registry → VPS hanya pull + restart.
- Deploy, seeding, migration produksi, dan operasi database produksi dijalankan **orchestrator**, bukan worker. Lihat `## OpenCode Worker Orchestration`.
- CI green ≠ data benar. Selalu verifikasi status migration dan isi table setelah deploy.
- Kalau `docs/ops/vps.md` tidak ada di mesin ini (clone baru / worktree), **berhenti dan minta detailnya ke user** — jangan menebak nama container atau database.

## Arsitektur

### Status Change Audit Policy (2026-07-25)

- `withStatusAudit` extension di `src/lib/core/prisma-audit-extension.ts` intercept `update`/`updateMany` where `data.status` present → auto-log ke `AuditLog` dengan `fromStatus`/`toStatus`.
- `AUDITABLE_MODELS` = 41 model (SalesOrder, ProductionOrder, DeliveryOrder, PO, Invoice, JournalEntry, StockOpname, dll).
- Actor via `actorContext` (ALS) di-inject oleh `withTenant` / `withTenantRoute`. Fallback `system` user (seeded di migration `20260725_audit_log_status_trail`).
- Manual `logActivity` tetap WAJIB untuk operasi kritis (cancel, confirm, ship) di dalam `$transaction` agar atomic.
- Known limitation: extension create `AuditLog` pakai outer PrismaClient, bukan `tx` client. Rollback → false positive log. Mitigasi: critical path pakai manual log dalam tx.
- UI: `EntityStatusTimeline` component di `src/components/shared/EntityStatusTimeline.tsx`, dipakai di 19 detail page (SO, PO, DO, Invoice, Journal, BankReconciliation, StockOpname, DeliverySchedule, MaklonReturn, PayrollPeriod, Field/Mobile SO).
- Saat tambah model baru dengan field `status`: tambah nama model ke `AUDITABLE_MODELS` set di `prisma-audit-extension.ts`.
- Migration: `fromStatus`/`toStatus` + 3 index + seed SYSTEM user.
- Lib AGENTS detail: `src/lib/AGENTS.md` (force-tracked).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
