export const PERFORMANCE_P95_WARN_MS = 800;
export const PERFORMANCE_P95_CRITICAL_MS = 2000;

// Route keys for other PerformanceMetric writers (see production.ts for the
// original SPK list route). Extend when another route gets instrumented.
export const SALES_ORDERS_LIST_ROUTE = 'sales-orders-list';
export const PURCHASE_ORDERS_LIST_ROUTE = 'purchase-orders-list';
export const DELIVERY_ORDERS_LIST_ROUTE = 'delivery-orders-list';
export const SALES_INVOICES_LIST_ROUTE = 'sales-invoices-list';

// Finance reports. These are the heavy read paths of the Finance module and
// were previously the only major surface with no timing data at all — the gap
// that made a 2026-09-03 audit reason about report cost from row counts alone.
export const GENERAL_LEDGER_SUMMARY_ROUTE = 'general-ledger-summary';
export const BALANCE_SHEET_ROUTE = 'balance-sheet';
export const INCOME_STATEMENT_ROUTE = 'income-statement';
export const TRIAL_BALANCE_ROUTE = 'trial-balance';
