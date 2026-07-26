# PolyFlow Agent Guide

> Map, not manual — this file routes you to the right context. Each module has its own AGENTS.md with deeper details.

## Context Routing

Route to the right module based on the problem you're solving:

| Problem Domain | Start Here | Deep Dive |
|----------------|------------|-----------|
| **Auth / Login / Session** | `src/auth.ts` + `src/proxy.ts` | `src/lib/auth/AGENTS.md` |
| **Tenant / Subdomain** | `src/lib/core/tenant.ts` | Architecture gotcha below |
| **Inventory / Stock** | `src/actions/inventory/` | `src/actions/inventory/AGENTS.md` |
| **Finance / Accounting / Journal** | `src/actions/finance/` | `src/actions/finance/AGENTS.md` |
| **Production / BOM / Work Order** | `src/actions/production/` | `src/actions/production/AGENTS.md` |
| **Sales / Quotation / Delivery** | `src/actions/sales/` | `src/actions/sales/AGENTS.md` |
| **Purchasing / PO / Receipt** | `src/actions/purchasing/` | `src/actions/purchasing/AGENTS.md` |
| **HRD / Payroll / Attendance** | `src/actions/hrd/` | `src/actions/hrd/AGENTS.md` |
| **Service Layer / Business Logic** | `src/services/` | `src/services/AGENTS.md` |
| **Utilities / Schemas / Config** | `src/lib/` | `src/lib/AGENTS.md` |
| **Dashboard / Analytics** | `src/actions/dashboard/` | — |
| **Settings / Profile** | `src/actions/settings/` | — |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js App Router (src/app/)                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Admin   │  │Warehouse │  │ Operator │  │ Finance  │   │
│  │Dashboard │  │  Portal  │  │  Kiosk   │  │Workspace │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       └──────────────┴──────────────┴──────────────┘        │
│                          │                                   │
│              Server Actions (src/actions/)                   │
│                          │                                   │
│              Service Layer (src/services/)                   │
│                          │                                   │
│              Prisma ORM (prisma/)                            │
│                          │                                   │
│              PostgreSQL (per-tenant database)                │
└─────────────────────────────────────────────────────────────┘

Flow: UI → Action → Service → Prisma → PostgreSQL
Auth: NextAuth v5 (JWT) → proxy.ts → tenant resolution
```

## Common Pitfalls

| Pitfall | Why | Fix |
|---------|-----|-----|
| Hardcode tenant ID | Breaks multi-tenancy | Always use `getTenantContext()` |
| Unbalanced journal | Accounting invariant violated | Debit must equal credit |
| Stock movement without reference | Audit trail broken | Always link to source transaction |
| Use `middleware.ts` for auth | It's stale/unused | Use `src/proxy.ts` (active middleware) |
| Parse subdomain manually | Duplicates logic | Use `extractSubdomain()` from `src/lib/core/tenant.ts` |
| Block `/api/auth/*` unauthenticated | Breaks login entirely | `authConfig.callbacks.authorized()` must return true for `/api/auth` paths |
| Skip lint/typecheck before commit | Catches errors late | Always run `npm run lint` + `npm run build` |

## Module Navigation

Each module directory contains its own `AGENTS.md` explaining:
- **Purpose** — what this module does
- **Key files** — entry points and important files
- **Patterns** — coding conventions specific to this module
- **Gotchas** — known issues and pitfalls

Start from root → read this file → route to module AGENTS.md → dive into code.

---

## Architecture gotcha: `src/proxy.ts` is the ACTIVE middleware, not `middleware.ts`

This repo has BOTH `middleware.ts` (root) and `src/proxy.ts`. In production,
**`src/proxy.ts` is the one that actually runs** (has its own `matcher` config
and wraps `NextAuth(authConfig)` directly). `middleware.ts` appears stale/unused
— do not assume it's in effect when debugging auth/routing issues. Verify with
curl against unknown `/api/auth/*` sub-paths: if you get a redirect instead of
404, `proxy.ts`'s `authorized()` callback is intercepting, not `middleware.ts`.

**Tenant subdomain resolution — single source of truth is `extractSubdomain()`
in `src/lib/core/tenant.ts`.** It has a `RESERVED_SUBDOMAINS` set (`admin`,
`www`, `app`, `api`, `auth`, `static`, `assets`) that must NEVER be treated as
tenants. `src/proxy.ts` calls this same helper to build the `x-tenant-subdomain`
header. Do NOT reintroduce a duplicate ad-hoc subdomain-parsing block in
`proxy.ts` (there used to be one with only `www`/`app` excluded, which caused
`admin.polyflow.uk` to send `x-tenant-subdomain: admin` and break superadmin
login with `TenantNotFound` — fixed 2026-07-18, commits 475558a/942b6e2/03f11de).

`src/auth.ts` `authorize()` resolves subdomain in this priority order:
`formSubdomain` (hidden form field) > `x-tenant-subdomain` header (set by
proxy.ts) > `extractSubdomain(Host header)`. If a new reserved subdomain is
ever needed, add it ONLY to `RESERVED_SUBDOMAINS` in `tenant.ts` — everything
downstream (proxy.ts, auth.ts) already reads from there.

Also: `authConfig.callbacks.authorized()` in `src/auth.config.ts` must always
`return true` early for `pathname.startsWith('/api/auth')` — Auth.js endpoints
(csrf, session, providers, callback) power the login form itself via
client-side `signIn()`. Blocking them for unauthenticated users breaks login
entirely (CSRF token fetch returns a redirect instead of JSON).

---

Whenever completing a task, modifications, or code refactoring in this repository:
1. **Always run ESLint check** via `npm run lint` on the modified files or the entire project to ensure clean code style and prevent unresolved imports/variables.
2. **Always perform type-checking & build** via `npm run build` or `npx tsc --noEmit` to verify code correctness and ensure there are no Next.js compilation issues or TypeScript structural type errors.
3. **Always run unit tests** via `npx vitest run` if files under `services/`, `actions/`, or other logically-heavy components are changed.
4. **Validation enforcement**: Do not submit code or present the task as done to the user if these quality checks fail. Fix all compiler/linter issues first.
