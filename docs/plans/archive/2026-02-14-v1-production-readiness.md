# PolyFlow v1.0 Production Readiness Roadmap

**Goal:** Bring PolyFlow from its current feature-complete state to a production-ready v1.0 release with stable migrations, automated testing, proper error handling, and operational tooling.

**Architecture:** Incremental improvements organized by priority — each phase is independently deployable and provides immediate value.

**Tech Stack:** Next.js 15, Prisma ORM, PostgreSQL 15, Vitest, Docker, GitHub Actions

---

## Current State Assessment

| Area | Status | Details |
|------|--------|---------|
| **Features** | ✅ Complete | 7 modules (Production, Sales, Purchasing, Warehouse, Finance, Analytics, Master Data) |
| **Build** | ✅ Clean | `npm run build` passes, 0 TypeScript errors |
| **Lint** | ✅ Clean | `npm run lint` passes, 0 errors |
| **CI/CD** | ⚠️ Partial | `build.yml` exists, but no test step in pipeline |
| **Tests** | 🔴 Missing | Only 1 placeholder test (`production-utils.test.ts`) |
| **Migrations** | 🔴 Drift | Several modified-after-applied migrations, missing `20260117141709_init` |
| **DB Credentials** | 🟡 Hardcoded | `docker-compose.yml` uses plain text `POSTGRES_PASSWORD=polyflow` |
| **Error Handling** | 🟡 Inconsistent | Mix of try-catch and unhandled, no centralized error classes |
| **Monitoring** | 🔴 None | No error tracking (Sentry), no health checks |
| **Backup** | 🔴 None | No automated DB backup, only manual scripts |
| **Versioning** | 🟡 Placeholder | `package.json` version is `0.1.0`, no git tags |

---

## Phase 1: Database Stability (Priority: CRITICAL)

> Fix migration drift so `prisma migrate dev` works cleanly.

### Task 1.1: Baseline Migration from Production DB

**Files:**
- Create: `prisma/migrations/0_baseline/migration.sql`
- Modify: `prisma/migrations/migration_lock.toml`

**Steps:**
1. Dump current production schema:
   ```bash
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_baseline/migration.sql
   ```
2. Mark all existing migrations as resolved:
   ```bash
   npx prisma migrate resolve --applied 0_baseline
   ```
3. Verify `prisma migrate dev` no longer detects drift
4. Commit: `fix: baseline migration to resolve drift`

### Task 1.2: Automated Backup Cron (VPS)

**Files:**
- Create: `scripts/backup-db.sh`
- Create: `scripts/setup-cron-backup.sh`

**Steps:**
1. Write `backup-db.sh`:
   ```bash
   #!/bin/bash
   BACKUP_DIR="/opt/backups/polyflow"
   TIMESTAMP=$(date +%Y%m%d_%H%M%S)
   docker exec polyflow-db pg_dump -U polyflow polyflow > "$BACKUP_DIR/polyflow_$TIMESTAMP.sql"
   # Keep last 7 days
   find "$BACKUP_DIR" -name "*.sql" -mtime +7 -delete
   ```
2. Add cron entry: `0 2 * * * /opt/polyflow/scripts/backup-db.sh`
3. Test: Run manually, verify `.sql` file is created
4. Commit: `ops: add automated daily DB backup script`

---

## Phase 2: Testing Foundation (Priority: HIGH)

> Establish testing patterns for service-layer business logic.

### Task 2.1: Vitest Configuration

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test:coverage` script)
- Modify: `tsconfig.json` (add test paths if needed)

**Steps:**
1. Create `vitest.config.ts` with path aliases matching `tsconfig.json`
2. Add scripts: `"test": "vitest"`, `"test:coverage": "vitest --coverage"`
3. Run: `npm test` → should pass with existing placeholder test
4. Commit: `test: configure vitest with proper path aliases`

### Task 2.2: Service Layer Unit Tests — Inventory

**Files:**
- Create: `src/services/__tests__/inventory-service.test.ts`

**Test cases (following error-handling-patterns skill):**
- Stock movement creation (IN, OUT, TRANSFER)
- Negative stock prevention
- FIFO material issuance ordering
- Stock reservation logic

**Steps:**
1. Write failing tests with mocked Prisma client
2. Run: `npm test` → verify failures
3. Ensure implementation passes
4. Run: `npm test` → all green
5. Commit: `test: add inventory-service unit tests`

### Task 2.3: Service Layer Unit Tests — Production

**Files:**
- Create: `src/services/__tests__/production-service.test.ts`

**Test cases:**
- BOM cost calculation
- Work order status transitions
- Material issue with FIFO
- Scrap percentage calculation

### Task 2.4: Service Layer Unit Tests — Finance

**Files:**
- Create: `src/services/__tests__/accounting-service.test.ts`

**Test cases:**
- Journal entry double-entry balance validation
- COGM calculation
- Payment void and journal cleanup
- Fiscal period boundary checks

### Task 2.5: CI Pipeline — Add Test Step

**Files:**
- Modify: `.github/workflows/build.yml`

**Steps:**
1. Add `test` job before `build` job:
   ```yaml
   test:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: actions/setup-node@v4
         with:
           node-version: '20'
       - run: npm ci
       - run: npm test
   ```
2. Make `build` depend on `test`: `needs: test`
3. Push and verify pipeline runs tests
4. Commit: `ci: add test step to build pipeline`

---

## Phase 3: Error Handling & Resilience (Priority: MEDIUM)

> Centralize error handling using patterns from `error-handling-patterns` skill.

### Task 3.1: Application Error Hierarchy

**Files:**
- Create: `src/lib/errors.ts`

**Implementation (from error-handling-patterns skill):**
```typescript
export class ApplicationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends ApplicationError {
  constructor(resource: string, id: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404, { resource, id });
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
  }
}
```

### Task 3.2: Adopt Error Classes in Services

**Files:**
- Modify: `src/services/inventory-service.ts`
- Modify: `src/services/production-service.ts`
- Modify: `src/services/accounting-service.ts`

**Steps:**
1. Replace generic `throw new Error(...)` with typed errors
2. Ensure server actions catch and return structured error responses
3. Test error paths
4. Commit: `refactor: adopt typed error hierarchy in services`

### Task 3.3: Global Error Boundary (UI)

**Files:**
- Create: `src/app/error.tsx` (Next.js error boundary)
- Create: `src/app/global-error.tsx`

**Steps:**
1. Implement user-friendly error page with retry button
2. Log errors to console (prep for Sentry integration)
3. Commit: `feat: add global error boundary UI`

---

## Phase 4: Security & Configuration (Priority: MEDIUM)

### Task 4.1: Environment Variables for Docker

**Files:**
- Modify: `docker-compose.yml`
- Create: `.env.example`

**Steps:**
1. Replace hardcoded `POSTGRES_PASSWORD=polyflow` with `${POSTGRES_PASSWORD}`
2. Create `.env.example` documenting all required env vars
3. Verify docker-compose still works with `.env` file
4. Commit: `security: remove hardcoded credentials from docker-compose`

### Task 4.2: Health Check Endpoint

**Files:**
- Create: `src/app/api/health/route.ts`
- Modify: `docker-compose.yml` (add healthcheck)

**Steps:**
1. Create `/api/health` that checks DB connectivity
2. Add Docker healthcheck configuration
3. Commit: `ops: add health check endpoint`

---

## Phase 5: Monitoring & Observability (Priority: MEDIUM-LOW)

### Task 5.1: Sentry Integration

**Files:**
- Modify: `package.json` (add `@sentry/nextjs`)
- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Modify: `next.config.ts` (wrap with Sentry)

**Steps:**
1. `npm install @sentry/nextjs`
2. Run: `npx @sentry/wizard@latest -i nextjs`
3. Configure DSN, environment, release version
4. Test: Trigger intentional error, verify Sentry captures it
5. Commit: `ops: integrate Sentry error monitoring`

### Task 5.2: Structured Logging

**Files:**
- Create: `src/lib/logger.ts`

**Steps:**
1. Create logger with severity levels (info, warn, error)
2. Include timestamp, module context, request ID
3. Replace scattered `console.log` with structured logger calls
4. Commit: `ops: add structured logging`

---

## Phase 6: Versioning & Release (Priority: LOW)

### Task 6.1: Semantic Versioning Setup

**Steps:**
1. Update `package.json` version to `0.9.0`
2. Tag: `git tag -a v0.9.0 -m "Pre-release: all modules feature-complete"`
3. Push tag: `git push origin v0.9.0`
4. Create GitHub Release with CHANGELOG notes

### Task 6.2: v1.0.0 Release Criteria

**Checklist to promote from v0.9.0 → v1.0.0:**
- [ ] Zero migration drift (Phase 1) ✅
- [ ] Automated DB backups running (Phase 1)
- [ ] ≥ 20 service-layer tests passing (Phase 2)
- [ ] Tests run in CI before deploy (Phase 2)
- [ ] Centralized error handling (Phase 3)
- [ ] No hardcoded credentials (Phase 4)
- [ ] Health check endpoint (Phase 4)
- [ ] Error monitoring active (Phase 5)

---

## Execution Timeline

| Phase | Estimated Effort | Dependencies |
|-------|-----------------|--------------|
| **Phase 1**: DB Stability | 2-3 hours | None |
| **Phase 2**: Testing | 2-3 days | Phase 1 (clean migrations) |
| **Phase 3**: Error Handling | 1 day | None (can parallel with Phase 2) |
| **Phase 4**: Security | 1-2 hours | None |
| **Phase 5**: Monitoring | 2-3 hours | Phase 3 (error classes) |
| **Phase 6**: Versioning | 30 minutes | All above |

**Total estimated effort: ~5-6 working days**

---

## Verification Plan

### Automated
- `npm test` — All unit tests pass
- `npm run build` — Clean build
- `npm run lint` — 0 errors
- `npx prisma migrate dev` — No drift detected
- CI pipeline — Tests + build green on push

### Manual
- Deploy to VPS, verify `/api/health` returns 200
- Trigger error in production, verify Sentry captures it
- Check `docker exec polyflow-db` — backup files exist
- Verify `.env.example` documents all required variables
