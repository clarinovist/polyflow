import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';

const LOCKED_STATUSES: readonly string[] = ['CANCELLED', 'CLOSED', 'COMPLETED'];

export const SET_PACKAGING_MODE_ACTION = 'SET_PRODUCTION_ORDER_PACKAGING_MODE';

export interface SetPackagingModeInput {
    id: string;
    enabled: boolean;
    userId: string;
}

type LockedOrder = {
    id: string;
    status: string;
    actualPackagingEnabled: boolean;
    requestedOutputVariantId: string | null;
};

async function loadLockedOrder(
    tx: Prisma.TransactionClient,
    id: string,
): Promise<LockedOrder> {
    // Serializes against a kiosk logging the first output at the same moment.
    await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${id} FOR UPDATE`;
    const order = await tx.productionOrder.findUnique({
        where: { id },
        select: {
            id: true,
            status: true,
            actualPackagingEnabled: true,
            requestedOutputVariantId: true,
        },
    });
    if (!order) throw new NotFoundError('Production Order', id);
    return order;
}

async function assertModeCanChange(
    tx: Prisma.TransactionClient,
    order: LockedOrder,
) {
    if (LOCKED_STATUSES.includes(order.status)) {
        throw new BusinessRuleError(
            'Kemasan aktual tidak bisa diubah pada SPK yang sudah selesai atau dibatalkan.',
            { orderId: order.id, status: order.status },
            'INVALID_ORDER_STATUS',
        );
    }
    const executionCount = await tx.productionExecution.count({
        where: { productionOrderId: order.id },
    });
    if (executionCount > 0) {
        throw new BusinessRuleError(
            'Kemasan aktual tidak bisa diubah karena SPK ini sudah punya hasil produksi. Buat SPK baru bila perlu.',
            { orderId: order.id, executionCount },
            'PACKAGING_MODE_LOCKED',
        );
    }
}

function assertCanDisable(order: LockedOrder, enabled: boolean) {
    if (!enabled && order.requestedOutputVariantId) {
        throw new BusinessRuleError(
            'Kemasan aktual wajib aktif karena SPK ini memakai pemetaan produk kemasan.',
            { orderId: order.id },
            'PACKAGING_MODE_MAPPED',
        );
    }
}

/**
 * Turn "catat kemasan aktual" on/off for an order that has no output yet.
 * Idempotent: an unchanged value writes and audits nothing.
 */
export async function setOrderPackagingMode(
    input: SetPackagingModeInput,
): Promise<void> {
    const { id, enabled, userId } = input;
    await prisma.$transaction(async (tx) => {
        const order = await loadLockedOrder(tx, id);
        await assertModeCanChange(tx, order);
        assertCanDisable(order, enabled);
        if (order.actualPackagingEnabled === enabled) return;

        await tx.productionOrder.update({
            where: { id },
            data: { actualPackagingEnabled: enabled },
        });
        await logActivity({
            userId,
            action: SET_PACKAGING_MODE_ACTION,
            entityType: 'ProductionOrder',
            entityId: id,
            changes: {
                actualPackagingEnabled: {
                    from: order.actualPackagingEnabled,
                    to: enabled,
                },
            },
            tx,
        });
    });
}
