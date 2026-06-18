/**
 * Runtime account resolver for transaction types.
 * Server-side only — do NOT import in client components (prisma uses async_hooks).
 */
import { prisma } from '@/lib/core/prisma';
import type { TransactionTypeConfig } from '@/lib/config/transaction-types';

export async function resolveTransactionTypeAccounts(
    type: TransactionTypeConfig
): Promise<{ debitAccountId: string; creditAccountId: string }> {
    async function findAccountId(code: string): Promise<string> {
        const byCode = await prisma.account.findUnique({ where: { code } });
        if (byCode) return byCode.id;
        const byName = await prisma.account.findFirst({
            where: { name: { contains: type.label, mode: 'insensitive' } }
        });
        if (byName) return byName.id;
        throw new Error(`Cannot resolve account for code "${code}" (type: ${type.id})`);
    }

    return {
        debitAccountId: await findAccountId(type.debitAccountCode),
        creditAccountId: await findAccountId(type.creditAccountCode),
    };
}
