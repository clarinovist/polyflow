# PolyFlow Architecture

> This document describes architectural decisions, trade-offs, and system design.
> For agent navigation, see `.agents/AGENTS.md`.

## System Overview

PolyFlow is a multi-tenant ERP for plastic converting manufacturing. Built with Next.js 16 (App Router), Prisma ORM, and PostgreSQL.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client Layer                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  Admin   │  │Warehouse │  │ Operator │  │ Finance  │           │
│  │Dashboard │  │  Portal  │  │  Kiosk   │  │Workspace │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       └──────────────┴──────────────┴──────────────┘                │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────────┐
│                      Next.js App Router                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  proxy.ts (ACTIVE middleware)                                │   │
│  │  - Tenant resolution via subdomain                           │   │
│  │  - Auth session validation                                   │   │
│  │  - Route protection                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Server Actions (src/actions/)                               │   │
│  │  - Thin wrappers with withTenant() + safeAction()            │   │
│  │  - Input validation via Zod schemas                          │   │
│  │  - Auth checks via requireAuth()                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────────┐
│                      Service Layer (src/services/)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │Accounting│  │ Inventory│  │Production│  │  Sales   │           │
│  │ Service  │  │  Service │  │  Service │  │  Service │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       └──────────────┴──────────────┴──────────────┘                │
│                              │                                       │
│  ┌──────────────────────────┴──────────────────────────────────┐   │
│  │  Auto-Journal Service                                        │   │
│  │  Financial transactions → Automatic journal entries          │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────────┐
│                      Data Layer                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Prisma ORM                                                  │   │
│  │  - Schema-first approach (prisma/schema.prisma)              │   │
│  │  - Type-safe queries                                         │   │
│  │  - Transaction support                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL 15                                               │   │
│  │  - Database-per-tenant isolation                             │   │
│  │  - One database per tenant company                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Multi-Tenancy

### Strategy: Database-per-Tenant

Each tenant (company) has its own PostgreSQL database. This provides:
- **Strong isolation** — No data leakage between tenants
- **Independent schemas** — Tenants can have custom fields
- **Backup per tenant** — Individual backup/restore
- **Compliance** — Data residency requirements

### Tenant Resolution Flow

```
Request → proxy.ts → extractSubdomain(Host)
                        │
                        ├─ Is reserved? (admin, www, app, api, auth, static, assets)
                        │   └─ Yes → Not a tenant, continue
                        │   └─ No → Set x-tenant-subdomain header
                        │
                        ▼
                    auth.ts authorize()
                        │
                        ├─ formSubdomain (hidden field) — highest priority
                        ├─ x-tenant-subdomain header
                        └─ extractSubdomain(Host) — fallback
```

### Database Switching

```typescript
// lib/core/prisma.ts
// Dynamic database URL based on tenant
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getTenantDatabaseUrl(tenantId),
    },
  },
});
```

## Data Flow Patterns

### Standard CRUD Flow

```
UI Component
    │
    ▼
Server Action (src/actions/)
    │  - withTenant() for tenant context
    │  - safeAction() for error handling
    │  - requireAuth() for auth check
    │  - Zod schema validation
    │
    ▼
Service Layer (src/services/)
    │  - Business logic
    │  - Prisma queries
    │  - Transaction management
    │
    ▼
Prisma ORM
    │
    ▼
PostgreSQL (tenant database)
```

### Financial Transaction Flow

```
Transaction Created (invoice, payment, etc.)
    │
    ▼
Auto-Journal Service
    │  - Detects transaction type
    │  - Resolves accounts from mapping
    │  - Creates balanced journal entry
    │
    ▼
Journal Posting
    │  - Validates debit = credit
    │  - Updates account balances
    │  - Creates audit trail
    │
    ▼
Reports Updated
    - Trial balance
    - General ledger
    - Financial statements
```

## Key Architectural Decisions

### 1. Server Actions over API Routes

**Decision:** Use Next.js Server Actions instead of traditional API routes.

**Rationale:**
- Type safety between client and server
- Automatic serialization
- Built-in form handling
- Simpler code structure

**Trade-off:** Less flexibility for external API consumers.

### 2. Service Layer Separation

**Decision:** Separate actions (thin wrappers) from services (business logic).

**Rationale:**
- Testable business logic
- Reusable across actions
- Clear responsibility boundaries
- Easier to refactor

### 3. Zod for Validation

**Decision:** Use Zod schemas for all input validation.

**Rationale:**
- Type inference (schema → TypeScript type)
- Runtime validation
- Composable schemas
- Good error messages

### 4. Error Classes

**Decision:** Custom error classes (BusinessRule, Validation, NotFound, Authorization).

**Rationale:**
- Consistent error handling
- Type-safe error catching
- Clear error semantics
- Maps to HTTP status codes

### 5. Auto-Journal Pattern

**Decision:** Automatically generate journal entries from financial transactions.

**Rationale:**
- Accounting consistency
- No manual journal errors
- Audit trail
- Real-time financial data

## Portal Architecture

### Four Portals

| Portal | Purpose | Access |
|--------|---------|--------|
| **Admin Dashboard** | System administration | Super admin, tenant admin |
| **Warehouse Portal** | Inventory operations | Warehouse staff |
| **Operator Kiosk** | Production floor | Machine operators |
| **Finance Workspace** | Accounting & finance | Finance team |

### Portal Routing

```typescript
// src/lib/navigation/registry.ts
// Each portal has its own navigation structure
// Portal determined by user role + subdomain
```

## Security Architecture

### Authentication

- **NextAuth v5** with JWT strategy
- **Session-based** authentication
- **Role-based** access control

### Authorization

```typescript
// lib/auth/access-policy.ts
// Permission-based authorization
// Roles → Permissions → Resources
```

### Tenant Isolation

- Database-per-tenant prevents data leakage
- `withTenant()` enforces tenant context
- Reserved subdomains prevent tenant spoofing

## Performance Considerations

### Database

- Connection pooling via Prisma
- Indexed queries for common patterns
- Pagination for large datasets

### Caching

- Next.js static generation where possible
- `revalidatePath()` for dynamic data
- No shared cache between tenants

### Bundle Size

- Dynamic imports for heavy components
- Tree-shaking enabled
- Code splitting by route

## Deployment

### Production Stack

- **Platform:** Docker + Docker Compose
- **Database:** PostgreSQL 15
- **Reverse Proxy:** Nginx
- **SSL:** Let's Encrypt

### Environment Variables

See `.env.example` for required variables.

## Testing Strategy

### Unit Tests

- Services: `src/services/**/__tests__/`
- Utilities: `src/lib/__tests__/`
- Run: `npx vitest run`

### Integration Tests

- Action tests with mocked services
- Database tests with test tenant

### E2E Tests

- Manual testing for critical flows
- Future: Playwright for automated E2E

## Future Considerations

- [ ] API versioning for external consumers
- [ ] Event-driven architecture for cross-module communication
- [ ] CQRS for read-heavy dashboards
- [ ] Microservices for scaling specific modules
