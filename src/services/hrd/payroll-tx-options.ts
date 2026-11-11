import type { Prisma } from '@prisma/client';

/**
 * Optional hook run INSIDE the operation's transaction, after the data changes and
 * before commit. The caller (server action) uses it to write the audit log in the
 * same transaction; `facts` carries what the service knows (the service has no userId).
 * If it throws, the whole operation rolls back.
 */
export interface PayrollTxOptions {
    onCommit?: (
        tx: Prisma.TransactionClient,
        facts: Record<string, unknown>,
    ) => Promise<void>;
}

export async function runOnCommit(
    tx: Prisma.TransactionClient,
    options: PayrollTxOptions | undefined,
    facts: Record<string, unknown>,
): Promise<void> {
    if (options?.onCommit) await options.onCommit(tx, facts);
}
