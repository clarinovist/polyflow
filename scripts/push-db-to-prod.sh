#!/bin/bash

# Configuration
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
BACKUP_FILE="backups/local-backup-$TIMESTAMP.sql"

echo "🚀 Starting database push to production VPS ($VPS_IP)..."
echo "⚠️  WARNING: This will OVERWRITE the production database!"
read -p "Are you sure you want to continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Operation cancelled."
    exit 1
fi

# Dump from local container
# Assuming local container name is 'polyflow-db' as per docker-compose.yml
docker exec -t polyflow-db pg_dump -U $LOCAL_DB_USER -d $LOCAL_DB_NAME --clean --if-exists --no-owner --no-privileges > $BACKUP_FILE

if [ $? -ne 0 ]; then
    echo "❌ Failed to dump local database."
    exit 1
fi

echo "✅ Local dump saved to $BACKUP_FILE"

# 2. Upload and Restore to VPS
echo "📤 Uploading and restoring to VPS..."

# We pipe the local dump file directly to the SSH command which pipes it to the docker exec command
cat $BACKUP_FILE | ssh $VPS_USER@$VPS_IP "docker exec -i $DB_CONTAINER psql -U $LOCAL_DB_USER -d $DB_NAME"

if [ $? -ne 0 ]; then
    echo "❌ Failed to push database to VPS."
    exit 1
fi

echo "✨ Database push completed successfully! Production database is now identical to local."
