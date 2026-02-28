#!/bin/bash

# Configuration
# Change these values according to your VPS setup
VPS_USER="root"
VPS_IP="173.249.28.105"
DB_NAME="polyflow"
DB_CONTAINER="polyflow-db"
LOCAL_DB_PORT="5434"
LOCAL_DB_USER="polyflow"
LOCAL_DB_NAME="polyflow"
LOCAL_DB_HOST="localhost"

# Create backups directory if it doesn't exist
mkdir -p backups

TIMESTAMP=$(date +%Y%m%dT%H%M%S)
BACKUP_FILE="backups/prod-backup-$TIMESTAMP.dump"

echo "🚀 Starting database sync from production VPS ($VPS_IP)..."

# 1. Take a dump from the production DB container and save it locally
echo "📥 Downloading SQL dump from production (main DB)..."
ssh $VPS_USER@$VPS_IP "docker exec -t $DB_CONTAINER pg_dump -U $LOCAL_DB_USER -d $DB_NAME --clean --if-exists --no-owner --no-privileges" > $BACKUP_FILE

if [ $? -ne 0 ]; then
    echo "❌ Failed to download dump from VPS. Check your SSH connection."
    exit 1
fi

echo "✅ Dump saved to $BACKUP_FILE"

# 2. Restore to the local database
echo "🔄 Restoring SQL dump to local database..."
# We use psql directly since it's a plain SQL dump
cat $BACKUP_FILE | docker exec -i $DB_CONTAINER psql -U $LOCAL_DB_USER -d $LOCAL_DB_NAME

if [ $? -ne 0 ]; then
    echo "❌ Failed to restore dump to local database."
    exit 1
fi

echo "✅ Main database restored."

# 3. Sync tenant databases and fix dbUrls for local development
echo "🏢 Syncing tenant databases..."

# Get all tenants and their dbUrls from the main DB
TENANTS=$(docker exec -t $DB_CONTAINER psql -U $LOCAL_DB_USER -d $LOCAL_DB_NAME -t -A -F'|' -c "SELECT subdomain, \"dbUrl\" FROM \"Tenant\" WHERE status = 'ACTIVE';" 2>/dev/null | tr -d '\r')

if [ -z "$TENANTS" ]; then
    echo "  ℹ️  No active tenants found. Skipping tenant sync."
else
    while IFS='|' read -r SUBDOMAIN DB_URL; do
        # Skip empty lines
        [ -z "$SUBDOMAIN" ] && continue

        TENANT_DB_NAME="polyflow_${SUBDOMAIN}"
        LOCAL_TENANT_URL="postgresql://${LOCAL_DB_USER}:${LOCAL_DB_USER}@${LOCAL_DB_HOST}:${LOCAL_DB_PORT}/${TENANT_DB_NAME}"

        echo ""
        echo "  📦 Tenant: $SUBDOMAIN"

        # Extract the database name from the production dbUrl
        # Format: postgresql://user:pass@host:port/dbname
        PROD_DB_NAME=$(echo "$DB_URL" | sed -E 's|.*://[^/]+/([^?]+).*|\1|')
        echo "    Production DB: $PROD_DB_NAME"

        # Create local tenant database if it doesn't exist
        docker exec -t $DB_CONTAINER psql -U $LOCAL_DB_USER -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$TENANT_DB_NAME'" | grep -q 1
        if [ $? -ne 0 ]; then
            echo "    🆕 Creating database $TENANT_DB_NAME..."
            docker exec -t $DB_CONTAINER psql -U $LOCAL_DB_USER -d postgres -c "CREATE DATABASE $TENANT_DB_NAME;" 2>/dev/null
        fi

        # Dump tenant database from production and restore locally
        echo "    📥 Downloading tenant DB dump..."
        TENANT_BACKUP="backups/tenant-${SUBDOMAIN}-${TIMESTAMP}.dump"
        ssh $VPS_USER@$VPS_IP "docker exec -t $DB_CONTAINER pg_dump -U $LOCAL_DB_USER -d $PROD_DB_NAME --clean --if-exists --no-owner --no-privileges" > $TENANT_BACKUP 2>/dev/null

        if [ $? -eq 0 ] && [ -s "$TENANT_BACKUP" ]; then
            echo "    🔄 Restoring tenant DB locally..."
            cat $TENANT_BACKUP | docker exec -i $DB_CONTAINER psql -U $LOCAL_DB_USER -d $TENANT_DB_NAME 2>/dev/null
            echo "    ✅ Tenant DB restored."
        else
            echo "    ⚠️  Could not dump tenant DB from production. Running schema push + seed instead..."
            # Push schema and seed as fallback
            DATABASE_URL="$LOCAL_TENANT_URL" npx prisma db push --skip-generate 2>/dev/null
            DATABASE_URL="$LOCAL_TENANT_URL" npx tsx prisma/seed-tenant.ts 2>/dev/null
            echo "    ✅ Tenant DB seeded with defaults."
        fi

        # Update tenant dbUrl in main DB to point to localhost
        echo "    🔗 Updating dbUrl to local: $LOCAL_TENANT_URL"
        docker exec -t $DB_CONTAINER psql -U $LOCAL_DB_USER -d $LOCAL_DB_NAME -c "UPDATE \"Tenant\" SET \"dbUrl\" = '$LOCAL_TENANT_URL' WHERE subdomain = '$SUBDOMAIN';" 2>/dev/null

    done <<< "$TENANTS"
fi

echo ""
echo "✨ Sync completed successfully! Your local databases are now synced with production."
echo "💡 Tenant dbUrls have been automatically updated for local development."
