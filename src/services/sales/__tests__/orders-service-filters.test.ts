import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/core/prisma';
import { getOrders } from '../orders-service';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesOrder: {
            findMany: vi.fn().mockResolvedValue([]),
        },
    },
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

describe('orders-service filters', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('menerapkan filter customerId walau demandType customer juga dikirim', async () => {
        await getOrders({ customerId: 'customer-1', demandType: 'customer' });

        expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { customerId: 'customer-1' },
            }),
        );
    });

    it('tetap memfilter customerId not null saat demandType customer tanpa customerId spesifik', async () => {
        await getOrders({ demandType: 'customer' });

        expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { customerId: { not: null } },
            }),
        );
    });

    it('memfilter customerId null saat demandType legacy-internal', async () => {
        await getOrders({ demandType: 'legacy-internal' });

        expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { customerId: null },
            }),
        );
    });
});
