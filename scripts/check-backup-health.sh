#!/usr/bin/env bash
set -euo pipefail
DB_BACKUP_DIR="${DB_BACKUP_DIR:-/opt/backups/polyflow}"
ASSISTANT_BACKUP_DIR="${ASSISTANT_BACKUP_DIR:-/opt/backups/polyflow-assistant}"
ASSISTANT_CONTAINER="${ASSISTANT_CONTAINER:-polyflow-assistant-worker}"
MAX_AGE_SECONDS="${MAX_AGE_SECONDS:-93600}"
DISK_WARNING_PERCENT="${DISK_WARNING_PERCENT:-80}"
DISK_CRITICAL_PERCENT="${DISK_CRITICAL_PERCENT:-90}"
EXPECTED_DATABASES="${EXPECTED_DATABASES:-3}"
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
recent_db_count=0
while IFS= read -r file; do
  mtime=$(file_mtime "$file") || continue
  (( NOW - mtime <= MAX_AGE_SECONDS )) && recent_db_count=$((recent_db_count + 1))
done < <(find "$DB_BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz' -print 2>/dev/null)
if (( recent_db_count < EXPECTED_DATABASES )); then ISSUES+=("database_backup_stale_or_incomplete"); elif db_age=$(latest_age "$DB_BACKUP_DIR" '*.sql.gz'); then (( db_age <= MAX_AGE_SECONDS )) || ISSUES+=("database_backup_stale_or_incomplete"); else ISSUES+=("database_backup_missing"); fi
assistant_sources=0
if docker inspect "$ASSISTANT_CONTAINER" >/dev/null 2>&1; then assistant_sources=$(docker exec "$ASSISTANT_CONTAINER" sh -c "find /data/tenants -mindepth 2 -maxdepth 2 -type f -name assistant.sqlite -print 2>/dev/null | awk 'END {print NR+0}'" 2>/dev/null || echo 0); else ISSUES+=("assistant_worker_missing"); fi
if (( assistant_sources > 0 )); then if assistant_age=$(latest_age "$ASSISTANT_BACKUP_DIR" 'assistant.sqlite'); then (( assistant_age <= MAX_AGE_SECONDS )) || ISSUES+=("assistant_backup_stale"); else ISSUES+=("assistant_backup_missing"); fi; fi
disk_percent=$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
if [[ ! "$disk_percent" =~ ^[0-9]+$ ]]; then ISSUES+=("disk_usage_unknown"); elif (( disk_percent >= DISK_CRITICAL_PERCENT )); then ISSUES+=("disk_usage_critical"); elif (( disk_percent >= DISK_WARNING_PERCENT )); then ISSUES+=("disk_usage_warning"); fi
if (( ${#ISSUES[@]} > 0 )); then printf 'BACKUP_HEALTH_ALERT %s\n' "${ISSUES[*]}"; exit 1; fi
printf 'BACKUP_HEALTH_OK databases_recent=%s assistant_sources=%s disk_percent=%s\n' "$recent_db_count" "$assistant_sources" "$disk_percent"
