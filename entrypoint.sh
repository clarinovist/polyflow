#!/bin/sh
set -e

if [ "${SKIP_MIGRATIONS}" = "1" ] || [ "${SKIP_MIGRATIONS}" = "true" ]; then
	echo "Skipping Prisma migrations (SKIP_MIGRATIONS=${SKIP_MIGRATIONS})"
else
	echo "Creating Database Snapshot before migrations..."
	if [ -n "$DATABASE_URL" ]; then
		BACKUP_DIR="/app/backups"
		mkdir -p $BACKUP_DIR
		TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
		pg_dump "$DATABASE_URL" -F c -f "$BACKUP_DIR/db_snapshot_$TIMESTAMP.dump" || echo "Backup failed, continuing anyway..."
		
		# Keep only 5 latest backups
		ls -t $BACKUP_DIR/db_snapshot_*.dump | tail -n +6 | xargs rm -f 2>/dev/null || true
	else
		echo "DATABASE_URL not found, skipping pre-migration snapshot"
	fi

	echo "Running Prisma migrations..."
	npx prisma@5.22.0 migrate deploy
    
	echo "Running Tenant migrations..."
	node scripts/migrate-all-tenants.js
fi

# Start the application
echo "Starting application..."
node server.js
