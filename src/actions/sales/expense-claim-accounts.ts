'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireFinanceMutation } from '@/lib/auth/finance-access';
import { safeAction } from '@/lib/errors/errors';
import { listPayableClaimAccounts } from '@/services/sales/expense-claim-account-queries';

// Every export here must be an async function: sync exports in 'use server' files fail only at `next build`.

/** Expense and cash/bank accounts for the Finance "Cairkan" dialog. */
export const listClaimPaymentAccounts = withTenant(
    async function listClaimPaymentAccounts() {
        return safeAction(async () => {
            await requireFinanceMutation();
            return listPayableClaimAccounts();
        });
    },
);
