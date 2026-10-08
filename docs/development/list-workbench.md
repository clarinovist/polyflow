# List Workbench Conventions

Use these patterns for operational/master list routes. Domain query, permission, labels, status semantics, and mutations remain in their owner module.

## Client vs server pagination

- Use client pagination only when the route intentionally loads the bounded full dataset and sorting/filtering is client-owned.
- Use server pagination for unbounded or transactional registers. Default 50, options 25/50/100, maximum 100.
- `DataTable.serverPagination` receives zero-based `pageIndex`, `pageCount`, `totalCount`, `pageSize`, and callbacks. It never imports router/actions.
- Server rows stay in supplied order; pair server pagination with `manualSorting`. Never client-sort one page and imply the whole result was sorted.
- Rows, total, and aggregate counts must use the same domain filter builder and tenant context. Clamp an out-of-range page and canonicalize its URL.

## Cards vs horizontal tables

- Task-oriented records with a single primary destination use semantic mobile cards/list items and a named primary link.
- Comparison-heavy tables use a focusable, labelled horizontal-scroll region; never hide the only data surface below a breakpoint.
- Desktop and mobile representations must point to the same domain destination and avoid nested interactive elements.

## Status summary

- Use `StatusFilterChips` only when counts cover the complete filtered scope and the chip is actionable.
- Never derive status-chip counts from the active page.
- Raw domain status remains visible in every row and remains available as a detail filter when workflow groups are shown.
- If full-scope counts are unavailable, retain a labelled dropdown or the established summary instead of fabricating chips.

## URL canonical contract

- Every route owns an allowlist. Validate page/pageSize/sort/direction and domain filters before the query.
- Omit defaults, reject unknown owned params, and reset page to 1 after search/filter/sort/page-size changes.
- Page navigation preserves all other state. Reload, back, and forward must reproduce the same scope.
- Date ranges must be complete and valid before reaching Prisma; use the route business timezone.

## Capability pattern

- Separate read, cross-portal link, and create/mutation capabilities.
- Render capabilities from fresh server permission state and use the same decision resolver as the throwing mutation guard.
- Expected denial is fail-closed; operational permission/DB failure is an error, not `false` or an empty result.
- Every mutation reauthorizes at execution time; a hidden CTA is not authorization.

## Honest states

- Distinguish loading, no dataset, no filtered result, authorization denial, operational query error, and auxiliary-service degradation.
- Query failure must never become `[]` or an empty dashboard.
- Auxiliary payment/remittance failure may leave the main register usable, but disables the dependent CTA with an explanation and safe retry where applicable.
- Missing configuration is different from service failure, and no eligible records is different from a failed eligibility query.

## Shared primitives

- `PageHeader`: responsive title/description/actions.
- `ListToolbar`: domain-free layout slots for search, filters, and actions.
- `ActiveFilterChips`: presentational removable filters.
- `StatusFilterChips`: accessible single-select counts.
- `ListResultSummary`: range/total/scope hint.
- `DataTable` / `DataTablePagination`: backward-compatible client and opt-in controlled server contracts.

Do not create a route-aware mega shell, global table CSS override, or shared component that imports domain enums/actions/router.
