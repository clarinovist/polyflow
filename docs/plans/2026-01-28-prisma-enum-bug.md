# Plan: Resolving Persistent Prisma Enum Validation Error

**Goal:** Fix the `PrismaClientValidationError` where `ReservationStatus.WAITING` is `undefined` at runtime in Next.js SSR, causing page crashes in the Inventory dashboard.

**Architecture:** 
We will implement "Defensive Programming" by moving away from direct reliance on the auto-generated Prisma enum (`ReservationStatus.WAITING`) in query filters. Since the enum is failing to load correctly in the Next.js dev server environment even after regeneration, we will use hardcoded string literals with type safety via a localized constant. This ensures the value is never `undefined`.

**Tech Stack:** Next.js (SSR), Prisma ORM, TypeScript.

---

### Task 1: Implement Local Constant Fallback
**Files:**
- Modify: `src/services/inventory-service.ts`

**Step 1: Define safe constants**
Instead of importing from `@prisma/client`, we will define a local constant that is guaranteed to be a string.

```typescript
const STATUS_WAITING = 'WAITING';
const STATUS_ACTIVE = 'ACTIVE';
```

**Step 2: Update query logic to use constants**
Replace all instances of `ReservationStatus.WAITING` with `STATUS_WAITING`.

**Step 3: Add runtime validation**
Add a helper to ensure that if the enum is available, we use it, but fall back gracefully.

---

### Task 2: Robustify query filters
**Files:**
- Modify: `src/services/inventory-service.ts`

**Step 1: Update `getStats` filter**
Ensure the array passed to `in` never contains `undefined`.

```typescript
where: {
    status: { in: ['ACTIVE', 'WAITING'] as any }
}
```

**Step 2: Update `getActiveReservations` filter**
Apply the same string literal approach.

---

### Task 3: Verification
**Files:**
- Run: Diagnostic script

**Step 1: Verify with script**
Run a standalone script that uses the same logic to ensure it doesn't crash.

**Step 2: Manual Check**
Refresh the Warehouse > Inventory page.

---

### Task 4: Clean Up
**Files:**
- Modify: `src/lib/prisma.ts` (Restore if needed)

**Step 1: Restore singleton if disabled**
Ensure the production performance isn't affected.
