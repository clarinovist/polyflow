# PolyFlow Runbook

## Deployment

### Production Deploy (via CI/CD)

Push to `main` triggers GitHub Actions → builds Docker image → pushes to GHCR.

```bash
# On VPS: pull latest and restart
docker compose pull
docker compose up -d
```

### Local Dev Deploy

```bash
npm run dev:up:build
```

## Health Checks

| Check            | Command                                                  |
| ---------------- | -------------------------------------------------------- |
| App status       | `curl -s http://localhost:3000` (dev) or via Nginx proxy |
| DB status        | `docker compose exec -T db pg_isready -U polyflow`       |
| Migration status | `npm run db:migrate:status`                              |
| Container logs   | `docker compose logs -f polyflow`                        |

## Common Issues

### Prisma P3009 (migrations failed - DB not empty)

```bash
# Nuclear option: wipe DB and restart (DESTRUCTIVE)
docker compose down -v
docker compose up -d
```

### Port Conflicts

- **App**: Not exposed to host by default (access via Nginx reverse proxy)
- **DB**: Internal only (`5432`). Dev uses `5434` host-mapped.
- **Dev override**: `docker-compose.dev.yml` maps DB to `5434` and app to `3000`

### Database Connection Refused

```bash
# Verify DB container is running
docker compose ps

# Check DB logs
docker compose logs db

# Verify DATABASE_URL from app container
docker compose exec -T polyflow sh -lc 'echo "$DATABASE_URL"'
```

### Build Failures

```bash
# Clean rebuild
docker compose down
docker compose build --no-cache
docker compose up -d
```

## Rollback

### Restore from Backup

```bash
# Stop app
docker compose stop polyflow

# Restore database
docker compose exec -T db psql -U polyflow -d polyflow -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
cat backups/polyflow-before-purge.dump | docker compose exec -T db pg_restore -U polyflow -d polyflow --no-owner --no-privileges

# Restart app
docker compose start polyflow
```

### Rollback to Previous Image

```bash
# Tag a known-good image before deploying
docker tag ghcr.io/clarinovist/polyflow:latest ghcr.io/clarinovist/polyflow:rollback-YYYYMMDD

# After bad deploy, revert
docker compose down
# Edit docker-compose.yml image tag to rollback-YYYYMMDD
docker compose up -d
```

## Maintenance

### View Logs

```bash
docker compose logs -f polyflow          # App logs
docker compose logs -f db                # DB logs
```

### Run Migrations Manually

```bash
docker compose exec polyflow npx prisma@5.22.0 migrate deploy
```

### Database Backup

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U polyflow -d polyflow -Fc > backups/polyflow-$(date +%Y%m%d).dump
```

### Stop Services

```bash
docker compose down        # Stop (keep volumes)
docker compose down -v     # Stop AND delete volumes (DESTRUCTIVE)
```

### Seed Database

```bash
docker compose exec polyflow node prisma/seed.js
```

## Initial Login

Superadmin logs in on the dedicated admin subdomain (not a tenant subdomain,
not the raw server IP/port — that's only for internal debugging behind nginx):

- **URL**: `https://admin.polyflow.uk/login`
- **Email**: seed value from `prisma/seed.js` (default seeded as
  `superadmin@polyflow.uk` — verify against the actual seed script)
- **Password**: seed value — **change immediately after first login**

After login you land on `admin.polyflow.uk/super-admin` (short URL, internally
rewritten to `/admin/super-admin`). See `docs/ARCHITECTURE.md` → "Multi-Tenancy
& Subdomain Routing" for how tenant vs. admin subdomains are resolved.

If the password is lost, it **cannot be recovered** (bcrypt hash, one-way) —
reset it directly in the DB:

```bash
docker exec polyflow-db psql -U polyflow -d polyflow -c \
  "UPDATE \"User\" SET password = '<new-bcrypt-hash>' WHERE email = 'superadmin@polyflow.uk';"
```

Generate a matching bcrypt hash (e.g. via Python `bcrypt.hashpw(...)`, cost
factor 10) before running the update.
