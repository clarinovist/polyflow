#!/usr/bin/env bash

# Shared helpers for tenant-first PolyFlow database operations.
# This file is meant to be sourced by scripts under ./scripts.

POLYFLOW_SSH_HOST="${POLYFLOW_SSH_HOST:-nugrohopramono}"
POLYFLOW_DB_CONTAINER="${POLYFLOW_DB_CONTAINER:-polyflow-db}"
POLYFLOW_DB_USER="${POLYFLOW_DB_USER:-polyflow}"
POLYFLOW_MAIN_DB="${POLYFLOW_MAIN_DB:-polyflow}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_tenant_slug() {
  local tenant="$1"

  if [[ -z "$tenant" ]]; then
    fail "Tenant slug is required. Use 'kiyowo' or 'melindo'."
  fi

  if [[ ! "$tenant" =~ ^[a-z0-9-]+$ ]]; then
    fail "Invalid tenant slug '$tenant'. Only lowercase letters, numbers, and dashes are allowed."
  fi
}

extract_db_name_from_url() {
  local db_url="$1"
  printf '%s' "$db_url" | sed -E 's|.*://[^/]+/([^?]+).*|\1|'
}

list_active_tenants_from_prod() {
  ssh "$POLYFLOW_SSH_HOST" \
    "docker exec -i $POLYFLOW_DB_CONTAINER psql -U $POLYFLOW_DB_USER -d $POLYFLOW_MAIN_DB -At -F '|' -c \"SELECT subdomain, name, \\\"dbUrl\\\" FROM \\\"Tenant\\\" WHERE status = 'ACTIVE' ORDER BY subdomain;\""
}

resolve_tenant_from_prod() {
  local tenant="$1"
  local row

  require_tenant_slug "$tenant"

  row=$(ssh "$POLYFLOW_SSH_HOST" \
    "docker exec -i $POLYFLOW_DB_CONTAINER psql -U $POLYFLOW_DB_USER -d $POLYFLOW_MAIN_DB -At -F '|' -c \"SELECT subdomain, name, \\\"dbUrl\\\" FROM \\\"Tenant\\\" WHERE subdomain = '$tenant' LIMIT 1;\""
  ) || fail "Failed to resolve tenant '$tenant' from production. Check SSH access and container status."

  [[ -n "$row" ]] || fail "Tenant '$tenant' was not found in production table \"Tenant\"."

  IFS='|' read -r RESOLVED_TENANT_SLUG RESOLVED_TENANT_NAME RESOLVED_DB_URL <<< "$row"

  [[ -n "${RESOLVED_TENANT_SLUG:-}" ]] || fail "Resolver returned an empty tenant slug."
  [[ -n "${RESOLVED_TENANT_NAME:-}" ]] || fail "Resolver returned an empty tenant name."
  [[ -n "${RESOLVED_DB_URL:-}" ]] || fail "Resolver returned an empty dbUrl."

  RESOLVED_DB_NAME=$(extract_db_name_from_url "$RESOLVED_DB_URL")
  [[ -n "$RESOLVED_DB_NAME" ]] || fail "Could not extract database name from dbUrl '$RESOLVED_DB_URL'."
}

print_resolved_target() {
  local intent="$1"

  echo "========================================"
  echo "Intent       : $intent"
  echo "SSH Host     : $POLYFLOW_SSH_HOST"
  echo "Tenant slug  : $RESOLVED_TENANT_SLUG"
  echo "Tenant name  : $RESOLVED_TENANT_NAME"
  echo "Subdomain    : ${RESOLVED_TENANT_SLUG}.polyflow.uk"
  echo "DB name      : $RESOLVED_DB_NAME"
  echo "DB url       : $RESOLVED_DB_URL"
  if [[ "$RESOLVED_TENANT_SLUG" == "kiyowo" && "$RESOLVED_DB_NAME" == "polyflow" ]]; then
    echo "Warning      : historical naming trap — DB 'polyflow' is tenant Kiyowo"
  fi
  echo "========================================"
}

require_sql_file_if_provided() {
  local sql_file="$1"

  if [[ -n "$sql_file" && ! -f "$sql_file" ]]; then
    fail "SQL file '$sql_file' was not found."
  fi
}

confirm_phrase() {
  local expected="$1"
  local prompt="${2:-Type '$expected' to continue: }"
  local answer=""

  if [[ -t 0 ]]; then
    read -r -p "$prompt" answer
  elif [[ -r /dev/tty ]]; then
    read -r -p "$prompt" answer < /dev/tty
  else
    fail "Interactive confirmation requires a TTY or /dev/tty."
  fi

  [[ "$answer" == "$expected" ]] || fail "Confirmation mismatch. Aborting."
}

confirm_write_intent() {
  echo ""
  echo "WRITE WARNING"
  echo "- This wrapper targets production tenant data."
  echo "- Backup first if the operation changes data or schema."
  echo "- For Prisma/Node scripts, keep DATABASE_URL explicit."
  echo ""
  confirm_phrase "write ${RESOLVED_TENANT_SLUG}"
}
