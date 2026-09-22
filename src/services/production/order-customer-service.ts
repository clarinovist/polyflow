import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';

export const orderCustomersSchema = z.object({
    orderId: z.string().trim().min(1),
    customerIds: z.array(z.string().trim().min(1)).max(100),
});

export async function validateOrderCustomers(tx: Prisma.TransactionClient, ids: string[]) {
    const customerIds = [...new Set(ids)];
    if (customerIds.length) {
        const count = await tx.customer.count({ where: { id: { in: customerIds } } });
        if (count !== customerIds.length) {
            throw new BusinessRuleError('Customer tidak ditemukan dalam tenant ini. Muat ulang pilihan customer.');
        }
    }
    return customerIds;
}

export async function updateOrderCustomersInTransaction(
    tx: Prisma.TransactionClient,
    input: z.infer<typeof orderCustomersSchema>,
    userId: string,
) {
    const { orderId, customerIds: requestedIds } = orderCustomersSchema.parse(input);
    // Locks the order against concurrent metadata edits and status transitions.
    const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT "id", "status"::text FROM "ProductionOrder" WHERE "id" = ${orderId} FOR UPDATE
    `;
    const order = rows[0];
    if (!order) throw new NotFoundError('SPK', orderId);
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
        throw new BusinessRuleError('Customer tujuan tidak bisa diubah pada SPK selesai atau dibatalkan.');
    }
    const customerIds = await validateOrderCustomers(tx, requestedIds);
    const before = await tx.productionOrderCustomer.findMany({ where: { productionOrderId: orderId } });
    await tx.productionOrderCustomer.deleteMany({ where: { productionOrderId: orderId } });
    if (customerIds.length) {
        await tx.productionOrderCustomer.createMany({
            data: customerIds.map((customerId) => ({ productionOrderId: orderId, customerId })),
        });
    }
    await logActivity({
        userId, action: 'UPDATE_ORDER_CUSTOMERS', entityType: 'ProductionOrder', entityId: orderId,
        changes: { before: before.map((row) => row.customerId), after: customerIds }, tx,
    });
}

export async function updateOrderCustomers(input: z.infer<typeof orderCustomersSchema>, userId: string) {
    const db = getTenantDbFromContext() ?? prisma;
    return db.$transaction((tx) => updateOrderCustomersInTransaction(tx, input, userId));
}
