---
name: polyflow-architecture-blueprint
description: 'Document and explain PolyFlow architecture, data flow, service boundaries, and extension points for the Next.js, Prisma, and PostgreSQL stack.'
---

# PolyFlow Architecture Blueprint

Use this skill when you need to understand, document, or extend the PolyFlow architecture.

## When to Use This Skill

Use this skill when the request involves:
- mapping how a feature moves from UI to server action to database
- documenting the layered architecture for a new contributor
- planning a refactor across app, actions, services, and lib layers
- explaining how a portal or domain module fits into the overall system
- identifying safe extension points for a new feature or integration

## Workflow

1. Read the canonical architecture sources.
   - `docs/ARCHITECTURE.md`
   - `docs/DESIGN_SYSTEM.md`
   - `docs/FEATURES.md`
   - `README.md`
   - `prisma/schema.prisma`
2. Map the real application layers.
   - `src/app` for routes and portals
   - `src/actions` for server actions
   - `src/services` for business logic
   - `src/lib` for shared utilities, schemas, and Prisma access
   - `src/components` for reusable UI
3. Trace the key data flows.
   - Server component read paths
   - Form submission and server action write paths
   - Prisma transaction boundaries
   - Cross-portal navigation and role-based access
4. Document the architecture in a way that matches the repository.
   - Separate admin, finance, kiosk, and warehouse concerns
   - Highlight inventory, production, purchasing, sales, and accounting boundaries
   - Note where audit trails, validation, and design tokens are enforced
5. Include extension guidance.
   - Show where new features should be placed
   - Identify what must be updated when models, services, or actions change
   - Point out risky boundaries that should not be bypassed

## Guidance

- Prefer the actual implementation over theoretical patterns.
- Treat server actions as transport boundaries and services as the business-logic home.
- Call out Prisma relation patterns, shared Zod schemas, and any deliberate cross-module dependencies.
- Preserve the existing portal separation unless there is a strong reason to merge behavior.
- When the system uses a shared design pattern or token set, document it once and reuse it.

## References

- `docs/ARCHITECTURE.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/FEATURES.md`
- `prisma/schema.prisma`
- `src/app`
- `src/actions`
- `src/services`
- `src/components`
- `src/lib`
