---
name: polyflow-quality-playbook
description: 'Create PolyFlow quality playbooks, test plans, and risk audits for inventory, production, finance, purchasing, sales, auth, and deployment-sensitive flows.'
---

# PolyFlow Quality Playbook

Use this skill when you need to define what correct means for PolyFlow, expand test coverage, or audit a risky change before it reaches production.

## When to Use This Skill

Use this skill when the request involves:
- building or updating tests for a PolyFlow feature
- reviewing a change for silent data loss, audit-trail gaps, incorrect stock movement, or broken accounting balance
- validating server actions, Prisma transactions, or domain state transitions
- preparing a quality checklist for release or refactor work
- deciding which modules deserve the strongest regression coverage

## Workflow

1. Read the project context that defines the expected behavior.
   - Start with `README.md`
   - Read `docs/FEATURES.md`
   - Read `docs/ARCHITECTURE.md`
   - Read `docs/ARCHITECTURAL_HEALTH_CHECK.md`
   - Read `docs/plans/HIGH_PRIORITY_IMPROVEMENTS_PLAN.md`
   - Check `package.json` for available scripts and test tooling
2. Focus on the most failure-prone flows first.
   - Inventory stock movement and stock opname
   - Production execution and material consumption
   - Purchasing receipts, invoices, and approval flow
   - Sales order and maklon handling
   - Finance journals, payments, and period logic
3. Prefer real code and real data shapes.
   - Inspect the relevant `src/actions/*`, `src/services/*`, `src/lib/*`, and `prisma/schema.prisma`
   - Use the existing test style in `src/**/*.test.ts` and `tests/**/*.test.ts`
4. Turn findings into verification.
   - Write tests for the expected behavior, not implementation details
   - Call out edge cases, rollback paths, and invalid inputs
   - Identify where a new regression test should land
5. Verify with repo commands.
   - `npm run lint`
   - `npm run test`
   - `npm run test:coverage`
   - `npm run build` for UI changes
   - `npx prisma generate` when schema or client types change

## Guidance

- Treat `JSON.parse(JSON.stringify(...))` around Prisma data as a smell worth checking.
- Treat large in-memory aggregation, missing transaction boundaries, and unguarded state transitions as quality risks.
- Preserve audit trails unless the specification explicitly requires deletion.
- If a change touches stock, production, finance, or auth, write the strongest checks there first.
- Prefer one scenario per important failure mode instead of broad happy-path only coverage.

## References

- `docs/ARCHITECTURAL_HEALTH_CHECK.md`
- `docs/FEATURES.md`
- `docs/MAKLON_SALES_FLOW.md`
- `docs/SOP_MAKLON_SALES_OPERASIONAL.md`
- `docs/plans/HIGH_PRIORITY_IMPROVEMENTS_PLAN.md`
