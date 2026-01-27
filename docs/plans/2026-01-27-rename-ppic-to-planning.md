# Brainstorming: Renaming "PPIC" to "Planning"

## Context
The user wants to standardize terminology by replacing "PPIC" (Production Planning & Inventory Control) with "Planning". Currently, the codebase uses both: `PPIC` (often as a Role enum or label) and `Planning` (often as a URL segment `/planning`).

## Scope of Change

### 1. User Interface (Labels & Text)
*   **Current**: Sidebar headers, Button text, Dashboard titles, Role badges might say "PPIC".
*   **Target**: Change all customer-facing text to "Planning" or "Planner".
*   **Impact**: Low risk, high clarity for users.

### 2. URL Structure
*   **Current**: Already largely uses `/planning` (e.g. `src/app/[locale]/planning`).
*   **Target**: Ensure direct consistency.
*   **Impact**: Minimal, as structure seems aligned already.

### 3. Code & Database (The Tricky Part)
*   **Role Eums**: `Role.PPIC` vs `Role.PLANNING`.
*   **Variable Names**: `ppicData`, `isPPIC`, etc.
*   **Database**: If `Role` is an Enum in Prisma, changing it requires a database migration and potentially data migration for existing users.

---

## Proposed Approaches

### Approach A: Full Refactor (UI + Code + DB)
Replace every instance of "PPIC" with "PLANNING" everywhere.
*   **Changes**:
    *   Rename Prisma Role Enum: `PPIC` -> `PLANNING`.
    *   Rename all variables/files: `ppic.ts` -> `planning.ts`.
    *   Update all UI text.
*   **Pros**: Complete consistency. No "mental mapping" needed for developers.
*   **Cons**: High risk. Requires DB migration. Breaks existing data if not migrated carefully. Large diff.

### Approach B: Surface-Level Refactor (UI Only)
Keep the internal code/DB as `PPIC` (since it stands for the *function*), but present it everywhere as "Planning" to the user.
*   **Changes**:
    *   Update translations (`id.json`, `en.json`) to map `PPIC` -> "Planning".
    *   Update Sidebar labels.
    *   Keep Prisma Enum `Role.PPIC`.
*   **Pros**: Safe, zero risk of data loss. Very fast.
*   **Cons**: Code vs UI discrepancy (`nav.role === 'PPIC'` renders "Planning").

### Approach C: Hybrid (Code Alias)
Rename codebase file names and easy variables, but keep DB Enum as `PPIC` to avoid migration headaches? No, usually bad practice.

---

## Recommendation
**Approach A (Full Refactor)** is usually best for long-term health, **IF** the project is still in early development (pre-production data).
**Approach B** is best if you have live production data you don't want to touch.

Given you are refining the workspace now, **Approach A** seems ideal to align the "Mental Model" with the "Code Model".

### Clarifying Question
Is your database effectively "fresh" (dev mode), allowing us to change the Prisma Enum freely? Or do we need to preserve live user data?
