/**
 * Runtime account resolver for transaction types.
 * Server-side only — do NOT import in client components (prisma uses async_hooks).
 *
 * Resolves by AccountRole (semantic name) instead of hardcoded codes.
 * Tenant-aware via resolveAccount() which uses the active tenant's PrismaClient.
 */
import type { TransactionTypeConfig } from '@/lib/config/transaction-types';
import { resolveAccount } from '@/services/accounting/account-resolver';

export async function resolveTransactionTypeAccounts(
    type: TransactionTypeConfig
): Promise<{ debitAccountId: string; creditAccountId: string }> {
    const debitAccount = await resolveAccount(type.debitAccountRole);
    const creditAccount = await resolveAccount(type.creditAccountRole);

    return {
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
    };
}
