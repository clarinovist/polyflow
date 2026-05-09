#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/tenant-guardrails.sh
source "$SCRIPT_DIR/lib/tenant-guardrails.sh"

LOCAL_DB_CONTAINER="${LOCAL_DB_CONTAINER:-polyflow-db}"
LOCAL_DB_USER="${LOCAL_DB_USER:-polyflow}"
LOCAL_TENANT_DB_PREFIX="${LOCAL_TENANT_DB_PREFIX:-polyflow_}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-/opt/backups/polyflow}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
TARGET=""
LOCAL_SOURCE_DB=""
DRY_RUN=0
TIMESTAMP=$(date +%Y%m%dT%H%M%S)

usage() {
  cat <<'EOF'
Usage:
  ./scripts/push-db-to-prod.sh <tenant-slug> [--from-db <local-db-name>] [--dry-run]

Examples:
  ./scripts/push-db-to-prod.sh melindo
  ./scripts/push-db-to-prod.sh melindo --from-db polyflow_melindo
  ./scripts/push-db-to-prod.sh kiyowo --dry-run
EOF
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
ensure_local_container() {
  docker ps --format '{{.Names}}' | grep -q "^${LOCAL_DB_CONTAINER}$" || fail "Local container '$LOCAL_DB_CONTAINER' is not running"
}
ensure_local_db_exists() {
  local db_name="$1"
  docker exec -i "$LOCAL_DB_CONTAINER" psql -U "$LOCAL_DB_USER" -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '$db_name';" | grep -q '^1$' \
    || fail "Local source database '$db_name' does not exist"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-db)
      shift
      [[ $# -gt 0 ]] || fail "--from-db requires a local database name"
      LOCAL_SOURCE_DB="$1"
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -n "$TARGET" ]]; then
        fail "Only one tenant slug may be provided"
      fi
      TARGET="$1"
      ;;
  esac
  shift
done

[[ -n "$TARGET" ]] || { usage; exit 1; }

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

resolve_tenant_from_prod "$TARGET"
print_resolved_target "PUSH LOCAL -> PRODUCTION"

if [[ -z "$LOCAL_SOURCE_DB" ]]; then
  LOCAL_SOURCE_DB="${LOCAL_TENANT_DB_PREFIX}${RESOLVED_TENANT_SLUG}"
fi

LOCAL_DUMP_FILE="$BACKUP_DIR/local-${RESOLVED_TENANT_SLUG}-${TIMESTAMP}.sql"
REMOTE_BACKUP_FILE="$REMOTE_BACKUP_DIR/pre-push-${RESOLVED_TENANT_SLUG}-${TIMESTAMP}.dump"

echo "Local source DB : $LOCAL_SOURCE_DB"
echo "Remote backup   : $REMOTE_BACKUP_FILE"

if [[ "$RESOLVED_TENANT_SLUG" == "kiyowo" && "$RESOLVED_DB_NAME" == "polyflow" ]]; then
  echo ""
  echo "CRITICAL WARNING"
  echo "- Production target 'polyflow' is both tenant Kiyowo and the live tenant-registry DB."
  echo "- Pushing to this DB can overwrite tenant metadata as well as Kiyowo data."
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "DRY RUN: would verify local DB '$LOCAL_SOURCE_DB'"
  log "DRY RUN: would back up production DB '$RESOLVED_DB_NAME' to $REMOTE_BACKUP_FILE"
  log "DRY RUN: would dump local DB '$LOCAL_SOURCE_DB' to $LOCAL_DUMP_FILE"
  log "DRY RUN: would restore local dump into production tenant '$RESOLVED_TENANT_SLUG'"
  exit 0
fi

ensure_local_db_exists "$LOCAL_SOURCE_DB"
confirm_phrase "push ${RESOLVED_TENANT_SLUG}" "Type 'push ${RESOLVED_TENANT_SLUG}' to continue: "

if [[ "$RESOLVED_TENANT_SLUG" == "kiyowo" && "$RESOLVED_DB_NAME" == "polyflow" ]]; then
  confirm_phrase "overwrite main polyflow" "Type 'overwrite main polyflow' for the second confirmation: "
fi

log "Creating remote safety backup before push"
ssh "$POLYFLOW_SSH_HOST" "mkdir -p '$REMOTE_BACKUP_DIR' && docker exec -i $POLYFLOW_DB_CONTAINER pg_dump -U $POLYFLOW_DB_USER -d $RESOLVED_DB_NAME -Fc > '$REMOTE_BACKUP_FILE'"

log "Dumping local source DB '$LOCAL_SOURCE_DB'"
docker exec -i "$LOCAL_DB_CONTAINER" pg_dump -U "$LOCAL_DB_USER" -d "$LOCAL_SOURCE_DB" --clean --if-exists --no-owner --no-privileges > "$LOCAL_DUMP_FILE"
[[ -s "$LOCAL_DUMP_FILE" ]] || fail "Local dump file is empty: $LOCAL_DUMP_FILE"

log "Restoring local dump into production DB '$RESOLVED_DB_NAME'"
cat "$LOCAL_DUMP_FILE" | ssh "$POLYFLOW_SSH_HOST" "docker exec -i $POLYFLOW_DB_CONTAINER psql -v ON_ERROR_STOP=1 -U $POLYFLOW_DB_USER -d $RESOLVED_DB_NAME"

log "Push completed successfully"
log "Remote pre-push backup saved at: $REMOTE_BACKUP_FILE"
