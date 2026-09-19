import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { z } from 'zod';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';

const closeInput = z.object({
    id: z.string().trim().min(1),
    reason: z.string().trim().min(1, 'Alasan penutupan wajib diisi.').max(1000),
});

/** Close the unfulfilled remainder, never manufacture a receipt or resync a bill. */
export async function closeOrder(id: string, reason: string, userId: string) {
    const input = closeInput.parse({ id, reason });
    const db = getTenantDbFromContext();
    if (!db) throw new BusinessRuleError('Konteks tenant diperlukan untuk menutup PO.', undefined, 'TENANT_REQUIRED');
    return db.$transaction(
        async (tx) => {
            // Receipts, edits, reversal and legacy discrepancy closure use the same lock.
            await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${input.id} FOR UPDATE`;
            const po = await tx.purchaseOrder.findUnique({
                where: { id: input.id },
                include: { items: true },
            });
            if (!po) throw new NotFoundError('Purchase Order', input.id);
            if (po.status !== PurchaseOrderStatus.PARTIAL_RECEIVED) {
                throw new BusinessRuleError(
                    'Hanya PO Diterima Sebagian yang dapat ditutup.',
                    undefined,
                    'INVALID_PO_STATUS',
                );
            }
            const remainingItems = po.items.flatMap((item) => {
                const remaining = item.quantity.minus(item.receivedQty);
                return remaining.gt(0)
                    ? [
                          {
                              id: item.id,
                              ordered: item.quantity.toString(),
                              received: item.receivedQty.toString(),
                              remaining: remaining.toString(),
                          },
                      ]
                    : [];
            });
            if (
                !remainingItems.length ||
                !po.items.some((item) => item.receivedQty.gt(0))
            ) {
                throw new BusinessRuleError(
                    'PO harus memiliki penerimaan dan sisa yang belum diterima.',
                    undefined,
                    'NO_PO_REMAINDER',
                );
            }
            // Manual atomic audit below is authoritative. Raw update avoids the generic
            // status extension writing a second audit outside this transaction on rollback.
            await tx.$executeRaw`UPDATE "PurchaseOrder" SET status = 'CLOSED', "updatedAt" = NOW() WHERE id = ${input.id}`;
            await logActivity({
                userId,
                action: 'CLOSE_PURCHASE_ORDER',
                entityType: 'PurchaseOrder',
                entityId: input.id,
                details: input.reason,
                fromStatus: po.status,
                toStatus: PurchaseOrderStatus.CLOSED,
                changes: { remainingItems },
                tx,
            });
            return { id: input.id, status: PurchaseOrderStatus.CLOSED };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
}
