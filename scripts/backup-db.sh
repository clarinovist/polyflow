#!/bin/bash
# PolyFlow — Automated Database Backup Script
# Usage: ./scripts/backup-db.sh
# Cron:  0 2 * * * /opt/polyflow/scripts/backup-db.sh >> /var/log/polyflow-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/polyflow}"
CONTAINER="${DB_CONTAINER:-polyflow-db}"
DB_USER="${DB_USER:-polyflow}"
DB_NAME="${DB_NAME:-polyflow}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/polyflow_$TIMESTAMP.sql.gz"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Check container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    log "${RED}ERROR: Container '$CONTAINER' is not running${NC}"
    exit 1
fi

# Perform backup (compressed)
log "Starting backup of '$DB_NAME' from container '$CONTAINER'..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

# Verify backup
BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
if [ "$BACKUP_SIZE" -lt 100 ]; then
    log "${RED}ERROR: Backup file is suspiciously small ($BACKUP_SIZE bytes)${NC}"
    exit 1
fi

log "${GREEN}Backup created: $BACKUP_FILE ($(numfmt --to=iec $BACKUP_SIZE 2>/dev/null || echo "${BACKUP_SIZE} bytes"))${NC}"

# Cleanup old backups
DELETED=$(find "$BACKUP_DIR" -name "polyflow_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    log "Cleaned up $DELETED backup(s) older than $RETENTION_DAYS days"
fi

log "Backup complete. Total backups: $(ls -1 "$BACKUP_DIR"/polyflow_*.sql.gz 2>/dev/null | wc -l)"
