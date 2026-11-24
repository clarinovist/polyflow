import { AccountType } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import type { ClaimPaymentAccounts } from '@/lib/sales/expense-claim-payment-ui';

const ACCOUNT_SELECT = { id: true, code: true, name: true } as const;
const BY_CODE = { code: 'asc' } as const;
/** Postable accounts only: active and without child accounts. */
const ACTIVE_LEAF = { isActive: true, children: { none: {} } } as const;

/**
 * Accounts Finance may pick when paying a claim. Mirrors the rules enforced in
 * `payClaim`: expense side is an active leaf EXPENSE account, source side an
 * active leaf ASSET account flagged as cash/bank. The server re-checks on pay.
 */
export async function listPayableClaimAccounts(): Promise<ClaimPaymentAccounts> {
    const [expenseAccounts, paymentAccounts] = await Promise.all([
        prisma.account.findMany({
            where: { ...ACTIVE_LEAF, type: AccountType.EXPENSE },
            select: ACCOUNT_SELECT,
            orderBy: BY_CODE,
        }),
        prisma.account.findMany({
            where: {
                ...ACTIVE_LEAF,
                type: AccountType.ASSET,
                isCashAccount: true,
            },
            select: ACCOUNT_SELECT,
            orderBy: BY_CODE,
        }),
    ]);
    return { expenseAccounts, paymentAccounts };
}
