import { Prisma, SalesReturnStatus } from '@prisma/client';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';

/** Serialize lifecycle transitions on the same return row as receive/post credit. */
export async function transitionSalesReturn(
    id: string,
    userId: string,
    status: SalesReturnStatus,
) {
    const db = getTenantDbFromContext();
    if (!db)
        throw new BusinessRuleError('Konteks tenant wajib untuk status retur.');
    return db.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$queryRaw`SELECT id FROM "SalesReturn" WHERE id = ${id} FOR UPDATE`;
        const existing = await tx.salesReturn.findUnique({ where: { id } });
        if (!existing) throw new NotFoundError('Sales Return', id);
        const allowed =
            status === 'CONFIRMED'
                ? ['DRAFT']
                : status === 'COMPLETED'
                  ? ['RECEIVED']
                  : status === 'CANCELLED'
                    ? ['DRAFT', 'CONFIRMED']
                    : [];
        if (!allowed.includes(existing.status))
            throw new BusinessRuleError(
                status === 'CONFIRMED'
                    ? 'Only DRAFT returns can be confirmed'
                    : status === 'COMPLETED'
                      ? 'Only RECEIVED returns can be completed'
                      : 'Cannot cancel returns that are already processing or completed',
                { returnId: id, status: existing.status },
                'INVALID_RETURN_STATUS',
            );
        const updated = await tx.salesReturn.update({
            where: { id },
            data: { status },
        });
        await logActivity({
            userId,
            action:
                status === 'CONFIRMED'
                    ? 'CONFIRM_SALES_RETURN'
                    : status === 'COMPLETED'
                      ? 'COMPLETE_SALES_RETURN'
                      : 'CANCEL_SALES_RETURN',
            entityType: 'SalesReturn',
            entityId: id,
            fromStatus: existing.status,
            toStatus: status,
            details: `${existing.returnNumber}: ${existing.status} → ${status}`,
            tx,
        });
        return updated;
    });
}
