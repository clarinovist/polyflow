#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/tenant-guardrails.sh
source "$SCRIPT_DIR/lib/tenant-guardrails.sh"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/tenant-db.sh <tenant-slug>

Examples:
  ./scripts/tenant-db.sh kiyowo
  ./scripts/tenant-db.sh melindo
EOF
}

TENANT_SLUG="${1:-}"

if [[ -z "$TENANT_SLUG" ]]; then
  usage
  exit 1
fi

resolve_tenant_from_prod "$TENANT_SLUG"

cat <<EOF
TENANT=$RESOLVED_TENANT_SLUG
NAME=$RESOLVED_TENANT_NAME
SUBDOMAIN=$RESOLVED_TENANT_SLUG
DB_NAME=$RESOLVED_DB_NAME
DB_URL=$RESOLVED_DB_URL
SSH_HOST=$POLYFLOW_SSH_HOST
DB_CONTAINER=$POLYFLOW_DB_CONTAINER
MAIN_DB=$POLYFLOW_MAIN_DB
EOF

if [[ "$RESOLVED_TENANT_SLUG" == "kiyowo" && "$RESOLVED_DB_NAME" == "polyflow" ]]; then
  echo "NOTE=historical naming trap: DB 'polyflow' is tenant Kiyowo"
fi
