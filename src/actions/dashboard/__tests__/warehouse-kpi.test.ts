import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    reader: vi.fn(),
    prisma: {},
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/services/inventory/warehouse-operational-reader', () => ({
    readWarehouseTodayKPIs: mocks.reader,
}));

import { getWarehouseTodayKPIs } from '../warehouse-kpi';

describe('getWarehouseTodayKPIs', () => {
    beforeEach(() => vi.resetAllMocks());

    it('adapts the canonical Warehouse today reader without copying formulas', async () => {
        mocks.reader.mockResolvedValue({
            deliveriesShipped: 4,
            goodsReceipts: 6,
        });

        await expect(getWarehouseTodayKPIs()).resolves.toEqual({
            shippedToday: 4,
            receivedToday: 6,
        });
        expect(mocks.reader).toHaveBeenCalledWith(
            mocks.prisma,
            expect.objectContaining({
                startOfDay: expect.any(Date),
                endOfDay: expect.any(Date),
            }),
        );
    });
});
