#!/bin/sh
set -e

# Run migrations
echo "Running Prisma migrations..."
npx prisma@5.22.0 migrate deploy

# Start the application
echo "Starting application..."
node server.js
