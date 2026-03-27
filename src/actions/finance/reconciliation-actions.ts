'use server';

import { withTenant } from "@/lib/core/tenant";
import { ReconciliationService, BankStatementRow } from '@/services/finance/reconciliation-service';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';

export const autoMatchReconciliation = withTenant(
    async function autoMatchReconciliation(accountId: string, startDate: Date, endDate: Date, statements: BankStatementRow[]) {
        return safeAction(async () => {
            await requireAuth();
            const results = await ReconciliationService.autoMatch(accountId, startDate, endDate, statements);
            return serializeData(results);
        });
    }
);
