#!/usr/bin/env bash
# Run all scheduled production backups and publish sanitized status markers.
set -uo pipefail

REPO_DIR="${REPO_DIR:-/home/sekolahdesain/polyflow}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/polyflow}"
ASSISTANT_CONTAINER="${ASSISTANT_CONTAINER:-polyflow-assistant-worker}"
SUCCESS_MARKER="$BACKUP_DIR/.last-success"
FAILURE_MARKER="$BACKUP_DIR/.last-failure"
mkdir -p "$BACKUP_DIR"

fail_job() {
  local category="$1"
  printf '%s\n' "$category" >"$FAILURE_MARKER"
  echo "SCHEDULED_BACKUP_FAILED category=$category" >&2
  exit 1
}

cd "$REPO_DIR" || fail_job repository_unavailable
set -a
# shellcheck disable=SC1091
. ./.env || fail_job environment_unavailable
set +a

bash scripts/backup-db.sh all || fail_job database_backup_failed
docker exec "$ASSISTANT_CONTAINER" node scripts/backup-assistant-sqlite.mjs \
  || fail_job assistant_backup_failed

touch "$SUCCESS_MARKER"
rm -f "$FAILURE_MARKER"
echo "SCHEDULED_BACKUP_OK"
