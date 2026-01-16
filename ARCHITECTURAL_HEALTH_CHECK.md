# PolyFlow Architectural Health Check 🏥

**Date:** January 2026
**Reviewer:** Senior Software Architect
**Scope:** Application Structure, Scalability, and Maintainability

---

## 🏗️ Architectural Assessment (Current State)

The project follows a **modern, monolithic full-stack architecture** leveraging Next.js 16 features effectively. It is generally healthy and well-organized for its current stage.

### Key Strengths
*   **Modern Stack:** usage of Next.js App Router, Server Actions, and Prisma is aligned with current industry best practices for React applications.
*   **Type Safety:** Strong usage of TypeScript with inferred types from Prisma and Zod ensures end-to-end type safety.
*   **Security Model:** Centralized authentication checks (`requireAuth`) and strict input validation (Zod) in Server Actions provide a solid security baseline.
*   **Directory Structure:** The folder structure (`app`, `actions`, `components`, `lib`) is intuitive and standard for Next.js projects.

---

## ⚠️ Structural Flaws & Risks

While the foundation is solid, several patterns currently threaten scalability and maintainability.

### 1. Inefficient Data Serialization
*   **Issue:** The `InventoryDashboard` page uses `JSON.parse(JSON.stringify(...))` to strip Prisma `Decimal` types.
*   **Impact:** This doubles serialization overhead and creates a performance bottleneck. It also destroys type methods, forcing generic type assertions.
*   **Location:** `src/app/dashboard/inventory/page.tsx`

### 2. "God File" Anti-Pattern (Schemas)
*   **Issue:** `src/lib/zod-schemas.ts` contains validation logic for *every* domain (Inventory, Products, Production, CRM).
*   **Impact:** This file will become unmanageable as the application grows, leading to merge conflicts and poor code discoverability.

### 3. Scalability Risk: In-Memory Aggregation
*   **Issue:** The `getInventoryAsOf` action fetches **all** stock movements to calculate historical stock by iterating through them in memory.
*   **Impact:** This is **O(N)** complexity. As movements grow to 100k+, this function will timeout or crash the server due to memory exhaustion.
*   **Location:** `src/actions/inventory.ts`

### 4. "Fat" Page Components
*   **Issue:** Page components (e.g., `InventoryDashboard`) contain significant business logic for filtering, comparison, and data merging.
*   **Impact:** Violates Separation of Concerns. Logic embedded in UI components is hard to test and reuse.

### 5. Missing Service Layer
*   **Issue:** Business logic is tightly coupled to Server Actions.
*   **Impact:** Server Actions are "Next.js specific" entry points. Mixing core business logic (e.g., "calculate valuation") with transport logic makes it difficult to switch frameworks or add different entry points (e.g., REST API, CLI) later.

---

## 💡 Refactoring Roadmap

### Phase 1: Cleanup & Organization (Immediate)
1.  **Split Schemas:**
    *   Create `src/lib/schemas/` directory.
    *   Move schemas into `inventory.schema.ts`, `product.schema.ts`, `production.schema.ts`.
2.  **Fix Serialization:**
    *   Create a `serializeData` utility in `src/lib/utils.ts` that recursively converts `Decimal` to `number` and `Date` to `string` only where needed, preserving type safety.

### Phase 2: Architectural Layers (Medium Term)
3.  **Implement Service Layer:**
    *   Create `src/services/` directory.
    *   Extract logic from `src/actions/inventory.ts` to `src/services/inventory-service.ts`.
    *   **Refactor:** Server Actions should only handle: `Auth Check` -> `Input Parsing` -> `Call Service` -> `Return Result`.
4.  **Optimize Historical Stock Query:**
    *   Replace the in-memory loop in `getInventoryAsOf` with a Prisma `groupBy` query or a raw SQL window function to calculate sums at the database level.

### Phase 3: Component Hygiene (Long Term)
5.  **Slim Down Pages:**
    *   Move data aggregation logic (Phases 1-3 in `InventoryDashboard`) into the new `InventoryService`.
    *   The Page component should simply await `InventoryService.getDashboardData(params)`.

---
