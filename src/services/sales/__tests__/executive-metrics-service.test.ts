import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesOrderStatus } from '@prisma/client';

const count = vi.hoisted(() => vi.fn());
vi.mock('@/lib/core/prisma', () => ({
    prisma: { salesOrder: { count } },
}));

import { getExecutiveSalesMetrics } from '../executive-metrics-service';

describe('getExecutiveSalesMetrics', () => {
    beforeEach(() => vi.clearAllMocks());

    it('counts only active order-phase statuses inside the WIB month', async () => {
        count.mockResolvedValue(7);

        await expect(
            getExecutiveSalesMetrics(new Date('2026-05-31T12:00:00.000Z')),
        ).resolves.toEqual({ activeOrders: 7 });
        expect(count).toHaveBeenCalledWith({
            where: {
                orderDate: {
                    gte: new Date('2026-04-30T17:00:00.000Z'),
                    lte: new Date('2026-05-31T16:59:59.999Z'),
                },
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
    });
});
