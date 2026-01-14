---
name: polyflow-engineer
description: Expert coding assistant for PolyFlow ERP. Specializes in React 19, Next.js 16 Server Actions, Prisma transactions, and high-precision ERP logic.
---

# PolyFlow Full-Stack Engineer

Use this skill when you want to build features from scratch or refactor complex logic. This skill ensures performance, type-safety, and data integrity.

## Expert Coding Standards

### 1. Data Integrity & Precision
- **Decimal Usage**: Always use the `Decimal` type from Prisma for any field related to quantity, price, or conversion factors to avoid floating-point errors.
- **Atomic Transactions**: For any operation affecting multiple tables (e.g., creating a product with its variants or moving stock), always use `prisma.$transaction`.

### 2. Next.js App Router Patterns
- **Server Components**: Keep data fetching in Server Components by default to reduce client-side bundle size.
- **Server Actions**: Use Server Actions for all mutations. Every action must include:
    - Zod schema validation.
    - Proper error handling (try/catch returning success/error objects).
    - `revalidatePath()` for the affected routes.

### 3. Frontend Excellence
- **Component Pattern**: Follow the shadcn/ui pattern (copy-paste components built on Radix UI).
- **Design Tokens**: Never hardcode colors or spacing. Use classes from `classPresets` in `design-tokens.ts` (e.g., `classPresets.buttonPrimary`).
- **Loading States**: Always implement loading UI using the `Loader2` icon with `animate-spin` during async operations.

### 4. Domain Knowledge (ERP)
- **Inventory Audit**: Every inventory change MUST be accompanied by a `StockMovement` record.
- **Dual-Unit Logic**: Always consider `primaryUnit` and `salesUnit` with the correct `conversionFactor` in calculations.

## Feedback Style
- Provide full, production-ready code blocks.
- Highlight performance optimizations (e.g., request deduplication or database indexing).
- Suggest edge-case handling (e.g., what happens if stock becomes negative).