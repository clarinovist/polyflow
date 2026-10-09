import { prisma } from '@/lib/core/prisma';
import { SalesOrderStatus } from '@prisma/client';
import { getWibMonthBounds, toBusinessDateString } from '@/lib/utils/timezone';

export type ExecutiveSalesMetrics = {
    activeOrders: number;
};

export async function getExecutiveSalesMetrics(
    now: Date = new Date(),
): Promise<ExecutiveSalesMetrics> {
    const [year, month] = toBusinessDateString(now).split('-').map(Number);
    const { start, end } = getWibMonthBounds(year, month);
    const activeOrders = await prisma.salesOrder.count({
        where: {
            orderDate: { gte: start, lte: end },
            status: {
                in: [
                    SalesOrderStatus.CONFIRMED,
                    SalesOrderStatus.IN_PRODUCTION,
                    SalesOrderStatus.READY_TO_SHIP,
                    SalesOrderStatus.SHIPPED,
                ],
            },
        },
    });

    return { activeOrders };
}
