#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/tenant-guardrails.sh
source "$SCRIPT_DIR/lib/tenant-guardrails.sh"

LOCAL_DB_CONTAINER="${LOCAL_DB_CONTAINER:-polyflow-db}"
LOCAL_DB_USER="${LOCAL_DB_USER:-polyflow}"
LOCAL_MAIN_DB="${LOCAL_MAIN_DB:-polyflow}"
LOCAL_DB_HOST="${LOCAL_DB_HOST:-localhost}"
LOCAL_DB_PORT="${LOCAL_DB_PORT:-5434}"
LOCAL_TENANT_DB_PREFIX="${LOCAL_TENANT_DB_PREFIX:-polyflow_}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
ALLOW_SCHEMA_SEED_FALLBACK="${ALLOW_SCHEMA_SEED_FALLBACK:-0}"
TARGET="all"
DRY_RUN=0
TIMESTAMP=$(date +%Y%m%dT%H%M%S)

usage() {
  cat <<'EOF'
Usage:
  ./scripts/sync-db-prod.sh [all|tenant-slug] [--dry-run]

Examples:
  ./scripts/sync-db-prod.sh
  ./scripts/sync-db-prod.sh all
  ./scripts/sync-db-prod.sh melindo
  ./scripts/sync-db-prod.sh kiyowo --dry-run
EOF
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
ensure_local_container() {
  docker ps --format '{{.Names}}' | grep -q "^${LOCAL_DB_CONTAINER}$" || fail "Local container '$LOCAL_DB_CONTAINER' is not running"
}
local_db_exists() {
  local db_name="$1"
  docker exec -i "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DB_USER" -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '$db_name';" | grep -q '^1$'
}
create_local_db_if_missing() {
  local db_name="$1"
  if ! local_db_exists "$db_name"; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "DRY RUN: would create local database '$db_name'"
    else
      log "Creating local database '$db_name'"
      docker exec -i "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DB_USER" -d postgres -c "CREATE DATABASE \"$db_name\";" >/dev/null
    fi
  fi
}
restore_main_db() {
  local backup_file="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY RUN: would restore main DB '$LOCAL_MAIN_DB' from $backup_file"
    return
  fi

  log "Restoring production main DB into local '$LOCAL_MAIN_DB'"
  cat "$backup_file" | docker exec -i "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_MAIN_DB"
}
restore_tenant_db() {
  local tenant_slug="$1"
  local remote_db_name="$2"
  local local_db_name="$3"
  local tenant_backup="$BACKUP_DIR/tenant-${tenant_slug}-${TIMESTAMP}.dump"
  local local_tenant_url="postgresql://${LOCAL_DB_USER}:${LOCAL_DB_USER}@${LOCAL_DB_HOST}:${LOCAL_DB_PORT}/${local_db_name}"

  log "Tenant: $tenant_slug -> production DB: $remote_db_name -> local DB: $local_db_name"
  if [[ "$tenant_slug" == "kiyowo" && "$remote_db_name" == "polyflow" ]]; then
    log "Warning: historical naming trap — production DB 'polyflow' is tenant Kiyowo"
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY RUN: would download tenant DB '$remote_db_name' to $tenant_backup"
    log "DRY RUN: would restore into local DB '$local_db_name'"
    log "DRY RUN: would update local Tenant.dbUrl for '$tenant_slug' -> $local_tenant_url"
    return
  fi

  create_local_db_if_missing "$local_db_name"

  ssh "$POLYFLOW_SSH_HOST" "docker exec -i $POLYFLOW_DB_CONTAINER pg_dump -U $POLYFLOW_DB_USER -d $remote_db_name --clean --if-exists --no-owner --no-privileges" > "$tenant_backup"

  if [[ ! -s "$tenant_backup" ]]; then
    if [[ "$ALLOW_SCHEMA_SEED_FALLBACK" == "1" ]]; then
      log "Warning: tenant dump empty; running local schema/seed fallback for '$tenant_slug'"
      DATABASE_URL="$local_tenant_url" npx prisma db push --skip-generate
      DATABASE_URL="$local_tenant_url" npx tsx prisma/seed-tenant.ts
    else
      fail "Tenant dump for '$tenant_slug' is empty. Aborting. Set ALLOW_SCHEMA_SEED_FALLBACK=1 to opt in to schema/seed fallback."
    fi
  else
    cat "$tenant_backup" | docker exec -i "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$local_db_name" >/dev/null
  fi

  docker exec -i "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_MAIN_DB" \
    -c "UPDATE \"Tenant\" SET \"dbUrl\" = '$local_tenant_url' WHERE subdomain = '$tenant_slug';" >/dev/null
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
  ensure_local_container
else
  if docker ps --format '{{.Names}}' | grep -q "^${LOCAL_DB_CONTAINER}$"; then
    log "DRY RUN: local container '$LOCAL_DB_CONTAINER' detected"
  else
    log "DRY RUN: local container '$LOCAL_DB_CONTAINER' is not running; skipping local container validation"
  fi
fi

MAIN_BACKUP_FILE="$BACKUP_DIR/prod-main-${TIMESTAMP}.dump"
log "Starting tenant-first sync from production host '$POLYFLOW_SSH_HOST'"
log "Target: $TARGET"

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "DRY RUN: would download production main DB '$POLYFLOW_MAIN_DB' into $MAIN_BACKUP_FILE"
else
  ssh "$POLYFLOW_SSH_HOST" "docker exec -i $POLYFLOW_DB_CONTAINER pg_dump -U $POLYFLOW_DB_USER -d $POLYFLOW_MAIN_DB --clean --if-exists --no-owner --no-privileges" > "$MAIN_BACKUP_FILE"
  [[ -s "$MAIN_BACKUP_FILE" ]] || fail "Main database dump is empty: $MAIN_BACKUP_FILE"
fi

restore_main_db "$MAIN_BACKUP_FILE"

if [[ "$TARGET" == "all" ]]; then
  tenant_rows=$(list_active_tenants_from_prod) || fail "Failed to list active tenants from production"
else
  resolve_tenant_from_prod "$TARGET"
  tenant_rows="${RESOLVED_TENANT_SLUG}|${RESOLVED_TENANT_NAME}|${RESOLVED_DB_URL}"
fi

[[ -n "$tenant_rows" ]] || fail "No tenant rows were resolved"

while IFS='|' read -r tenant_slug tenant_name db_url; do
  [[ -n "$tenant_slug" ]] || continue
  remote_db_name=$(extract_db_name_from_url "$db_url")
  [[ -n "$remote_db_name" ]] || fail "Could not extract remote DB name for tenant '$tenant_slug'"

  local_db_name="${LOCAL_TENANT_DB_PREFIX}${tenant_slug}"
  restore_tenant_db "$tenant_slug" "$remote_db_name" "$local_db_name"
done <<< "$tenant_rows"

log "Sync completed successfully"
