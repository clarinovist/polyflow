#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required for release migrations}"
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
BACKUP_FILE="$BACKUP_DIR/db_snapshot_$(date +%Y%m%d_%H%M%S).dump"

echo "Creating fail-closed main database snapshot..."
mkdir -p "$BACKUP_DIR"
if ! pg_dump "$DATABASE_URL" -F c -f "$BACKUP_FILE" >/dev/null 2>&1 || [ ! -s "$BACKUP_FILE" ]; then
    rm -f "$BACKUP_FILE"
    echo "Main database snapshot failed; release migrations were not started." >&2
    exit 1
fi

echo "Running main database migrations..."
node node_modules/prisma/build/index.js migrate deploy

echo "Running active tenant migrations..."
node scripts/migrate-all-tenants.js

echo "Release migrations completed."
