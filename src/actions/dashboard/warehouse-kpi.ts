import { prisma } from '@/lib/core/prisma';
import {
    getWibDayBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';

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

    const [shippedToday, receivedToday] = await Promise.all([
        // Shipped today: stockCommittedAt within today WIB
        prisma.deliveryOrder.count({
            where: {
                stockCommittedAt: { gte: startOfDay, lte: endOfDay },
            },
        }),
        // Received today: GR receivedDate within today WIB
        prisma.goodsReceipt.count({
            where: {
                isMaklon: false,
                receivedDate: { gte: startOfDay, lte: endOfDay },
            },
        }),
    ]);

    return { shippedToday, receivedToday };
}
