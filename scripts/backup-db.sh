#!/usr/bin/env bash
# PolyFlow — tenant-first production backup script
# Usage:
#   ./scripts/backup-db.sh                # backup all active tenant DBs (default)
#   ./scripts/backup-db.sh all
#   ./scripts/backup-db.sh melindo
#   ./scripts/backup-db.sh --dry-run kiyowo
# Cron example:
#   0 2 * * * /opt/polyflow/scripts/backup-db.sh >> /var/log/polyflow-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/polyflow}"
CONTAINER="${DB_CONTAINER:-polyflow-db}"
DB_USER="${DB_USER:-polyflow}"
MAIN_DB_NAME="${MAIN_DB_NAME:-polyflow}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
R2_RETENTION_DAYS="${R2_RETENTION_DAYS:-90}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TARGET="all"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  ./scripts/backup-db.sh [all|tenant-slug] [--dry-run]

Examples:
  ./scripts/backup-db.sh
  ./scripts/backup-db.sh all
  ./scripts/backup-db.sh kiyowo
  ./scripts/backup-db.sh melindo --dry-run
EOF
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
extract_db_name_from_url() { printf '%s' "$1" | sed -E 's|.*://[^/]+/([^?]+).*|\1|'; }
sanitize_label() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9_-' '_'; }

ensure_container_running() {
  docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$" || fail "Container '$CONTAINER' is not running"
}

resolve_tenant_locally() {
  local tenant="$1"
  local row

  row=$(docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$MAIN_DB_NAME" -At -F '|' \
    -c "SELECT subdomain, name, \"dbUrl\" FROM \"Tenant\" WHERE subdomain = '$tenant' LIMIT 1;") \
    || fail "Failed to resolve tenant '$tenant' from local production database"

  [[ -n "$row" ]] || fail "Tenant '$tenant' was not found in table \"Tenant\""

  IFS='|' read -r RESOLVED_TENANT RESOLVED_NAME RESOLVED_DB_URL <<< "$row"
  RESOLVED_DB_NAME=$(extract_db_name_from_url "$RESOLVED_DB_URL")

  [[ -n "$RESOLVED_DB_NAME" ]] || fail "Could not extract database name from dbUrl '$RESOLVED_DB_URL'"
}

backup_one_db() {
  local label="$1"
  local db_name="$2"
  local file_label backup_file backup_size

  file_label=$(sanitize_label "$label")
  backup_file="$BACKUP_DIR/${file_label}_${db_name}_${TIMESTAMP}.sql.gz"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY RUN: would back up label='$label' db='$db_name' -> $backup_file"
    return
  fi

  log "Backing up '$label' (db: $db_name)..."
  docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$db_name" | gzip > "$backup_file"

  backup_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)
  if [[ "$backup_size" -lt 100 ]]; then
    fail "Backup file is suspiciously small: $backup_file ($backup_size bytes)"
  fi

  log "Backup created: $backup_file ($(numfmt --to=iec "$backup_size" 2>/dev/null || echo "${backup_size} bytes"))"

  # Upload to R2 if credentials are configured
  if [[ -n "${S3_ENDPOINT:-}" && -n "${S3_ACCESS_KEY_ID:-}" && -n "${S3_SECRET_ACCESS_KEY:-}" ]]; then
    local r2_key="${label}/backups/${db_name}/${TIMESTAMP}.sql.gz"
    log "Uploading to R2: $r2_key"
    if AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
       AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
       aws s3 cp "$backup_file" "s3://${S3_BUCKET:-polyflow-uploads}/$r2_key" \
       --endpoint-url "$S3_ENDPOINT" \
       --region "${S3_REGION:-auto}" \
       --quiet 2>/dev/null; then
      log "R2 upload complete: $r2_key"
    else
      log "WARNING: R2 upload failed (local backup still exists)"
    fi
  fi
}

declare -a BACKUP_LABELS=()
declare -a BACKUP_DBS=()

has_db_target() {
  local candidate="$1"
  local existing

  for existing in "${BACKUP_DBS[@]:-}"; do
    if [[ "$existing" == "$candidate" ]]; then
      return 0
    fi
  done

  return 1
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    all) TARGET="all" ;;
    *)
      if [[ "$TARGET" != "all" ]]; then
        fail "Only one tenant slug may be provided"
      fi
      TARGET="$arg"
      ;;
  esac
done

mkdir -p "$BACKUP_DIR"
if [[ "$DRY_RUN" -eq 0 ]]; then
  ensure_container_running
fi

if [[ "$TARGET" == "all" ]]; then
  while IFS='|' read -r subdomain name db_url; do
    [[ -n "$subdomain" ]] || continue
    db_name=$(extract_db_name_from_url "$db_url")
    [[ -n "$db_name" ]] || fail "Could not extract db name for tenant '$subdomain'"

    if ! has_db_target "$db_name"; then
      BACKUP_LABELS+=("$subdomain")
      BACKUP_DBS+=("$db_name")
    fi
  done < <(docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$MAIN_DB_NAME" -At -F '|' \
    -c "SELECT subdomain, name, \"dbUrl\" FROM \"Tenant\" WHERE status = 'ACTIVE' ORDER BY subdomain;")

  if ! has_db_target "$MAIN_DB_NAME"; then
    BACKUP_LABELS+=("main")
    BACKUP_DBS+=("$MAIN_DB_NAME")
  fi
else
  resolve_tenant_locally "$TARGET"
  BACKUP_LABELS+=("$RESOLVED_TENANT")
  BACKUP_DBS+=("$RESOLVED_DB_NAME")
fi

[[ "${#BACKUP_DBS[@]}" -gt 0 ]] || fail "No database targets were resolved"

log "Backup mode: $TARGET"
log "Resolved ${#BACKUP_DBS[@]} database target(s)"

for i in "${!BACKUP_DBS[@]}"; do
  backup_one_db "${BACKUP_LABELS[$i]}" "${BACKUP_DBS[$i]}"
done

if [[ "$DRY_RUN" -eq 0 ]]; then
  deleted=$(find "$BACKUP_DIR" -maxdepth 1 -name '*.sql.gz' -mtime +"$RETENTION_DAYS" -delete -print | wc -l | tr -d ' ')
  if [[ "$deleted" -gt 0 ]]; then
    log "Cleaned up $deleted local backup(s) older than $RETENTION_DAYS days"
  fi

  # Clean up old R2 backups if credentials are configured
  if [[ -n "${S3_ENDPOINT:-}" && -n "${S3_ACCESS_KEY_ID:-}" && -n "${S3_SECRET_ACCESS_KEY:-}" ]]; then
    log "Cleaning R2 backups older than $R2_RETENTION_DAYS days..."
    cutoff_date=$(date -d "-${R2_RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v-${R2_RETENTION_DAYS}d +%Y-%m-%d 2>/dev/null)
    if [[ -n "$cutoff_date" ]]; then
      r2_deleted=0
      while IFS= read -r line; do
        key=$(echo "$line" | awk '{print $4}')
        date_str=$(echo "$line" | awk '{print $1}')
        if [[ "$date_str" < "$cutoff_date" && "$key" == *"/backups/"* ]]; then
          AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
          AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
          aws s3 rm "s3://${S3_BUCKET}/$key" \
            --endpoint-url "$S3_ENDPOINT" \
            --region "${S3_REGION:-auto}" \
            --quiet 2>/dev/null && ((r2_deleted++)) || true
        fi
      done < <(AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
               AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
               aws s3 ls "s3://${S3_BUCKET}/" \
                 --endpoint-url "$S3_ENDPOINT" \
                 --region "${S3_REGION:-auto}" \
                 --recursive 2>/dev/null | grep "/backups/")
      if [[ "$r2_deleted" -gt 0 ]]; then
        log "Cleaned up $r2_deleted R2 backup(s) older than $R2_RETENTION_DAYS days"
      fi
    fi
  fi
fi

log "Backup script finished successfully"
