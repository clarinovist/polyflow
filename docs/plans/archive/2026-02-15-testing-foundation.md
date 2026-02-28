# Testing Foundation Implementation Plan

**Goal:** Establish a robust testing infrastructure using Vitest and add critical unit tests for core services (Inventory, Production, Finance) to ensure system stability before v1.0 release.

**Architecture:** Unit tests with mocked Prisma client to isolate service logic. Integration into CI/CD pipeline to prevent regressions.

**Tech Stack:** Vitest, vi (for mocking), GitHub Actions.

---

### Task 1: Vitest Configuration
**Files:**
- Create: `vitest.config.ts`
- Modify: `tsconfig.json` (ensure types are available)
- Modify: `package.json` (add scripts)

**Step 1: Create Config**
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Step 2: Add Scripts**
- `test`: `vitest`
- `test:run`: `vitest run`
- `test:coverage`: `vitest run --coverage`

---

### Task 2: Inventory Service Tests
**Files:**
- Create: `src/services/__tests__/inventory-service.test.ts`
- Modify: `src/services/inventory-service.ts` (if refactoring needed for testability)

**Test Cases:**
1. **Stock Movement (IN)**: Verify inventory increment and transaction log.
2. **Stock Movement (OUT)**: Verify inventory decrement, prevent negative stock if configured.
3. **FIFO Logic**: Ensure oldest batch is used first for OUT movements.

**Mock Strategy:**
- Mock `prisma.$transaction`.
- Mock `prisma.inventory.findUnique`, `prisma.stockMovement.create`, etc.

---

### Task 3: Production Service Tests
**Files:**
- Create: `src/services/__tests__/production-service.test.ts`

**Test Cases:**
1. **BOM Verification**: Ensure BOM exists and has items before order creation.
2. **Material Availability**: Check if enough raw materials exist.
3. **Cost Calculation**: Verify estimated cost summation from BOM items.

---

### Task 4: Accounting Service Tests
**Files:**
- Create: `src/services/__tests__/accounting-service.test.ts`

**Test Cases:**
1. **Double Entry**: Ensure total debit equals total credit for journal entries.
2. **COGM Calculation**: Verify Correctness of Cost of Goods Manufactured logic.

---

### Task 5: CI/CD Integration
**Files:**
- Modify: `.github/workflows/ci-cd.yml`

**Step:**
- Add `test` job before `build`.
- Usage: `npm run test:run`

