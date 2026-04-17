# Maklon Stock Repair Runbook

Use this runbook when older Maklon Jasa stock is still sitting in non-maklon locations, so the stock is hard to issue or consume with the stage-based flow.

The repair script moves the current stock balance for Maklon receipts and Maklon production outputs into the new stage locations:

- `maklon_raw_material`
- `maklon_wip`
- `maklon_fg`
- `maklon_packing`

The script is idempotent. If the source stock has already been moved, it will skip that row.

## What The Script Does

- Reads `GoodsReceipt` rows where `isMaklon = true`.
- Reads `ProductionOrder` rows where `isMaklon = true`.
- Groups the current stock by source location, destination location, and product variant.
- Transfers only the stock that still exists at the source location.
- Creates `TRANSFER` stock movements so the audit trail stays intact.

## Backup First

Before running any repair on the VPS, take a database backup.

Example with Docker Compose:

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U polyflow -d polyflow -Fc > backups/polyflow-before-maklon-repair.dump
```

If you use the container name directly:

```bash
docker exec -i polyflow-db pg_dump -U polyflow -d polyflow -Fc > backups/polyflow-before-maklon-repair.dump
```

## Dry Run

Run this first. It prints the planned transfers and does not change data.

```bash
docker exec -it polyflow-app node scripts/repair-maklon-stock-locations.js --dry-run
```

Docker Compose equivalent:

```bash
docker compose exec -T polyflow node scripts/repair-maklon-stock-locations.js --dry-run
```

## Execute Repair

Only run this after the dry run looks correct.

```bash
docker exec -it polyflow-app node scripts/repair-maklon-stock-locations.js --execute --yes
```

Docker Compose equivalent:

```bash
docker compose exec -T polyflow node scripts/repair-maklon-stock-locations.js --execute --yes
```

## Prisma Version Note

The script uses the repository's Prisma Client version, which is pinned to Prisma 5.22.0 in the project.

You do not need to run `prisma generate` inside the runtime container for this repair script, because the Docker image already ships with the generated client.

If you are running from a source checkout outside Docker, you can still pin the CLI explicitly:

```bash
npx prisma@5.22.0 generate
node scripts/repair-maklon-stock-locations.js --dry-run
```

## Verify After Repair

Run the dry run again. The same tasks should either disappear or show zero transferable quantity.

```bash
docker exec -it polyflow-app node scripts/repair-maklon-stock-locations.js --dry-run
```

Optional SQL checks:

```bash
docker exec -it polyflow-db psql -U polyflow -d polyflow -c 'SELECT l.name, l.slug, COUNT(*) AS rows, COALESCE(SUM(i.quantity), 0) AS quantity FROM "Inventory" i JOIN "Location" l ON l.id = i."locationId" WHERE l.slug IN (''maklon_raw_material'', ''maklon_wip'', ''maklon_fg'', ''maklon_packing'') GROUP BY l.name, l.slug ORDER BY l.slug;'
```

```bash
docker exec -it polyflow-db psql -U polyflow -d polyflow -c 'SELECT l.name, l.slug, COUNT(*) AS rows, COALESCE(SUM(i.quantity), 0) AS quantity FROM "Inventory" i JOIN "Location" l ON l.id = i."locationId" WHERE l.slug IN (''packing_area'', ''fg_warehouse'', ''mixing_area'', ''rm_warehouse'', ''maklon_warehouse'') GROUP BY l.name, l.slug ORDER BY l.slug;'
```

## Rollback

If the repair moves the wrong stock, restore the database dump and re-run the deployment.

```bash
docker exec -i polyflow-db psql -U polyflow -d polyflow -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
cat backups/polyflow-before-maklon-repair.dump | docker exec -i polyflow-db pg_restore -U polyflow -d polyflow --no-owner --no-privileges
```