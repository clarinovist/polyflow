# PolyFlow Module Template

**Status:** Official module template for PolyFlow v2 architecture.  
**Purpose:** Standardize new domain modules so they stay tenant-safe, testable, and easy to evolve.

Use this template when creating a new module under `src/modules/<domain>/` or when gradually migrating an existing domain from `src/actions`, `src/services`, and `src/lib/schemas`.

---

## 1. Module Goals

A PolyFlow module should provide a clear boundary for one business domain.

A module owns:

- business rules
- service/use-case orchestration
- data access contracts
- validation schemas
- permission/domain policies
- domain events
- module-level tests
- public exports

A module should not become a dumping ground for unrelated helpers.

---

## 2. Recommended Structure

```txt
src/modules/<domain>/
  README.md
  index.ts
  actions/
  services/
  repositories/
  schemas/
  events/
  policies/
  tests/
```

Folder purpose:

| Folder | Purpose |
|---|---|
| `actions/` | Thin Server Actions/API adapters. Auth, parse input, call service, revalidate. |
| `services/` | Business use cases and domain orchestration. |
| `repositories/` | Prisma/raw SQL access for this module. Keep complex queries here. |
| `schemas/` | Zod schemas and DTO validation. |
| `events/` | Domain events published/consumed by this module. |
| `policies/` | Permission and domain policy checks. |
| `tests/` | Module-level service/repository/policy tests. |
| `index.ts` | Public module exports only. |

---

## 3. Dependency Rule

Allowed direction:

```txt
app -> actions -> services -> repositories -> db
services -> shared utilities
services -> other modules only through public exports/contracts
repositories -> prisma/sql
```

Avoid:

```txt
page/component -> prisma
page/component -> complex business rule
action -> direct journal posting logic
action -> direct stock balance mutation
service -> import UI component
repository -> import action/service from another module
script -> write tenant DB without preflight
```

---

## 4. Public API Rule

Each real module should expose public contracts from `index.ts`.

Example:

```ts
export { InventoryLedgerService } from "./services/inventory-ledger-service";
export type { StockCommand } from "./services/types";
```

Other domains should prefer importing from:

```ts
import { InventoryLedgerService } from "@/modules/inventory";
```

not from deep internal paths unless there is a deliberate exception.

---

## 5. Server Action Pattern

Server Actions are adapters, not business logic containers.

Target shape:

```ts
"use server";

export async function runDomainAction(input: unknown) {
  const user = await requireAuth();
  const parsed = domainActionSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const result = await DomainService.run({
      input: parsed.data,
      actorId: user.id,
    });

    revalidatePath("/target/path");
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: mapDomainError(error) };
  }
}
```

Action should not contain:

- multi-step accounting logic
- direct stock balance mutation
- complex report aggregation
- raw SQL unless isolated and justified
- permission branching duplicated from policy layer

---

## 6. Service Pattern

Service owns business rules and transaction orchestration.

Recommended shape:

```ts
export class DomainService {
  static async run(params: {
    input: DomainInput;
    actorId: string;
  }) {
    // validate domain invariants that cannot be expressed by Zod only
    // call repositories
    // publish domain event if needed
    // return DTO
  }
}
```

For high-risk domains:

- inventory mutation must go through ledger/command service
- accounting mutation must go through Finance & Accounting core contract
- tenant operation must run preflight first
- production output/material issue must keep inventory + accounting handoff explicit

---

## 7. Repository Pattern

Repository is for data access only.

Allowed:

- Prisma queries
- raw SQL for performance-critical queries
- query-specific mapping to DTO
- transaction client support

Avoid:

- user-facing messages
- UI formatting
- cross-domain orchestration
- direct calls to Server Actions

Repository functions should accept optional `tx` when used inside transactions.

---

## 8. Schema Pattern

Schemas should live close to the module when they are module-specific.

Recommended:

```txt
schemas/
  create-domain-record.schema.ts
  update-domain-record.schema.ts
  import-domain-record.schema.ts
```

Rules:

- Zod handles input shape and basic validation.
- Service handles domain invariants.
- Shared schemas go to `src/shared` or current shared schema location only when reused broadly.

---

## 9. Events Pattern

Use events for cross-domain side effects.

Example:

```txt
ProductionOutputPosted -> Finance & Accounting journal draft
GoodsReceived -> Inventory valuation + accounting rule
SalesInvoicePosted -> AR/revenue/tax posting
```

Event should include:

- tenant id/context
- event type
- source module
- source document type
- source document id
- occurred at
- payload
- idempotency key

---

## 10. Policy Pattern

Policies answer yes/no or return explicit violation reasons.

Examples:

- can user access workspace?
- can production order transition status?
- can period accept journal posting?
- can stock go negative?
- can operator run write command for tenant?

Keep policy logic reusable and testable.

---

## 11. Testing Checklist

Minimum for critical modules:

- service happy path
- service validation/domain violation
- idempotency behavior when relevant
- transaction rollback behavior when relevant
- permission/policy behavior
- repository query for complex/raw SQL

Use targeted Vitest before broader lint/build.

---

## 12. Migration Guidance

Do not move code just to move code.

Migrate when:

- touching a feature anyway
- fixing a business-rule bug
- extracting duplicated logic
- adding tests around critical flow
- creating a new high-risk workflow

Safe migration steps:

1. Add tests around current behavior if possible.
2. Extract service or policy first.
3. Move data query to repository only if it clarifies boundary.
4. Keep Server Action API stable.
5. Keep UI stable unless UI change is required.
6. Verify targeted tests/lint.

---

## 13. New Module Checklist

- [ ] Module has clear owner/domain purpose.
- [ ] `README.md` explains scope and non-scope.
- [ ] `index.ts` exports public API only.
- [ ] Actions are thin adapters.
- [ ] Business rules live in services/policies.
- [ ] Complex queries live in repositories.
- [ ] Input schemas are close to use case.
- [ ] Cross-domain effects use explicit service contract or event.
- [ ] Tenant context is explicit for tenant-sensitive work.
- [ ] Inventory/accounting impact is documented.
- [ ] Critical paths have tests.
