import { prisma } from '@/lib/core/prisma';
import { NotFoundError } from '@/lib/errors/errors';
import {
    resolveAccount,
    AccountRole,
} from '@/services/accounting/account-resolver';
import { getPaymentBanksSetting } from '@/services/settings/app-settings-service';

/**
 * @deprecated Use getAccountByRole() instead for tenant compatibility.
 * Kept as fallback for any remaining callers.
 */
export async function getAccountByCode(code: string) {
    const account = await prisma.account.findUnique({ where: { code } });
    if (!account) throw new NotFoundError('Account', code);
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

/**
 * Resolve the GL cash/bank account a payment should post to.
 *
 * Tenant-defined banks beyond BCA/MANDIRI carry an explicit glAccountId
 * (set when the bank was added in Settings — see app-settings-service.ts)
 * and resolve directly to that account, bypassing the AccountRole system
 * entirely. BCA/MANDIRI/Cash/legacy methods are untouched — they keep
 * resolving via getPaymentAccountRole()+getAccountByRole() exactly as
 * before. This split ensures a new bank can never silently fall through to
 * the BCA account role (the pre-existing default in getPaymentAccountRole).
 */
export async function resolvePaymentBankAccount(
    method: string,
    destinationBank?: string | null,
) {
    const bankKey = (destinationBank || '').toUpperCase().trim();
    if (bankKey && bankKey !== 'BCA' && bankKey !== 'MANDIRI') {
        const banks = await getPaymentBanksSetting();
        const bank = banks.find((b) => b.key === bankKey);
        if (bank?.glAccountId) {
            const account = await prisma.account.findUnique({
                where: { id: bank.glAccountId },
            });
            if (account && account.isActive !== false) {
                return account;
            }
        }
    }

    return getAccountByRole(getPaymentAccountRole(method, destinationBank));
}
