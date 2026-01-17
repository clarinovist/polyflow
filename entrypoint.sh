#!/bin/sh
set -e

if [ "${SKIP_MIGRATIONS}" = "1" ] || [ "${SKIP_MIGRATIONS}" = "true" ]; then
	echo "Skipping Prisma migrations (SKIP_MIGRATIONS=${SKIP_MIGRATIONS})"
else
	echo "Running Prisma migrations..."
	npx prisma@5.22.0 migrate deploy
fi

# Start the application
echo "Starting application..."
node server.js
