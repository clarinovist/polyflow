import { AccountType, ExpenseClaimStatus } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { EXPENSE_CLAIM_CATEGORIES } from '@/lib/sales/expense-claim';
import type {
    ClaimAccountDefaults,
    ClaimAccountOption,
    ClaimPaymentAccounts,
} from '@/lib/sales/expense-claim-payment-ui';

const ACCOUNT_SELECT = { id: true, code: true, name: true } as const;
const BY_CODE = { code: 'asc' } as const;
/** Postable accounts only: active and without child accounts. */
const ACTIVE_LEAF = { isActive: true, children: { none: {} } } as const;
const NEWEST_PAID_FIRST = [{ paidAt: 'desc' }, { id: 'desc' }] as const;
const PAID_ACCOUNT_SELECT = {
    expenseAccountId: true,
    paymentAccountId: true,
} as const;

type Category = (typeof EXPENSE_CLAIM_CATEGORIES)[number];
type PaidAccounts = {
    expenseAccountId: string | null;
    paymentAccountId: string | null;
} | null;

interface PaidHistory {
    byCategory: ReadonlyArray<readonly [Category, PaidAccounts]>;
    latest: PaidAccounts;
}

/** The accounts of the newest PAID claim, optionally limited to one category. */
function newestPaidAccounts(category?: Category): Promise<PaidAccounts> {
    return prisma.expenseClaim.findFirst({
        where: {
            status: ExpenseClaimStatus.PAID,
            ...(category ? { category } : {}),
        },
        orderBy: [...NEWEST_PAID_FIRST],
        select: PAID_ACCOUNT_SELECT,
    });
}

/** One small lookup per category plus one overall (7 total), all in parallel. */
async function loadPaidHistory(): Promise<PaidHistory> {
    const [latest, ...perCategory] = await Promise.all([
        newestPaidAccounts(),
        ...EXPENSE_CLAIM_CATEGORIES.map((category) =>
            newestPaidAccounts(category),
        ),
    ]);
    return {
        latest,
        byCategory: EXPENSE_CLAIM_CATEGORIES.map(
            (category, index) => [category, perCategory[index]] as const,
        ),
    };
}

function hasAccount(
    accounts: ClaimAccountOption[],
    id: string | null | undefined,
): id is string {
    return !!id && accounts.some((account) => account.id === id);
}

/**
 * Defaults come from the newest PAID claim only; one whose account is no longer
 * offered (closed, turned into a parent, retyped) yields no default instead of
 * falling back to an older claim.
 */
function resolveDefaults(
    history: PaidHistory,
    expenseAccounts: ClaimAccountOption[],
    paymentAccounts: ClaimAccountOption[],
): ClaimAccountDefaults {
    const expenseByCategory: ClaimAccountDefaults['expenseByCategory'] = {};
    for (const [category, paid] of history.byCategory) {
        const id = paid?.expenseAccountId;
        if (hasAccount(expenseAccounts, id)) expenseByCategory[category] = id;
    }
    const sourceId = history.latest?.paymentAccountId;
    return {
        expenseByCategory,
        paymentAccountId: hasAccount(paymentAccounts, sourceId)
            ? sourceId
            : null,
    };
}

/**
 * Accounts Finance may pick when paying a claim. Mirrors the rules enforced in
 * `payClaim`: expense side is an active leaf EXPENSE account, source side an
 * active leaf ASSET account flagged as cash/bank. The server re-checks on pay.
 * Also returns suggested defaults taken from past paid claims.
 */
export async function listPayableClaimAccounts(): Promise<ClaimPaymentAccounts> {
    const [expenseAccounts, paymentAccounts, history] = await Promise.all([
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
        loadPaidHistory(),
    ]);
    return {
        expenseAccounts,
        paymentAccounts,
        defaults: resolveDefaults(history, expenseAccounts, paymentAccounts),
    };
}
