import { prisma } from '@/lib/core/prisma';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';
import { readWarehouseTodayKPIs } from '@/services/inventory/warehouse-operational-reader';

/**
 * Canonical warehouse today KPIs.
 * Used by both desktop shift board and mobile home for consistency.
 *
 * - shippedToday: count DOs where stockCommittedAt falls within today WIB
 *   (DOs that were shipped today, regardless of later status changes).
 * - receivedToday: count GRs where receivedDate falls within today WIB.
 */
export async function getWarehouseTodayKPIs(): Promise<{
    shippedToday: number;
    receivedToday: number;
}> {
    const todayStr = toBusinessDateString(new Date());
    const { startOfDay, endOfDay } = getWibDayBounds(todayStr);

    const { deliveriesShipped, goodsReceipts } = await readWarehouseTodayKPIs(
        prisma,
        { startOfDay, endOfDay },
    );

    return {
        shippedToday: deliveriesShipped,
        receivedToday: goodsReceipts,
    };
}
