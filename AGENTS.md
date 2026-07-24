# Workflow Rules

## Sebelum Commit

WAJIB menjalankan semua langkah berikut secara berurutan — jangan dilewati:

1. **Lint** — `npm run lint`
2. **Test** — `npm run test`
3. **Build** — `npm run build`

Jika salah satu gagal, perbaiki dulu sebelum melanjutkan ke commit.

## Commit & Push

- **Commit** diperbolehkan setelah lint + test + build lolos.
- **Jangan pernah push** ke remote tanpa perintah eksplisit dari user. Tunggu user bilang "push" atau "ship" atau "kirim".

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