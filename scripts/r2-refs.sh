#!/usr/bin/env bash
# PolyFlow — dump every storage reference from the main + tenant databases.
#
# READ-ONLY. Prints TSV: <db> \t <table.column> \t <value>.
# Used by scripts/r2-gc.sh to decide which objects in the R2 bucket are still
# referenced. Must run on the production host (needs the polyflow-db container).
#
#   ./scripts/r2-refs.sh > /tmp/r2-refs.tsv

set -euo pipefail

CONTAINER="${DB_CONTAINER:-polyflow-db}"
DB_USER="${DB_USER:-polyflow}"
MAIN_DB_NAME="${MAIN_DB_NAME:-polyflow}"
TENANT_DBS="${TENANT_DBS:-}"

q() {
    # No -i on purpose: the caller loop must keep its own stdin.
    docker exec "$CONTAINER" psql -U "$DB_USER" -d "$1" -At -F $'\t' -c "$2"
}

if [ -z "$TENANT_DBS" ]; then
    TENANT_DBS=$(q "$MAIN_DB_NAME" \
        "SELECT \"dbUrl\" FROM \"Tenant\" WHERE status = 'ACTIVE' ORDER BY subdomain;" \
        | sed -E 's|.*://[^/]+/([^?]+).*|\1|' | sort -u | tr '\n' ' ')
fi

for db in $MAIN_DB_NAME $TENANT_DBS; do
    tables=$(q "$db" "
        SELECT c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY 1;")

    for tbl in $tables; do
        # One cheap probe per table: does any row contain a storage path at all?
        hit=$(q "$db" "SELECT count(*) FROM \"$tbl\" x
            WHERE to_jsonb(x)::text LIKE '%/api/images/%'
               OR to_jsonb(x)::text LIKE '%backups/tenants/%';" 2>/dev/null || echo 0)
        [ "${hit:-0}" -gt 0 ] || continue

        cols=$(q "$db" "
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = '$tbl'
              AND data_type IN ('text', 'character varying');")

        while IFS= read -r col; do
            [ -n "$col" ] || continue
            q "$db" "
                SELECT '$db' || E'\t' || '$tbl.$col' || E'\t' || COALESCE(\"$col\"::text, '')
                FROM \"$tbl\"
                WHERE \"$col\"::text LIKE '%/api/images/%'
                   OR \"$col\"::text LIKE '%backups/tenants/%';" 2>/dev/null || true
        done <<< "$cols"
    done
done
