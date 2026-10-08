#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required for release migrations}"

echo "Creating fail-closed release backups for main and active tenant databases..."
node scripts/backup-release-databases.js

echo "Running main database migrations..."
node node_modules/prisma/build/index.js migrate deploy

echo "Running active tenant migrations..."
node scripts/migrate-all-tenants.js

echo "Release migrations completed."
