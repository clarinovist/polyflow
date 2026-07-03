const fs = require('fs');
const path = require('path');

const replacements = {
  // LIB
  "'@/lib/prisma'": "'@/lib/core/prisma'",
  "\"@/lib/prisma\"": "\"@/lib/core/prisma\"",
  "'@/lib/tenant'": "'@/lib/core/tenant'",
  "\"@/lib/tenant\"": "\"@/lib/core/tenant\"",
  "'@/lib/csv-parser'": "'@/lib/utils/csv-parser'",
  "\"@/lib/csv-parser\"": "\"@/lib/utils/csv-parser\"",
  "'@/lib/journal-csv-parser'": "'@/lib/utils/journal-csv-parser'",
  "\"@/lib/journal-csv-parser\"": "\"@/lib/utils/journal-csv-parser\"",
  "'@/lib/stock-csv-parser'": "'@/lib/utils/stock-csv-parser'",
  "\"@/lib/stock-csv-parser\"": "\"@/lib/utils/stock-csv-parser\"",
  "'@/lib/import-validator'": "'@/lib/utils/import-validator'",
  "\"@/lib/import-validator\"": "\"@/lib/utils/import-validator\"",
  "'@/lib/stock-import-validator'": "'@/lib/utils/stock-import-validator'",
  "\"@/lib/stock-import-validator\"": "\"@/lib/utils/stock-import-validator\"",
  "'@/lib/sanitize'": "'@/lib/utils/sanitize'",
  "\"@/lib/sanitize\"": "\"@/lib/utils/sanitize\"",
  "'@/lib/sequence'": "'@/lib/utils/sequence'",
  "\"@/lib/sequence\"": "\"@/lib/utils/sequence\"",
  "'@/lib/utils'": "'@/lib/utils/utils'",
  "\"@/lib/utils\"": "\"@/lib/utils/utils\"",
  "'@/lib/production-utils'": "'@/lib/utils/production-utils'",
  "\"@/lib/production-utils\"": "\"@/lib/utils/production-utils\"",
  "'@/lib/result'": "'@/lib/utils/result'",
  "\"@/lib/result\"": "\"@/lib/utils/result\"",
  "'@/lib/error-handler'": "'@/lib/errors/error-handler'",
  "\"@/lib/error-handler\"": "\"@/lib/errors/error-handler\"",
  "'@/lib/error-map'": "'@/lib/errors/error-map'",
  "\"@/lib/error-map\"": "\"@/lib/errors/error-map\"",
  "'@/lib/errors'": "'@/lib/errors/errors'",
  "\"@/lib/errors\"": "\"@/lib/errors/errors\"",
  "'@/lib/logger'": "'@/lib/config/logger'",
  "\"@/lib/logger\"": "\"@/lib/config/logger\"",
  "'@/lib/sentry'": "'@/lib/config/sentry'",
  "\"@/lib/sentry\"": "\"@/lib/config/sentry\"",
  "'@/lib/external-api-helper'": "'@/lib/api/external-api-helper'",
  "\"@/lib/external-api-helper\"": "\"@/lib/api/external-api-helper\"",
  "'@/lib/rate-limit'": "'@/lib/api/rate-limit'",
  "\"@/lib/rate-limit\"": "\"@/lib/api/rate-limit\"",
  "'@/lib/retry'": "'@/lib/api/retry'",
  "\"@/lib/retry\"": "\"@/lib/api/retry\"",
  "'@/lib/audit'": "'@/lib/tools/audit'",
  "\"@/lib/audit\"": "\"@/lib/tools/audit\"",
  "'@/lib/auth-checks'": "'@/lib/tools/auth-checks'",
  "\"@/lib/auth-checks\"": "\"@/lib/tools/auth-checks\"",
  "'@/lib/fireworks'": "'@/lib/tools/fireworks'",
  "\"@/lib/fireworks\"": "\"@/lib/tools/fireworks\"",
  "'@/lib/design-tokens'": "'@/lib/ui/design-tokens'",
  "\"@/lib/design-tokens\"": "\"@/lib/ui/design-tokens\"",

  // SERVICES
  "'@/services/accounting-service'": "'@/services/accounting/accounting-service'",
  "\"@/services/accounting-service\"": "\"@/services/accounting/accounting-service\"",
  "'@/services/costing-service'": "'@/services/accounting/costing-service'",
  "\"@/services/costing-service\"": "\"@/services/accounting/costing-service\"",
  "'@/services/invoice-service'": "'@/services/finance/invoice-service'",
  "\"@/services/invoice-service\"": "\"@/services/finance/invoice-service\"",
  "'@/services/abc-analysis-service'": "'@/services/inventory/abc-analysis-service'",
  "\"@/services/abc-analysis-service\"": "\"@/services/inventory/abc-analysis-service\"",
  "'@/services/inventory-service'": "'@/services/inventory/inventory-service'",
  "\"@/services/inventory-service\"": "\"@/services/inventory/inventory-service\"",
  "'@/services/stock-aging-service'": "'@/services/inventory/stock-aging-service'",
  "\"@/services/stock-aging-service\"": "\"@/services/inventory/stock-aging-service\"",
  "'@/services/mrp-service'": "'@/services/production/mrp-service'",
  "\"@/services/mrp-service\"": "\"@/services/production/mrp-service\"",
  "'@/services/production-service'": "'@/services/production/production-service'",
  "\"@/services/production-service\"": "\"@/services/production/production-service\"",
  "'@/services/purchase-service'": "'@/services/purchasing/purchase-service'",
  "\"@/services/purchase-service\"": "\"@/services/purchasing/purchase-service\"",
  "'@/services/quotation-service'": "'@/services/sales/quotation-service'",
  "\"@/services/quotation-service\"": "\"@/services/sales/quotation-service\"",
  "'@/services/sales-service'": "'@/services/sales/sales-service'",
  "\"@/services/sales-service\"": "\"@/services/sales/sales-service\"",
  "'@/services/analytics-service'": "'@/services/analytics/analytics-service'",
  "\"@/services/analytics-service\"": "\"@/services/analytics/analytics-service\"",
  "'@/services/api-key-service'": "'@/services/auth/api-key-service'",
  "\"@/services/api-key-service\"": "\"@/services/auth/api-key-service\"",
  "'@/services/notification-service'": "'@/services/core/notification-service'",
  "\"@/services/notification-service\"": "\"@/services/core/notification-service\"",

  // ACTIONS
  "'@/actions/admin-actions'": "'@/actions/admin/admin-actions'",
  "\"@/actions/admin-actions\"": "\"@/actions/admin/admin-actions\"",
  "'@/actions/audit-log'": "'@/actions/admin/audit-log'",
  "\"@/actions/audit-log\"": "\"@/actions/admin/audit-log\"",
  "'@/actions/permissions'": "'@/actions/admin/permissions'",
  "\"@/actions/permissions\"": "\"@/actions/admin/permissions\"",
  "'@/actions/roles'": "'@/actions/admin/roles'",
  "\"@/actions/roles\"": "\"@/actions/admin/roles\"",
  "'@/actions/users'": "'@/actions/admin/users'",
  "\"@/actions/users\"": "\"@/actions/admin/users\"",
  "'@/actions/employees'": "'@/actions/admin/employees'",
  "\"@/actions/employees\"": "\"@/actions/admin/employees\"",
  "'@/actions/work-shifts'": "'@/actions/admin/work-shifts'",
  "\"@/actions/work-shifts\"": "\"@/actions/admin/work-shifts\"",

  "'@/actions/auth.actions'": "'@/actions/auth/auth.actions'",
  "\"@/actions/auth.actions\"": "\"@/actions/auth/auth.actions\"",

  "'@/actions/dashboard'": "'@/actions/dashboard/dashboard'",
  "\"@/actions/dashboard\"": "\"@/actions/dashboard/dashboard\"",
  "'@/actions/finance-dashboard'": "'@/actions/dashboard/finance-dashboard'",
  "\"@/actions/finance-dashboard\"": "\"@/actions/dashboard/finance-dashboard\"",
  "'@/actions/planning-dashboard'": "'@/actions/dashboard/planning-dashboard'",
  "\"@/actions/planning-dashboard\"": "\"@/actions/dashboard/planning-dashboard\"",
  "'@/actions/production-dashboard'": "'@/actions/dashboard/production-dashboard'",
  "\"@/actions/production-dashboard\"": "\"@/actions/dashboard/production-dashboard\"",
  "'@/actions/sales-dashboard'": "'@/actions/dashboard/sales-dashboard'",
  "\"@/actions/sales-dashboard\"": "\"@/actions/dashboard/sales-dashboard\"",
  "'@/actions/warehouse-dashboard'": "'@/actions/dashboard/warehouse-dashboard'",
  "\"@/actions/warehouse-dashboard\"": "\"@/actions/dashboard/warehouse-dashboard\"",

  "'@/actions/accounting'": "'@/actions/finance/accounting'",
  "\"@/actions/accounting\"": "\"@/actions/finance/accounting\"",
  "'@/actions/cost-history'": "'@/actions/finance/cost-history'",
  "\"@/actions/cost-history\"": "\"@/actions/finance/cost-history\"",
  "'@/actions/finance'": "'@/actions/finance/finance'",
  "\"@/actions/finance\"": "\"@/actions/finance/finance\"",
  "'@/actions/invoice'": "'@/actions/finance/invoice'",
  "\"@/actions/invoice\"": "\"@/actions/finance/invoice\"",
  "'@/actions/invoices'": "'@/actions/finance/invoices'",
  "\"@/actions/invoices\"": "\"@/actions/finance/invoices\"",
  "'@/actions/journal'": "'@/actions/finance/journal'",
  "\"@/actions/journal\"": "\"@/actions/finance/journal\"",

  "'@/actions/sales'": "'@/actions/sales/sales'",
  "\"@/actions/sales\"": "\"@/actions/sales/sales\"",
  "'@/actions/sales-returns'": "'@/actions/sales/sales-returns'",
  "\"@/actions/sales-returns\"": "\"@/actions/sales/sales-returns\"",
  "'@/actions/quotations'": "'@/actions/sales/quotations'",
  "\"@/actions/quotations\"": "\"@/actions/sales/quotations\"",
  "'@/actions/customer'": "'@/actions/sales/customer'",
  "\"@/actions/customer\"": "\"@/actions/sales/customer\"",

  "'@/actions/production'": "'@/actions/production/production'",
  "\"@/actions/production\"": "\"@/actions/production/production\"",
  "'@/actions/boms'": "'@/actions/production/boms'",
  "\"@/actions/boms\"": "\"@/actions/production/boms\"",
  "'@/actions/downtime'": "'@/actions/production/downtime'",
  "\"@/actions/downtime\"": "\"@/actions/production/downtime\"",
  "'@/actions/machines'": "'@/actions/production/machines'",
  "\"@/actions/machines\"": "\"@/actions/production/machines\"",

  "'@/actions/inventory'": "'@/actions/inventory/inventory'",
  "\"@/actions/inventory\"": "\"@/actions/inventory/inventory\"",
  "'@/actions/opname'": "'@/actions/inventory/opname'",
  "\"@/actions/opname\"": "\"@/actions/inventory/opname\"",
  "'@/actions/stock-import'": "'@/actions/inventory/stock-import'",
  "\"@/actions/stock-import\"": "\"@/actions/inventory/stock-import\"",
  "'@/actions/locations'": "'@/actions/inventory/locations'",
  "\"@/actions/locations\"": "\"@/actions/inventory/locations\"",
  "'@/actions/deliveries'": "'@/actions/inventory/deliveries'",
  "\"@/actions/deliveries\"": "\"@/actions/inventory/deliveries\"",

  "'@/actions/purchasing'": "'@/actions/purchasing/purchasing'",
  "\"@/actions/purchasing\"": "\"@/actions/purchasing/purchasing\"",
  "'@/actions/purchasing-analytics'": "'@/actions/purchasing/purchasing-analytics'",
  "\"@/actions/purchasing-analytics\"": "\"@/actions/purchasing/purchasing-analytics\"",
  "'@/actions/purchase-returns'": "'@/actions/purchasing/purchase-returns'",
  "\"@/actions/purchase-returns\"": "\"@/actions/purchasing/purchase-returns\"",
  "'@/actions/supplier'": "'@/actions/purchasing/supplier'",
  "\"@/actions/supplier\"": "\"@/actions/purchasing/supplier\"",
  "'@/actions/supplier-product'": "'@/actions/purchasing/supplier-product'",
  "\"@/actions/supplier-product\"": "\"@/actions/purchasing/supplier-product\"",

  "'@/actions/analytics'": "'@/actions/core/analytics'",
  "\"@/actions/analytics\"": "\"@/actions/core/analytics\"",
  "'@/actions/analytics-assistant'": "'@/actions/core/analytics-assistant'",
  "\"@/actions/analytics-assistant\"": "\"@/actions/core/analytics-assistant\"",
  "'@/actions/import'": "'@/actions/core/import'",
  "\"@/actions/import\"": "\"@/actions/core/import\"",
  "'@/actions/notifications'": "'@/actions/core/notifications'",
  "\"@/actions/notifications\"": "\"@/actions/core/notifications\"",
  "'@/actions/transaction-wizard'": "'@/actions/core/transaction-wizard'",
  "\"@/actions/transaction-wizard\"": "\"@/actions/core/transaction-wizard\""
};

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(path.join(__dirname, '../src'));
files.push(...walk(path.join(__dirname, '../tests')));

let changedCount = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;
  
  for (const [oldPath, newPath] of Object.entries(replacements)) {
    // Escape string for regex, and append optional suffix (e.g. \', \")
    // A simple global replace works better for simple literal matches
    newContent = newContent.split(oldPath).join(newPath);
  }
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    changedCount++;
  }
}

console.log(`Updated imports in ${changedCount} files.`);
