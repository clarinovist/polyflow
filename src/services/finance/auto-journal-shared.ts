import { prisma } from '@/lib/core/prisma';
import { resolveAccount, AccountRole } from '@/services/accounting/account-resolver';

/**
 * @deprecated Use getAccountByRole() instead for tenant compatibility.
 * Kept as fallback for any remaining callers.
 */
export async function getAccountByCode(code: string) {
    const account = await prisma.account.findUnique({ where: { code } });
    if (!account) throw new Error(`Account code ${code} not found.`);
    return account;
}

/**
 * Resolve an account by semantic role. Tenant-aware — works across Kiyowo and Melindo.
 */
export async function getAccountByRole(role: AccountRole) {
    return resolveAccount(role);
}

/**
 * Map payment method string to an AccountRole.
 * Returns the bank/cash account role for the given payment method.
 */
export function getPaymentAccountRole(method: string): AccountRole {
    switch (method.toLowerCase()) {
        case 'cash':
            return 'petty-cash';
        case 'check':
        case 'bank transfer':
        case 'credit card':
        default:
            return 'bank-bca';
    }
}
