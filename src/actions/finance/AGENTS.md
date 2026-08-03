# Finance Module

## Purpose

Server actions for accounting, journal entries, invoices, payments, petty cash, reconciliation, and financial reporting.

## Authorization (Workstream 02)

All exported actions use finance access guards from `@/lib/auth/finance-access`.
Plain `requireAuth()` is NOT used — every action requires one of:

| Guard | Roles | Use case |
|-------|-------|----------|
| `requireFinanceAccess()` | ADMIN, FINANCE | Read operations (reports, queries, lists) |
| `requireFinanceMutation()` | ADMIN, FINANCE | Payment, asset, budget, reconciliation mutation |
| `requireFinanceApprover()` | ADMIN, FINANCE | Post/void/reverse journal, close/reopen period, reconciliation final |
| `requireFinanceAdmin()` | ADMIN only | resetAllMappings (destructive) |
| `requireFinanceReadCrossPortal(roles)` | ADMIN, FINANCE + listed roles | Cross-portal read exceptions |

### Cross-portal exceptions (§9.14)

| Action | File | Allowed extra roles | Reason |
|--------|------|---------------------|--------|
| `getWipValuation` | finance.ts | PRODUCTION | Production costing |
| `getOrderCosting` | finance.ts | PRODUCTION | Production costing |
| `getAccounts` | account-actions.ts | (already guarded) | Product master |
| `getOutstandingInvoicesByCustomerId` | invoice.ts | SALES, FIELD_SALES | Field Sales AR lookup |
| `getSalesInvoices` | invoices.ts | SALES | Sales invoice list |
| `getInvoiceStats` | invoices.ts | SALES | Sales invoice stats |
| `getPurchaseInvoices` | invoices.ts | PROCUREMENT | Purchasing AP |
| `getOutstandingPurchaseInvoices` | invoices.ts | PROCUREMENT | Purchasing AP |

### Guard assignment by file

**role-mapping.ts**: getRoleMappings=read, updateRoleMapping=mutation, seedMissingMappings=mutation, resetAllMappings=admin
**revenue-rules.ts**: get=read, create/update/delete=mutation
**accounting.ts**: read reports=read, create/update/delete account=mutation, journal entry=mutation, close period=approver, year-end closing=approver, FA create/depreciation=mutation, budget set=mutation
**coa-audit.ts**: audit=read, fixMissingAccounts=approver
**journal.ts**: get/list=read, create/update=mutation, post/void/reverse=approver, bulk create=mutation, closePeriod=approver
**journal-actions.ts**: getJournalEntries=read, batchPostJournals=approver
**invoice.ts**: get/list=read, create/update=mutation, getOutstandingByCustomer=cross-portal(SALES,FIELD_SALES)
**invoices.ts**: getSalesInvoices=cross-portal(SALES), getPurchaseInvoices=cross-portal(PROCUREMENT), getOutstandingPurchase=cross-portal(PROCUREMENT), getInvoiceStats=cross-portal(SALES), deleteInvoice=mutation
**payment-query-actions.ts**: all=read
**payment-mutation-actions.ts**: record=mutation, delete=mutation
**opening-balance-create-actions.ts**: getAccounts=read, save=mutation
**opening-balance-history-actions.ts**: getRecent=read, delete=mutation
**period-actions.ts**: getFiscalPeriods=read, getIncomeStatementSummary=read, generatePeriodsForYear=mutation, closePeriod=approver, reopenPeriod=approver
**reconciliation-actions.ts**: create/match/adjust=mutation, complete/adjustmentJournals=approver, get/list/calculate=read
**petty-cash-actions.ts**: get=read, create/approve/replenish=mutation
**petty-cash-report-actions.ts**: signatures get=read, save=mutation; report get=read, create/mark/confirm/finalize/void=mutation
**asset-actions.ts**: get=read, create/update/delete/depreciate=mutation
**budget-actions.ts**: get=read, upsert=mutation
**budgeting-actions.ts**: getBudgetVsActuals=read
**foh-actions.ts**: all=read
**tax-actions.ts**: getTaxSummary=read
**aging-actions.ts**: getAgingSummary=read
**mobile-dashboard.ts**: all=read
**hpp-report.ts**: getHppReportData=read, lockPeriod=approver, unlockPeriod=approver, getPeriodLock=read
**cost-history.ts**: getCostHistory=read, updateStandardCost=mutation
**payment-banks-actions.ts**: getPaymentBanks=requireRole(ADMIN,FINANCE,SALES,PROCUREMENT), updatePaymentBanks=requireRole(ADMIN,FINANCE)
**finance.ts**: getWip/getOrderCost=cross-portal(PRODUCTION), getProductionCostReport=read, updateOverdue=mutation; payment re-exports delegate to payment-actions

## Key Files

| File                           | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `accounting.ts`                | Core accounting operations (COA, periods, trial balance) |
| `journal.ts`                   | Manual journal entries, bulk import, posting             |
| `journal-actions.ts`           | Journal CRUD operations                                  |
| `invoice.ts`                   | Sales & purchase invoice management                      |
| `invoices.ts`                  | Invoice queries and listing                              |
| `payment-banks-actions.ts`     | Bank payment processing                                  |
| `payment-mutation-actions.ts`  | Payment mutations and tracking                           |
| `petty-cash-actions.ts`        | Petty cash transactions                                  |
| `petty-cash-report-actions.ts` | Petty cash reporting                                     |
| `reconciliation-actions.ts`    | Bank reconciliation                                      |
| `opening-balance-*.ts`         | Opening balance management                               |
| `period-actions.ts`            | Fiscal period management                                 |
| `cost-history.ts`              | Standard cost tracking                                   |
| `revenue-rules.ts`             | Revenue recognition rules                                |

## Patterns

### Action Structure (post-authz)

```typescript
'use server';
import { withTenant } from '@/lib/core/tenant';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireFinanceAccess } from '@/lib/auth/finance-access';

export const myAction = withTenant(async function myAction(data: InputType) {
    return safeAction(async () => {
        await requireFinanceAccess();  // or requireFinanceMutation, etc.
        // ... business logic
        return result;
    });
});
```

### Journal Entry Rules

- **Debit must equal credit** — enforced at service layer
- Every journal needs: `entryDate`, `description`, `reference`, `referenceType`
- Auto-generated journals set `isAutoGenerated: true`
- Use `normalizeToBusinessDay()` for entry dates

### Invoice Lifecycle

- Sales: Quotation → Sales Order → Delivery → Invoice → Payment
- Purchase: PO → Receipt → Invoice → Payment
- Invoices can be linked to journals via `referenceId` + `referenceType`

## Gotchas

| Issue                          | Solution                                            |
| ------------------------------ | --------------------------------------------------- |
| Journal posting fails silently | Check `JournalStatus` — must be `DRAFT` to post     |
| Opening balance mismatch       | Run `scripts/check-ob.js` to diagnose               |
| Period locked                  | Check `period.isLocked` before allowing edits       |
| Cost history drift             | Use `updateStandardCost()` after BOM changes        |
| Auto-journal duplication       | Check `isAutoGenerated` flag before manual creation |

## Service Layer

Business logic lives in `src/services/accounting/` and `src/services/finance/`.
Actions are thin wrappers — keep logic in services.
