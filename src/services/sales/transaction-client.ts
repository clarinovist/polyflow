import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError } from '@/lib/errors/errors';

/** Do not call interactive transactions through the ambient Prisma proxy: its
 * receiver can bind Prisma internals to the control DB rather than the tenant. */
export function salesTransactionClient() {
    const db = getTenantDbFromContext();
    if (!db)
        throw new BusinessRuleError(
            'Konteks tenant wajib untuk transaksi penjualan.',
        );
    return db;
}
