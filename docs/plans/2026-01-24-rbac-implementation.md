# RBAC Refinement Implementation Plan
**Goal:** Introduce FINANCE and PROCUREMENT roles to align with organizational structure and update the Access Control system to support them.
**Architecture:** Update `Role` enum in Prisma, implement default permissions for the new roles, and update the Access Control Settings UI.
**Tech Stack:** Prisma, Next.js Server Actions, React.

## User Review Required
> [!IMPORTANT]
> This change modifies the `Role` enum. Existing users with roles other than ADMIN/WAREHOUSE/PRODUCTION/PPIC/SALES (if any, though unlikely given enum constraint) might need attention, but since it's an additive change to the Enum in Postgres, it should be safe.
> **Verification:** We rely on `prisma db push` or migration.

## Proposed Changes

### Database Layer
#### [MODIFY] [schema.prisma](file:///Users/nugroho/Documents/polyflow/prisma/schema.prisma)
- Update `Role` enum to include `FINANCE` and `PROCUREMENT`.

### Backend Logic
#### [MODIFY] [permissions.ts](file:///Users/nugroho/Documents/polyflow/src/actions/permissions.ts)
- Update `DEFAULT_PERMISSIONS` to include:
    - `PROCUREMENT`: Access to `/dashboard/purchasing/*`, `/dashboard/suppliers`, `/dashboard/products`.
    - `FINANCE`: Access to `/dashboard/accounting/*`, `/dashboard/finance/*`, `/dashboard/sales/invoices`, `/dashboard/purchasing/invoices`.
- Refine `PPIC` defaults (remove Purchasing/Finance write access if any).
- Refine `SALES` defaults (ensure no access to Purchasing).

### Frontend UI
#### [MODIFY] [AccessControlTab.tsx](file:///Users/nugroho/Documents/polyflow/src/components/settings/AccessControlTab.tsx)
- Update `ROLES` constant to include `FINANCE` and `PROCUREMENT`.

## Verification Plan

### Automated Tests
- We will rely on manual verification and the build process as there are no specific integration tests for permissions yet.

### Manual Verification
1.  **Schema Update**: Run `npx prisma db push` and `npx prisma generate`.
2.  **UI Check**: Go to Settings -> Access Control. Verify new roles appear in the table.
3.  **Default Seeding**:
    -   Temporarily change a user's role to `FINANCE` in DB.
    -   Login and verify they see Finance menu items.
    -   Verify they do NOT see Production menu items (unless allowed).
