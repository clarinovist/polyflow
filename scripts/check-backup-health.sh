#!/usr/bin/env bash
set -euo pipefail
DB_BACKUP_DIR="${DB_BACKUP_DIR:-/opt/backups/polyflow}"
ASSISTANT_BACKUP_DIR="${ASSISTANT_BACKUP_DIR:-/opt/backups/polyflow-assistant}"
ASSISTANT_CONTAINER="${ASSISTANT_CONTAINER:-polyflow-assistant-worker}"
MAX_AGE_SECONDS="${MAX_AGE_SECONDS:-93600}"
DISK_WARNING_PERCENT="${DISK_WARNING_PERCENT:-80}"
DISK_CRITICAL_PERCENT="${DISK_CRITICAL_PERCENT:-90}"
EXPECTED_DATABASES="${EXPECTED_DATABASES:-3}"
SUCCESS_MARKER="${SUCCESS_MARKER:-$DB_BACKUP_DIR/.last-success}"
FAILURE_MARKER="${FAILURE_MARKER:-$DB_BACKUP_DIR/.last-failure}"
NOW=$(date +%s)
ISSUES=()
is_positive_integer() { [[ "$1" =~ ^[1-9][0-9]*$ ]]; }
for value in "$MAX_AGE_SECONDS" "$DISK_WARNING_PERCENT" "$DISK_CRITICAL_PERCENT" "$EXPECTED_DATABASES"; do
  is_positive_integer "$value" || { echo "BACKUP_HEALTH_ALERT invalid_configuration"; exit 2; }
done
(( DISK_WARNING_PERCENT < DISK_CRITICAL_PERCENT && DISK_CRITICAL_PERCENT <= 100 )) || { echo "BACKUP_HEALTH_ALERT invalid_disk_thresholds"; exit 2; }
file_mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }
latest_age() {
  local directory="$1" pattern="$2" file mtime newest=0
  while IFS= read -r file; do
    mtime=$(file_mtime "$file") || continue
    (( mtime > newest )) && newest=$mtime
  done < <(find "$directory" -type f -name "$pattern" -print 2>/dev/null)
  (( newest > 0 )) || return 1
  echo $((NOW-newest))
}
if [[ -f "$FAILURE_MARKER" && ( ! -f "$SUCCESS_MARKER" || "$FAILURE_MARKER" -nt "$SUCCESS_MARKER" ) ]]; then
  ISSUES+=("scheduled_backup_failed")
fi
recent_db_count=0
while IFS= read -r file; do
  mtime=$(file_mtime "$file") || continue
  (( NOW - mtime <= MAX_AGE_SECONDS )) && recent_db_count=$((recent_db_count + 1))
done < <(find "$DB_BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz' -print 2>/dev/null)
if (( recent_db_count < EXPECTED_DATABASES )); then ISSUES+=("database_backup_stale_or_incomplete"); elif db_age=$(latest_age "$DB_BACKUP_DIR" '*.sql.gz'); then (( db_age <= MAX_AGE_SECONDS )) || ISSUES+=("database_backup_stale_or_incomplete"); else ISSUES+=("database_backup_missing"); fi
assistant_sources=0
assistant_state=idle_not_initialized
assistant_keys=""
if docker inspect "$ASSISTANT_CONTAINER" >/dev/null 2>&1; then assistant_keys=$(docker exec "$ASSISTANT_CONTAINER" sh -c "find /data/tenants -mindepth 2 -maxdepth 2 -type f -name assistant.sqlite -print 2>/dev/null" 2>/dev/null | awk -F/ 'NF>1 {print $(NF-1)}' | grep -E '^[a-f0-9]{64}$' || true); else ISSUES+=("assistant_worker_missing"); fi
if [ -n "$assistant_keys" ]; then assistant_sources=$(printf '%s\n' "$assistant_keys" | grep -c . || true); else assistant_sources=0; fi
assistant_mismatch=0
if [ -f "$ASSISTANT_BACKUP_DIR/.assistant-registry-mismatch" ] \
  && { [ ! -f "$SUCCESS_MARKER" ] || [ "$ASSISTANT_BACKUP_DIR/.assistant-registry-mismatch" -nt "$SUCCESS_MARKER" ]; }; then
  assistant_mismatch=1
fi
if (( assistant_mismatch == 1 )); then
  assistant_state=registry_storage_mismatch
  ISSUES+=("assistant_registry_storage_mismatch")
elif (( assistant_sources > 0 )); then
  assistant_state=healthy_with_sources
  assistant_missing=0
  while IFS= read -r key; do
    [ -z "$key" ] && continue
    key_fresh=0
    while IFS= read -r file; do
      mtime=$(file_mtime "$file") || continue
      if (( NOW - mtime <= MAX_AGE_SECONDS )); then key_fresh=1; break; fi
    done < <(find "$ASSISTANT_BACKUP_DIR" -type f -path "*/$key/assistant.sqlite" -print 2>/dev/null)
    if (( key_fresh == 0 )); then assistant_missing=1; break; fi
  done <<< "$assistant_keys"
  if (( assistant_missing == 1 )); then ISSUES+=("assistant_backup_incomplete"); fi
fi
disk_percent=$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
if [[ ! "$disk_percent" =~ ^[0-9]+$ ]]; then ISSUES+=("disk_usage_unknown"); elif (( disk_percent >= DISK_CRITICAL_PERCENT )); then ISSUES+=("disk_usage_critical"); elif (( disk_percent >= DISK_WARNING_PERCENT )); then ISSUES+=("disk_usage_warning"); fi
if (( ${#ISSUES[@]} > 0 )); then printf 'BACKUP_HEALTH_ALERT %s\n' "${ISSUES[*]}"; exit 1; fi
printf 'BACKUP_HEALTH_OK databases_recent=%s assistant_sources=%s assistant_state=%s disk_percent=%s\n' "$recent_db_count" "$assistant_sources" "$assistant_state" "$disk_percent"
