# Lib Layer

## Purpose

Shared utilities, schemas, configuration, auth helpers, and cross-cutting concerns.

## Structure

```
lib/
├── api/             # External API helpers, rate limiting, retry
├── auth/            # Auth policies, permissions, roles, session
├── bot/             # AI chatbot guardrails and metrics
├── config/          # App config, logger, templates
├── constants/       # Shared constants
├── core/            # Tenant resolution, Prisma client, subdomain
├── dates/           # Date utilities
├── errors/          # Error classes, error mapping, error handler
├── finance/         # Payment methods
├── hrd/             # Employee helpers
├── labels/          # UI labels and translations
├── locations/       # Location resolution
├── media/           # Image compression, photo URLs
├── navigation/      # Navigation registry, portal paths
├── production/      # Material path utilities
├── purchasing/      # Walk-in helpers
├── sales/           # Delivery pricing, schedule rules
├── schemas/         # Zod validation schemas
├── serialization/   # Server-to-client serialization
├── settings/        # Notification categories
├── storage/         # R2/S3 storage
├── tools/           # Auth checks, audit, fireworks
├── types/           # Shared TypeScript types
├── ui/              # Design tokens
└── utils/           # General utilities
```

## Key Modules

### `core/tenant.ts` — Tenant Resolution

- `withTenant()` — Wraps actions with tenant context
- `getTenantContext()` — Gets current tenant from request
- `extractSubdomain()` — Extracts subdomain from Host header
- `RESERVED_SUBDOMAINS` — Subdomains that are NOT tenants

### `core/prisma.ts` — Database Client

- Singleton Prisma client
- Per-tenant database switching
- Transaction support
- Status audit extension (`withStatusAudit`) — auto-logs status changes

### `core/actor-context.ts` — Actor Tracking

- `AsyncLocalStorage<{ userId }>` parallel to tenant context
- `getActorUserId()` — reads current actor from context
- `runWithActor(userId, fn)` — runs fn with actor in scope
- Injected automatically by `withTenant` / `withTenantRoute` from session
- Falls back to `'system'` for unauthenticated contexts (cron, scripts)

### `schemas/` — Validation

All Zod schemas for input validation:

- `finance.ts` — Finance schemas
- `inventory.ts` — Inventory schemas
- `journal.ts` — Journal schemas
- `production.ts` — Production schemas
- `purchasing.ts` — Purchasing schemas
- `sales.ts` — Sales schemas

### `errors/` — Error Handling

- `errors.ts` — Error classes (BusinessRule, Validation, NotFound, Authorization)
- `error-map.ts` — Maps Prisma errors to domain errors
- `error-handler.ts` — Global error handler
- `prisma-error-map.ts` — Prisma-specific error mapping

### `auth/` — Authentication & Authorization

- `access-policy.ts` — Access control policies
- `permission-catalog.ts` — All available permissions
- `permission-match.ts` — Permission matching logic
- `roles.ts` — Role definitions
- `sales-access.ts` — Sales-specific access control

## Patterns

### Schema Pattern

```typescript
import { z } from 'zod';

export const mySchema = z.object({
    field: z.string().min(1, 'Field is required'),
    amount: z.number().min(0),
});

export type MyValues = z.infer<typeof mySchema>;
```

### Error Pattern

```typescript
import { BusinessRuleError, ValidationError } from '@/lib/errors/errors';

throw new BusinessRuleError('Insufficient stock');
throw new ValidationError('Invalid input');
```

### Tenant Pattern

```typescript
import { withTenant, getTenantContext } from '@/lib/core/tenant';

// In actions
export const myAction = withTenant(async function myAction() {
    const tenant = getTenantContext();
    // ... use tenant.id for queries
});
```

## Status Change Audit Policy

**Status changes are auto-audited.** `withStatusAudit` extension in `core/prisma-audit-extension.ts` intercepts every `update`/`updateMany` call where `data.status` is present. It reads the old status, compares, and writes to `AuditLog` if changed. Actor userId comes from `actorContext` (set by `withTenant`).

**You do NOT need to manually call `logActivity` for simple status transitions.** The extension covers all models in `AUDITABLE_MODELS`.

**You SHOULD still call `logActivity` when you need business context** in the `details` field — e.g. "Shortages: 2, Warnings: MISSING_DEFAULT_BOM". The extension only records `from → to`, not domain-specific reasons.

**When adding a new model with a `status` field:**

1. Add the model name to `AUDITABLE_MODELS` set in `prisma-audit-extension.ts`
2. No other changes needed — extension covers it automatically

**Known limitation — audit outside transaction:**
The extension creates `AuditLog` entries using the outer PrismaClient, not the `$transaction` `tx` client. This means:

- If a transaction **rolls back**, the audit entry is still created (false positive). Risk: low — rollback is rare in this codebase.
- If the transaction **commits** but audit creation fails, the business mutation succeeds silently (gap). Risk: low — caught by try-catch, only affects non-critical log.
- **Critical operations (cancel, confirm, ship) MUST still call `logActivity` manually inside the `$transaction`** to guarantee atomicity. The extension is a safety net, not a replacement.

**Files involved:**

- `core/prisma-audit-extension.ts` — extension logic + AUDITABLE_MODELS set
- `core/prisma.ts` — wires extension to main + tenant clients
- `core/actor-context.ts` — AsyncLocalStorage for current actor
- `tools/audit.ts` — `logActivity` helper (manual detail logging)

## Coverage

Threshold enforced in `vitest.config.ts`: 71/63/75/72 (Stmts/Branch/Funcs/Lines), target 80%. CI job `test` runs `npx vitest run --coverage` and gates deploy. New lib ≥100 LOC needs test in `__tests__/`. Don't lower threshold — add test.

## Gotchas

| Issue                           | Solution                                                               |
| ------------------------------- | ---------------------------------------------------------------------- |
| Prisma client connection leak   | Use singleton from `core/prisma.ts`                                    |
| Schema validation fails         | Check Zod schema in `schemas/`                                         |
| Tenant not resolving            | Check `extractSubdomain()` in `core/tenant.ts`                         |
| Error not mapping               | Add mapping in `error-map.ts`                                          |
| Permission check failing        | Check `permission-catalog.ts` for available permissions                |
| Status change not logged        | Check model is in `AUDITABLE_MODELS`; check `actorContext` is injected |
| Infinite loop on AuditLog write | Extension skips `AuditLog` model explicitly                            |
| Coverage CI fail                | `npm run test:coverage`, check Lowest % table, add test               |
