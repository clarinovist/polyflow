---
name: polyflow-code-reviewer
description: Reviews PolyFlow ERP code for architectural consistency. Focuses on Next.js Server Actions, Prisma transactions, Zod validation, and inventory logic.
---

# PolyFlow Code Reviewer

This skill ensures that all code contributions follow the **PolyFlow System Architecture** and maintain data integrity across the ERP system.

## Core Technical Standards

### 1. Next.js Server Actions
- **Zod Validation**: Every Server Action MUST start with a Zod schema validation (`safeParse`).
- **Cache Invalidation**: Mutations must use `revalidatePath()` to ensure the UI stays in sync.
- **Error Handling**: Use try-catch blocks and return consistent objects like `{ success: boolean, error?: string }`.

### 2. Database & Prisma
- **Transactions**: Critical operations (e.g., stock transfers, production output) MUST use `prisma.$transaction` to ensure atomicity.
- **Decimal Precision**: Always use `Decimal` for quantities and prices to avoid floating-point errors.
- **Singleton Pattern**: Database access should only happen via the Prisma singleton in `src/lib/prisma.ts`.

### 3. Inventory Logic (Domain Specific)
- **Stock Movements**: Every inventory change MUST create a corresponding `StockMovement` record for auditing.
- **Dual-Unit Handling**: Ensure conversion factors are applied correctly when dealing with `primaryUnit` vs `salesUnit`.
- **SKU Integrity**: Verify that SKU codes are handled as unique identifiers.

## Review Checklist

- [ ] Does the Server Action validate input with Zod?
- [ ] Are database mutations wrapped in a transaction where necessary?
- [ ] Is `revalidatePath` called after data changes?
- [ ] Are variables named descriptively following the project's camelCase convention?
- [ ] If inventory is moved, is a `StockMovement` logged?

## Feedback Guidelines
- Be technical and precise.
- Reference specific files like `ARCHITECTURE.md` or `FEATURES.md` when pointing out violations.
- Provide code snippets for suggested improvements.
- Use prefixes: **[Logic]**, **[Security]**, or **[Performance]**.