#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/tenant-guardrails.sh
source "$SCRIPT_DIR/lib/tenant-guardrails.sh"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/tenant-psql-write.sh <tenant-slug> [sql-file]

Examples:
  ./scripts/tenant-psql-write.sh melindo
  ./scripts/tenant-psql-write.sh melindo /tmp/fix.sql
  printf 'UPDATE ...;\n' | ./scripts/tenant-psql-write.sh melindo
EOF
}

TENANT_SLUG="${1:-}"
SQL_FILE="${2:-}"

if [[ -z "$TENANT_SLUG" ]]; then
  usage
  exit 1
fi

require_sql_file_if_provided "$SQL_FILE"
resolve_tenant_from_prod "$TENANT_SLUG"
print_resolved_target "WRITE-INTENT"
confirm_write_intent

echo "Proceeding to production psql session..."

REMOTE_CMD="docker exec -i $POLYFLOW_DB_CONTAINER psql -v ON_ERROR_STOP=1 -P pager=off -U $POLYFLOW_DB_USER -d $RESOLVED_DB_NAME"
REMOTE_CMD_TTY="docker exec -it $POLYFLOW_DB_CONTAINER psql -v ON_ERROR_STOP=1 -P pager=off -U $POLYFLOW_DB_USER -d $RESOLVED_DB_NAME"

if [[ -n "$SQL_FILE" ]]; then
  ssh "$POLYFLOW_SSH_HOST" "$REMOTE_CMD" < "$SQL_FILE"
elif [[ ! -t 0 ]]; then
  ssh "$POLYFLOW_SSH_HOST" "$REMOTE_CMD"
else
  ssh -t "$POLYFLOW_SSH_HOST" "$REMOTE_CMD_TTY"
fi
