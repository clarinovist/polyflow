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

# Create backups directory if it doesn't exist
mkdir -p backups

TIMESTAMP=$(date +%Y%m%dT%H%M%S)
BACKUP_FILE="backups/prod-backup-$TIMESTAMP.dump"

echo "🚀 Starting database sync from production VPS ($VPS_IP)..."

# 1. Take a dump from the production DB container and save it locally
echo "📥 Downloading SQL dump from production..."
ssh $VPS_USER@$VPS_IP "docker exec -t $DB_CONTAINER pg_dump -U $LOCAL_DB_USER -d $DB_NAME --clean --if-exists --no-owner --no-privileges" > $BACKUP_FILE

if [ $? -ne 0 ]; then
    echo "❌ Failed to download dump from VPS. Check your SSH connection."
    exit 1
fi

echo "✅ Dump saved to $BACKUP_FILE"

# 2. Restore to the local database
echo "� Restoring SQL dump to local database..."
# We use psql directly since it's a plain SQL dump
cat $BACKUP_FILE | docker exec -i $DB_CONTAINER psql -U $LOCAL_DB_USER -d $LOCAL_DB_NAME

if [ $? -ne 0 ]; then
    echo "❌ Failed to restore dump to local database."
    exit 1
fi

echo "✨ Sync completed successfully! Your local database is now identical to production."
echo "💡 Note: You might need to restart your development server to see the changes."
