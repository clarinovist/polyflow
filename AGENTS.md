# Workflow Rules

## Workflow Utama — WAJIB (Plan → Fix → Gap → Verify → Build)

Urutan ini JANGAN dibalik. Setiap ada masalah model / feature / bug:

### 1. PLAN — simpan di `docs/plan/`

- File: `docs/plan/YYYY-MM-DD-<slug>.md` (contoh: `docs/plan/2026-07-26-fix-packing-karung-hpp.md`)
- Isi minimal: konteks masalah, root cause, scope file yang kena, rencana fix, residual gap checklist, test scope.
- Template: `docs/plan/_TEMPLATE.md`
- Jika model ada masalah: tulis dulu plan, jangan langsung edit code.
- Plan harus ada sebelum mulai fix.

### 2. FIX — jalankan sesuai plan

- Implementasi fix sesuai plan.
- Setelah edit massal 5+ file: wajib `git status --short` + `git diff --stat` (lihat Batch Edit Safety).

### 3. RESIDUAL GAP CHECK — loop sampai 0

- Setelah fix selesai, cek lagi apa yang masih kurang / tidak sesuai plan.
- Buat checklist gap di plan file bagian `## Residual Gap`.
- Fix gap → cek lagi → ulang sampai `Residual Gap: 0`.
- Gap 0 baru boleh lanjut ke verify.

### 4. VERIFY — Lint + Test Scope

- **Lint**: `npm run lint` — wajib lolos. Jika gagal, fix dulu.
- **Test Scope**: `npm run test` atau scoped test sesuai area yang diubah (contoh: `npm run test -- packing`, `vitest run src/modules/foo`).
  - Pilih scope paling relevan dengan perubahan, jangan asal full test kalau scope kecil — tapi minimal scope tersebut harus lolos.
  - Jika ada test terkait di `docs/plan`, jalankan itu.
- Jika lint/test gagal: balik ke step 2 (FIX), update residual gap.

### 5. BUILD — terakhir, dengan koordinasi terminal

- **Build**: `npm run build` — ini step paling terakhir setelah lint + test scope lolos + gap 0.
- **Aturan build + terminal lain**:
  - Jika ada aktivitas di terminal lain yang masih jalan (dev server, test watcher, migration, e2e, dsb), **JANGAN** langsung build.
  - Tunggu sampai terminal lain idle / selesai, ATAU tunggu perintah eksplisit user ("build", "gas build", "ship", "push").
  - Alasan: build berat (Next.js standalone), bisa konflik port / lock file / OOM kalau barengan.
- Jika build gagal: fix → ulang lint + test scope → build lagi.

## Commit & Push

- **Commit** diperbolehkan setelah gap 0 + lint + test scope + build lolos.
- **Jangan pernah push** ke remote tanpa perintah eksplisit dari user. Tunggu user bilang "push" atau "ship" atau "kirim".
- Commit message: jelas, mention plan file kalau ada (`plan: docs/plan/...`).

## VPS — nugrohopramono

Container polyflow (Next.js) berjalan di VPS ini.

- **Container name**: `polyflow-app`
- **Working dir**: `/root/polyflow`
- **Docker Compose**: `docker compose` (langsung dari `/root/polyflow`)
- **CI/CD**: GitHub Actions (`.github/workflows/production.yml`)
- **Tenant DBs**: `polyflow` (main/control), `kiyowo`, `melindo_rafia` — migrator apply ke semua (104 migrations)

### Aturan Deploy

- **JANGAN build di VPS.** Build dilakukan oleh CI (GitHub Actions) → push image ke `ghcr.io/clarinovist/polyflow:latest` → VPS tinggal `docker compose pull` + restart.
- Perintah deploy yang aman di VPS: pull + up saja, tanpa build.
- Kalau mau deploy manual (darurat): pull image terbaru lalu restart container.

### Database Migration — WAJIB

- Setiap ubah `prisma/schema.prisma` **WAJIB** bikin folder migration:
  `prisma/migrations/YYYYMMDD_name/migration.sql`
- `npx prisma generate` saja TIDAK cukup — `entrypoint.sh` jalanin `prisma migrate deploy` di VPS, butuh file SQL.
- Cara buat migration lokal (tanpa DB): tulis manual SQL, atau `npx prisma migrate dev --name xxx` jika DB lokal ada.
- Multi-tenant: `migrate-all-tenants.ts` apply ke `polyflow` + `kiyowo` + `melindo_rafia`. Table `Help*` cuma dipake main DB, tapi tetap ke-migrate ke tenant (kosong wajar).

### Seeding Prod — HelpArticle & KB

- Seed script TS (`scripts/seed-help-articles.ts`) **tidak ke-bundle** image standalone (`.next/standalone`). `node_modules/.prisma` missing di `/app`.
- Seed prod via SQL langsung (paling aman):
  ```bash
  docker exec polyflow-db psql -U polyflow -d polyflow -c "INSERT INTO \"HelpArticle\" (...) VALUES (gen_random_uuid()::text, ...) ON CONFLICT (slug) DO NOTHING;"
  ```
- Alternatif: compile TS ke CJS, copy ke container, `cd /app && node /tmp/seed-help.cjs` (harus dari `/app` biar resolve `@prisma/client`).
- HelpArticle seed di main DB only — 15 artikel PUBLISHED target. Tenant DB seed tidak perlu.

### Verifikasi Wajib Setelah Deploy

Setelah `gh` push dan CI deploy green, SSH VPS dan cek:

```bash
docker logs polyflow-app --tail 100 | grep -iE "migrat|HelpQuestionCluster|snapshot"
docker exec polyflow-app npx prisma@5.22.0 migrate status   # harus "Database schema is up to date!"
docker exec polyflow-db psql -U polyflow -d polyflow -c "SELECT tablename FROM pg_tables WHERE tablename ILIKE 'Help%' ORDER BY tablename;"
docker exec polyflow-db psql -U polyflow -d polyflow -c "SELECT count(*) FROM \"HelpArticle\"; SELECT count(*) FROM \"HelpInteraction\"; SELECT count(*) FROM \"HelpQuestionCluster\"; SELECT count(*) FROM \"HelpLearningDraft\";"
docker ps --filter name=polyflow-app --format "{{.Names}} {{.Status}} {{.Image}}"
```

- CI green ≠ table ada isi — `HelpArticle` 0 berarti seed belum.
- Cluster 0 wajar jika semua `HelpInteraction` OUTCOME=SUCCESS (hanya FAILED/PARTIAL/BLOCKED yang di-cluster).
- Jika `polyflow-app` crash loop setelah migration, cek `SKIP_MIGRATIONS` env dan `docker logs`.

### Batch Edit Safety

- Setelah edit massal 5+ file / write ulang component, **WAJIB** `git status --short` + `git diff --stat` sebelum next step.
- Pernah terjadi file revert hilang: `contextual-help.tsx` + `production/orders/page.tsx` + `support/page.tsx` + `chat-panel.tsx` + `virtual-cs-service.ts` dll reverted setelah write ulang — karena codegraph index lag + tool overwrite.
- Jika file hilang dari `git status`, re-apply via `Write` atau `Edit` dan verify lagi `grep -n "citedArticles\|prefillQuestion"` ada.

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
