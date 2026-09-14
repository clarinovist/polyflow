
FROM node:26-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1


# Compile standalone tooling and its shared cores without emitting JS into src.
# Preserve the scripts/prisma entry paths when copying this isolated output.
RUN npx tsc \
  prisma/seed.ts \
  prisma/seed-baseline.ts \
  prisma/fix-coa.ts \
  scripts/provision-tenant.ts \
  scripts/migrate-all-tenants.ts \
  scripts/cleanup-performance-metrics.ts \
  --ignoreConfig --types node --module CommonJS --target ES2020 --esModuleInterop --skipLibCheck \
  --rootDir . --outDir /app/ops-dist

# The TypeScript worker exceeds Node's ~2 GiB default heap on CI.
# Scope the larger heap to this build command; do not change runtime limits.
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install PostgreSQL client (pg_dump) for pre-migration DB snapshots.
# Server runs postgres:15; pg_dump 16 is backward-compatible with v15 servers.
RUN apk add --no-cache postgresql16-client

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs




COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and migrations if needed for runtime migrations
COPY --from=builder /app/prisma ./prisma

# Explicit operational entrypoints: new scripts must be deliberately opted in.
# Keep current manual repair/audit capabilities until their owners retire them.
COPY --from=builder --chown=nextjs:nodejs \
  /app/ops-dist/scripts/provision-tenant.js \
  /app/ops-dist/scripts/migrate-all-tenants.js \
  /app/ops-dist/scripts/cleanup-performance-metrics.js \
  /app/scripts/audit-duplicate-production-voids.js \
  /app/scripts/check-ob.js \
  /app/scripts/repair-maklon-sales-order-locations.js \
  /app/scripts/repair-maklon-stock-locations.js \
  ./scripts/
COPY --from=builder --chown=nextjs:nodejs \
  /app/ops-dist/src/lib/ops/tenant-migrations.js \
  /app/ops-dist/src/lib/ops/performance-metrics-cleanup.js \
  ./src/lib/ops/

# Operational CLIs are outside Next's route trace. Ship the installed Prisma CLI
# and its runtime dependencies explicitly; startup must not download tooling.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
# seed-baseline uses bcryptjs; it is not guaranteed by the app's output trace.
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder /app/node_modules/@prisma/engines-version ./node_modules/@prisma/engines-version
COPY --from=builder /app/node_modules/@prisma/debug ./node_modules/@prisma/debug
COPY --from=builder /app/node_modules/@prisma/fetch-engine ./node_modules/@prisma/fetch-engine
COPY --from=builder /app/node_modules/@prisma/get-platform ./node_modules/@prisma/get-platform

# Copy entrypoint script
COPY --chown=nextjs:nodejs entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Retain the existing seed entrypoints and the seedCoA helper dependency.
COPY --from=builder --chown=nextjs:nodejs \
  /app/ops-dist/prisma/seed.js \
  /app/ops-dist/prisma/seed-baseline.js \
  /app/ops-dist/prisma/fix-coa.js \
  /app/ops-dist/prisma/seed-coa.js \
  ./prisma/

USER nextjs

EXPOSE 3000

ENV PORT=3000
# set hostname to localhost
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./entrypoint.sh"]
