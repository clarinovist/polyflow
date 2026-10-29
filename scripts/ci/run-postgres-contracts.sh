#!/usr/bin/env bash
set -euo pipefail

if [[ "${CI:-}" != "true" ]]; then
  echo "PostgreSQL contract runner is CI-only." >&2
  exit 1
fi

for name in RETURN_CREDIT_TEST_DATABASE_URL CENTRAL_IDENTITY_TEST_ADMIN_URL TEST_DATABASE_URL; do
  if [[ -z "${!name:-}" ]]; then
    echo "Required disposable PostgreSQL URL is missing." >&2
    exit 1
  fi
done

node scripts/ci/setup-return-test-db.mjs
node scripts/ci/setup-central-identity-test-dbs.mjs

npx vitest run --maxWorkers=1 --no-file-parallelism \
  src/services/auth/__tests__/central-identity-postgres.test.ts \
  src/services/finance/__tests__/quick-sales-return-postgres.test.ts \
  src/services/finance/__tests__/return-credit-proposal-postgres.test.ts \
  src/services/finance/__tests__/sales-return-receipt-postgres.test.ts \
  src/services/finance/__tests__/manual-return-credit-postgres.test.ts \
  src/services/finance/__tests__/sales-return-credit-postgres.test.ts \
  src/services/finance/__tests__/invoice-price-adjustment-postgres.test.ts \
  src/services/finance/__tests__/return-credit-recovery-postgres.test.ts \
  src/services/finance/__tests__/invoice-status-settlement-postgres.test.ts \
  src/services/finance/__tests__/invoice-date-correction-postgres.test.ts \
  src/services/finance/__tests__/customer-credit-postgres.test.ts \
  src/services/inventory/__tests__/internal-usage-postgres.test.ts \
  src/services/production/__tests__/order-context-postgres.test.ts \
  src/lib/ops/__tests__/stale-shell-closure-postgres.test.ts \
  src/lib/ops/__tests__/order-end-date-backfill-postgres.test.ts \
  src/services/production/__tests__/material-order-postgres.test.ts \
  src/services/production/__tests__/packaging-postgres.test.ts \
  src/services/production/__tests__/scrap-void-postgres.test.ts \
  src/services/sales/__tests__/trip-distance-postgres.test.ts \
  src/actions/inventory/__tests__/deliveries-postgres.test.ts \
  src/actions/finance/__tests__/mobile-readiness-postgres.test.ts \
  src/actions/dashboard/__tests__/finance-dashboard-postgres.test.ts \
  src/actions/dashboard/__tests__/sales-dashboard-postgres.test.ts \
  src/services/sales/__tests__/mobile-sales-contract-postgres.test.ts \
  src/services/sales/__tests__/order-edit-postgres.test.ts \
  src/services/dashboard/__tests__/dashboard-hardening-postgres.test.ts \
  src/services/accounting/__tests__/closing-filter-postgres.test.ts \
  src/services/accounting/__tests__/production-wip-postgres.test.ts \
  src/services/inventory/__tests__/stock-quantity-rounding-postgres.test.ts \
  src/services/purchasing/__tests__/gr-reversal-consumed-guard-postgres.test.ts \
  src/lib/ops/__tests__/stock-ledger-rounding-alignment-postgres.test.ts \
  src/services/finance/__tests__/cogs-economic-diagnosis-postgres.test.ts \
  src/services/finance/__tests__/inventory-economic-diagnosis-postgres.test.ts \
  src/lib/bot/__tests__/help-guides-postgres.test.ts \
  src/lib/bot/__tests__/document-tools-postgres.test.ts \
  src/lib/core/__tests__/prisma-proxy-postgres.test.ts \
  src/lib/ops/__tests__/absorbed-scrap-normalization-postgres.test.ts \
  src/lib/ops/__tests__/operational-opening-attribution-postgres.test.ts
