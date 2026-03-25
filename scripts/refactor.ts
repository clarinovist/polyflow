import { Project } from "ts-morph";
import * as path from "path";

async function main() {
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
  });

  const actionsDir = project.getDirectory("src/actions");
  const servicesDir = project.getDirectory("src/services");
  const libDir = project.getDirectory("src/lib");

  if (!actionsDir || !servicesDir || !libDir) {
    console.error("Could not find required directories.");
    return;
  }

  const moves = [
    // === ACTIONS ===
    // admin/
    { from: "src/actions/admin-actions.ts", to: "src/actions/admin/" },
    { from: "src/actions/audit-log.ts", to: "src/actions/admin/" },
    { from: "src/actions/permissions.ts", to: "src/actions/admin/" },
    { from: "src/actions/roles.ts", to: "src/actions/admin/" },
    { from: "src/actions/users.ts", to: "src/actions/admin/" },
    { from: "src/actions/employees.ts", to: "src/actions/admin/" },
    { from: "src/actions/work-shifts.ts", to: "src/actions/admin/" },
    
    // auth/
    { from: "src/actions/auth.actions.ts", to: "src/actions/auth/" },

    // dashboard/
    { from: "src/actions/dashboard.ts", to: "src/actions/dashboard/" },
    { from: "src/actions/finance-dashboard.ts", to: "src/actions/dashboard/" },
    { from: "src/actions/planning-dashboard.ts", to: "src/actions/dashboard/" },
    { from: "src/actions/production-dashboard.ts", to: "src/actions/dashboard/" },
    { from: "src/actions/sales-dashboard.ts", to: "src/actions/dashboard/" },
    { from: "src/actions/warehouse-dashboard.ts", to: "src/actions/dashboard/" },

    // finance/
    { from: "src/actions/accounting.ts", to: "src/actions/finance/" },
    { from: "src/actions/cost-history.ts", to: "src/actions/finance/" },
    { from: "src/actions/finance.ts", to: "src/actions/finance/" },
    { from: "src/actions/invoice.ts", to: "src/actions/finance/" },
    { from: "src/actions/invoices.ts", to: "src/actions/finance/" },
    { from: "src/actions/journal.ts", to: "src/actions/finance/" },

    // sales/
    { from: "src/actions/sales.ts", to: "src/actions/sales/" },
    { from: "src/actions/sales-returns.ts", to: "src/actions/sales/" },
    { from: "src/actions/quotations.ts", to: "src/actions/sales/" },
    { from: "src/actions/customer.ts", to: "src/actions/sales/" },

    // production/
    { from: "src/actions/production.ts", to: "src/actions/production/" },
    { from: "src/actions/boms.ts", to: "src/actions/production/" },
    { from: "src/actions/downtime.ts", to: "src/actions/production/" },
    { from: "src/actions/machines.ts", to: "src/actions/production/" },

    // inventory/
    { from: "src/actions/inventory.ts", to: "src/actions/inventory/" },
    { from: "src/actions/opname.ts", to: "src/actions/inventory/" },
    { from: "src/actions/stock-import.ts", to: "src/actions/inventory/" },
    { from: "src/actions/locations.ts", to: "src/actions/inventory/" },
    { from: "src/actions/deliveries.ts", to: "src/actions/inventory/" },

    // purchasing/
    { from: "src/actions/purchasing.ts", to: "src/actions/purchasing/" },
    { from: "src/actions/purchasing-analytics.ts", to: "src/actions/purchasing/" },
    { from: "src/actions/purchase-returns.ts", to: "src/actions/purchasing/" },
    { from: "src/actions/supplier.ts", to: "src/actions/purchasing/" },
    { from: "src/actions/supplier-product.ts", to: "src/actions/purchasing/" },

    // core/
    { from: "src/actions/analytics.ts", to: "src/actions/core/" },
    { from: "src/actions/analytics-assistant.ts", to: "src/actions/core/" },
    { from: "src/actions/import.ts", to: "src/actions/core/" },
    { from: "src/actions/notifications.ts", to: "src/actions/core/" },
    { from: "src/actions/transaction-wizard.ts", to: "src/actions/core/" },

    // === SERVICES ===
    { from: "src/services/accounting-service.ts", to: "src/services/accounting/" },
    { from: "src/services/costing-service.ts", to: "src/services/accounting/" },
    { from: "src/services/invoice-service.ts", to: "src/services/finance/" },
    { from: "src/services/abc-analysis-service.ts", to: "src/services/inventory/" },
    { from: "src/services/inventory-service.ts", to: "src/services/inventory/" },
    { from: "src/services/stock-aging-service.ts", to: "src/services/inventory/" },
    { from: "src/services/mrp-service.ts", to: "src/services/production/" },
    { from: "src/services/production-service.ts", to: "src/services/production/" },
    { from: "src/services/purchase-service.ts", to: "src/services/purchasing/" },
    { from: "src/services/quotation-service.ts", to: "src/services/sales/" },
    { from: "src/services/sales-service.ts", to: "src/services/sales/" },
    { from: "src/services/analytics-service.ts", to: "src/services/analytics/" },
    { from: "src/services/api-key-service.ts", to: "src/services/auth/" },
    { from: "src/services/notification-service.ts", to: "src/services/core/" },

    // === LIB ===
    { from: "src/lib/prisma.ts", to: "src/lib/core/" },
    { from: "src/lib/tenant.ts", to: "src/lib/core/" },
    
    { from: "src/lib/csv-parser.ts", to: "src/lib/utils/" },
    { from: "src/lib/journal-csv-parser.ts", to: "src/lib/utils/" },
    { from: "src/lib/stock-csv-parser.ts", to: "src/lib/utils/" },
    { from: "src/lib/import-validator.ts", to: "src/lib/utils/" },
    { from: "src/lib/stock-import-validator.ts", to: "src/lib/utils/" },
    { from: "src/lib/sanitize.ts", to: "src/lib/utils/" },
    { from: "src/lib/sequence.ts", to: "src/lib/utils/" },
    { from: "src/lib/utils.ts", to: "src/lib/utils/" },
    { from: "src/lib/production-utils.ts", to: "src/lib/utils/" },
    { from: "src/lib/result.ts", to: "src/lib/utils/" },

    { from: "src/lib/error-handler.ts", to: "src/lib/errors/" },
    { from: "src/lib/error-map.ts", to: "src/lib/errors/" },
    { from: "src/lib/errors.ts", to: "src/lib/errors/" },

    { from: "src/lib/logger.ts", to: "src/lib/config/" },
    { from: "src/lib/sentry.ts", to: "src/lib/config/" },

    { from: "src/lib/external-api-helper.ts", to: "src/lib/api/" },
    { from: "src/lib/rate-limit.ts", to: "src/lib/api/" },
    { from: "src/lib/retry.ts", to: "src/lib/api/" },

    { from: "src/lib/audit.ts", to: "src/lib/tools/" },
    { from: "src/lib/auth-checks.ts", to: "src/lib/tools/" },
    { from: "src/lib/fireworks.ts", to: "src/lib/tools/" },

    { from: "src/lib/design-tokens.ts", to: "src/lib/ui/" },
  ];

  console.log(`Preparing to move ${moves.length} files...`);

  for (const move of moves) {
    const sourcePath = path.resolve(move.from);
    const destDir = path.resolve(move.to);
    const sourceFile = project.getSourceFile(sourcePath);

    if (sourceFile) {
      console.log(`Moving ${move.from} to ${move.to}...`);
      // check if destDir exists in project
      let targetDir = project.getDirectory(destDir);
      if (!targetDir) {
        targetDir = project.createDirectory(destDir);
      }
      sourceFile.moveToDirectory(targetDir);
    } else {
      console.warn(`Could not find source file: ${move.from}`);
    }
  }

  console.log("Saving changes...");
  await project.save();
  console.log("Refactoring complete!");
}

main().catch(console.error);
