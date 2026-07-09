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
 * Map payment method (+ optional destination bank) to an AccountRole.
 * destinationBank is used for Check/Giro clearing allocation (BCA | MANDIRI).
 */
export function getPaymentAccountRole(
    method: string,
    destinationBank?: string | null,
): AccountRole {
    const normalized = method.toLowerCase().trim();
    const bank = (destinationBank || '').toUpperCase().trim();

    if (normalized === 'cash') {
        return 'petty-cash';
    }

    if (normalized === 'transfer mandiri' || bank === 'MANDIRI') {
        return 'bank-mandiri';
    }

    if (
        normalized === 'transfer bca' ||
        normalized === 'bank transfer' ||
        normalized === 'credit card' ||
        normalized === 'check' ||
        bank === 'BCA'
    ) {
        return 'bank-bca';
    }

    // Unknown method: prefer destination bank, else default BCA
    if (bank === 'MANDIRI') return 'bank-mandiri';
    return 'bank-bca';
}
