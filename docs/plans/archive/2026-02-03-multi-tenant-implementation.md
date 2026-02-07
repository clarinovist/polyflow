# Multi-Tenant (SaaS) Implementation Plan
**Goal:** Transform Polyflow into a Multi-Tenant SaaS application where each tenant (PT) has a dedicated isolated database, routed via subdomain.
**Architecture:** Subdomain Routing (`pt-abc.polyflow.id`) -> Middleware (Tenant Lookup) -> Dynamic Prisma Client (Database Isolation).
**Tech Stack:** Next.js Middleware, Prisma ORM, PostgreSQL.

## Phase 1: Infrastructure & Middleware

### Task 1: "Main" Database & Tenant Table
**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/xxxx_add_tenant_table`

**Step 1: Write the failing test**
*(Note: We can't strictly TDD schema changes, but we can verify the model exists)*
Check `prisma.tenant` is undefined.

**Step 2: Write minimal implementation**
Add `Tenant` model to `prisma/schema.prisma`:
```prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String
  subdomain String   @unique
  dbUrl     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Step 3: Run migration**
`npx prisma migrate dev --name add_tenant_table`

### Task 2: Middleware Tenant Resolution
**Files:**
- Modify: `src/proxy.ts` (Correct file for Next.js 16+, `middleware.ts` is deprecated)

**Step 1: Write the failing test**
Create a test that simulates a request to `test.polyflow.id` and expects a `x-tenant-id` header.

**Step 2: Write minimal implementation in `src/proxy.ts`**
```typescript
// Inside the auth wrapper
const hostname = req.nextUrl.hostname;
const subdomain = hostname.split('.')[0]; 

// Simple check (later replace with DB lookup)
if (subdomain && subdomain !== 'app' && subdomain !== 'www') {
    // Mock lookup for now or fetch from API
    // req.headers.set('x-tenant-id', 'tenant-uuid'); 
}
```

**Step 3: Verify**
Simulate request and check logs/headers.

## Phase 2: Dynamic Database Connection

### Task 3: Dynamic Prisma Client
**Files:**
- Create: `src/lib/db-factory.ts`
- Modify: `src/lib/prisma.ts` (deprecate global usage for tenant data)

**Step 1: Write failing test**
Try to connect to a specific database URL dynamically.

**Step 2: Write implementation**
```typescript
import { PrismaClient } from '@prisma/client';

const prismaClients: Record<string, PrismaClient> = {};

export function getTenantDb(datasourceUrl: string) {
    if (!prismaClients[datasourceUrl]) {
        prismaClients[datasourceUrl] = new PrismaClient({
            datasources: { db: { url: datasourceUrl } }
        });
    }
    return prismaClients[datasourceUrl];
}
```

## Phase 3: Auth Adaptation

### Task 4: Tenant-Aware Auth
**Files:**
- Modify: `src/auth.config.ts`
- Modify: `src/auth.ts`

**Step 1: Analyze Auth Flow**
Ensure `authorize` callback checks the `x-tenant-id` or subdomain to authenticate users against the *correct* database.

**Step 2: Implementation**
Update `getUser` in `auth.ts` to use `getTenantDb(tenantUrl)` instead of global `prisma`.

## Phase 4: Validation
- [ ] Manual verification with 2 local subdomains (`pt-a.localhost`, `pt-b.localhost`).
- [ ] Verify data strict isolation (PT A cannot see PT B data).
