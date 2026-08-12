import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/core/prisma';
import { getOrders } from '../orders-service';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesOrder: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        performanceMetric: {
            create: vi.fn().mockResolvedValue({}),
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

    it('records a performance metric sample without blocking the response', async () => {
        // Arrange — findMany already resolves to [] via mock default

        // Act
        await getOrders();

        // Assert
        expect(prisma.performanceMetric.create).toHaveBeenCalledTimes(1);
        const call = vi.mocked(prisma.performanceMetric.create).mock
            .calls[0][0] as { data: { route: string; durationMs: number } };
        expect(call.data.route).toBe('sales-orders-list');
        expect(call.data.durationMs).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(call.data.durationMs)).toBe(true);
    });

    it('does not fail the request when recording the metric sample rejects', async () => {
        // Arrange
        vi.mocked(prisma.performanceMetric.create).mockRejectedValueOnce(
            new Error('db unreachable'),
        );

        // Act
        const result = await getOrders();

        // Assert
        expect(result).toEqual([]);
    });
});
