#!/usr/bin/env bash
# Restore the newest complete release-backup set into disposable, isolated PostgreSQL.
# This script never connects to or mutates the production database.

set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/polyflow-premigration}"
BACKUP_STAMP="${BACKUP_STAMP:-}"
EXPECTED_DATABASES="${EXPECTED_DATABASES:-}"
APP_IMAGE="${APP_IMAGE:-}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:15-alpine}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d%H%M%S)-$$}"
PREFIX="polyflow-restore-drill-${RUN_ID}"
DB_CONTAINER="${PREFIX}-db"
APP_CONTAINER="${PREFIX}-app"
NETWORK="${PREFIX}-network"
VOLUME="${PREFIX}-data"
LOCK_FILE="${RESTORE_DRILL_LOCK_FILE:-/tmp/polyflow-restore-drill.lock}"
STARTED_AT=$(date +%s)
DB_STARTED=0
APP_STARTED=0
NETWORK_CREATED=0
VOLUME_CREATED=0

log() { printf '[restore-drill] %s\n' "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

cleanup() {
  local status=$?
  set +e
  if [[ "$APP_STARTED" -eq 1 ]]; then docker rm -f "$APP_CONTAINER" >/dev/null 2>&1; fi
  if [[ "$DB_STARTED" -eq 1 ]]; then docker rm -f "$DB_CONTAINER" >/dev/null 2>&1; fi
  if [[ "$NETWORK_CREATED" -eq 1 ]]; then docker network rm "$NETWORK" >/dev/null 2>&1; fi
  if [[ "$VOLUME_CREATED" -eq 1 ]]; then docker volume rm "$VOLUME" >/dev/null 2>&1; fi
  if [[ "$status" -eq 0 ]]; then
    log "Cleanup completed."
  else
    log "Cleanup attempted after failure (exit=$status)." >&2
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM

[[ "$RUN_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,47}$ ]] || fail "RUN_ID has an invalid format"
[[ "$PREFIX" == polyflow-restore-drill-* ]] || fail "Unsafe drill resource prefix"
[[ "$EXPECTED_DATABASES" =~ ^[1-9][0-9]*$ ]] || fail "EXPECTED_DATABASES must be a positive integer"
[[ "$APP_IMAGE" == *@sha256:* ]] || fail "APP_IMAGE must be an immutable digest reference"
[[ -d "$BACKUP_DIR" ]] || fail "Backup directory is unavailable"
command -v docker >/dev/null 2>&1 || fail "docker is required"

if [[ -z "$BACKUP_STAMP" ]]; then
  BACKUP_STAMP=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'release_*.dump' -printf '%f\n' \
    | sed -nE 's/^release_([0-9]{14})_[1-9][0-9]*\.dump$/\1/p' | sort -r | head -n 1)
fi
[[ "$BACKUP_STAMP" =~ ^[0-9]{14}$ ]] || fail "No valid release backup set was found"

BACKUP_FILES=()
for ((ordinal=1; ordinal<=EXPECTED_DATABASES; ordinal++)); do
  file="$BACKUP_DIR/release_${BACKUP_STAMP}_${ordinal}.dump"
  [[ -f "$file" && -s "$file" ]] || fail "Backup set is incomplete at database #$ordinal"
  BACKUP_FILES+=("$file")
done
extra="$BACKUP_DIR/release_${BACKUP_STAMP}_$((EXPECTED_DATABASES + 1)).dump"
[[ ! -e "$extra" ]] || fail "EXPECTED_DATABASES does not include the complete backup set"

command -v flock >/dev/null 2>&1 || fail "flock is required"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "Another restore drill is already running"

log "Selected backup set stamp=$BACKUP_STAMP databases=$EXPECTED_DATABASES"
log "Creating isolated Docker network and disposable volume..."
docker network create --internal --label polyflow.restore-drill="$RUN_ID" "$NETWORK" >/dev/null
NETWORK_CREATED=1
docker volume create --label polyflow.restore-drill="$RUN_ID" "$VOLUME" >/dev/null
VOLUME_CREATED=1

docker run -d --name "$DB_CONTAINER" \
  --label polyflow.restore-drill="$RUN_ID" \
  --network "$NETWORK" \
  --mount "type=volume,src=$VOLUME,dst=/var/lib/postgresql/data" \
  --mount "type=bind,src=$BACKUP_DIR,dst=/backups,readonly" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  "$POSTGRES_IMAGE" >/dev/null
DB_STARTED=1

for attempt in $(seq 1 60); do
  if docker exec "$DB_CONTAINER" pg_isready -U postgres -d postgres >/dev/null 2>&1; then break; fi
  [[ "$attempt" -lt 60 ]] || fail "Disposable PostgreSQL did not become ready"
  sleep 1
done

for ((index=0; index<EXPECTED_DATABASES; index++)); do
  ordinal=$((index + 1))
  database="drill_$ordinal"
  backup_name=$(basename "${BACKUP_FILES[$index]}")
  restore_started=$(date +%s)
  log "Restoring database #$ordinal..."
  docker exec "$DB_CONTAINER" createdb -h 127.0.0.1 -U postgres "$database"
  docker run --rm --network "$NETWORK" \
    --label polyflow.restore-drill="$RUN_ID" \
    --mount "type=bind,src=$BACKUP_DIR,dst=/backups,readonly" \
    "$APP_IMAGE" pg_restore -h "$DB_CONTAINER" -U postgres -d "$database" \
    --exit-on-error --no-owner --no-privileges "/backups/$backup_name"

  failed_migrations=$(docker exec "$DB_CONTAINER" psql -h 127.0.0.1 -U postgres -d "$database" -At \
    -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;')
  [[ "$failed_migrations" == "0" ]] || fail "Database #$ordinal contains unfinished migrations"
  migration_count=$(docker exec "$DB_CONTAINER" psql -h 127.0.0.1 -U postgres -d "$database" -At \
    -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;')
  table_count=$(docker exec "$DB_CONTAINER" psql -h 127.0.0.1 -U postgres -d "$database" -At \
    -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")
  [[ "$migration_count" -gt 0 && "$table_count" -gt 0 ]] || fail "Database #$ordinal failed structural invariants"

  database_url="postgresql://postgres@$DB_CONTAINER:5432/$database?schema=public"
  docker run --rm --network "$NETWORK" \
    --label polyflow.restore-drill="$RUN_ID" \
    -e DATABASE_URL="$database_url" \
    "$APP_IMAGE" node node_modules/prisma/build/index.js migrate status >/dev/null
  duration=$(( $(date +%s) - restore_started ))
  log "Database #$ordinal verified migrations=$migration_count tables=$table_count duration_seconds=$duration"
done

log "Starting application health probe against the disposable main database..."
docker run -d --name "$APP_CONTAINER" \
  --label polyflow.restore-drill="$RUN_ID" \
  --network "$NETWORK" \
  -e DATABASE_URL="postgresql://postgres@$DB_CONTAINER:5432/drill_1?schema=public" \
  "$APP_IMAGE" >/dev/null
APP_STARTED=1
for attempt in $(seq 1 90); do
  if docker exec "$APP_CONTAINER" wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null \
      | grep -q '"status":"healthy"'; then break; fi
  [[ "$attempt" -lt 90 ]] || fail "Application health probe failed against restored database"
  sleep 1
done

elapsed=$(( $(date +%s) - STARTED_AT ))
log "RESTORE_DRILL_OK databases=$EXPECTED_DATABASES duration_seconds=$elapsed health=healthy"
