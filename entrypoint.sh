#!/bin/sh
set -e

# Run migrations
echo "Running Prisma migrations..."
npx prisma migrate deploy

# Start the application
echo "Starting application..."
node server.js
