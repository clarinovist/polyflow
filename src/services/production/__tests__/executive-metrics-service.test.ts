import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionStatus } from '@prisma/client';

const mocks = vi.hoisted(() => ({
    productionCount: vi.fn(),
    productionFind: vi.fn(),
    machineCount: vi.fn(),
    downtimeFind: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: {
            count: mocks.productionCount,
            findMany: mocks.productionFind,
        },
        machine: { count: mocks.machineCount },
        machineDowntime: { findMany: mocks.downtimeFind },
    },
}));

import { getExecutiveProductionMetrics } from '../executive-metrics-service';

describe('getExecutiveProductionMetrics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.productionCount
            .mockResolvedValueOnce(5)
            .mockResolvedValueOnce(2);
        mocks.productionFind
            .mockResolvedValueOnce([
                { status: ProductionStatus.COMPLETED },
                { status: ProductionStatus.IN_PROGRESS },
            ])
            .mockResolvedValueOnce([
                { machineId: 'machine-1' },
                { machineId: 'machine-2' },
            ])
            .mockResolvedValueOnce([
                { status: ProductionStatus.COMPLETED },
                { status: ProductionStatus.COMPLETED },
            ]);
        mocks.machineCount.mockResolvedValue(6);
        mocks.downtimeFind.mockResolvedValue([
            {
                startTime: new Date('2026-05-31T10:00:00.000Z'),
                endTime: new Date('2026-05-31T11:30:00.000Z'),
            },
        ]);
    });

    it('keeps document completion unit-safe and withholds mixed scrap totals', async () => {
        const now = new Date('2026-05-31T12:00:00.000Z');
        const result = await getExecutiveProductionMetrics(now);

        expect(result).toEqual({
            activeJobs: 5,
            delayedJobs: 2,
            completionRate: 50,
            downtimeHours: 1.5,
            runningMachines: 2,
            totalMachines: 6,
            trend: -50,
            totalScrap: null,
            scrapStatus: 'NOT_CONFIGURED',
        });
        expect(mocks.productionFind).toHaveBeenNthCalledWith(1, {
            where: {
                createdAt: {
                    gte: new Date('2026-04-30T17:00:00.000Z'),
                    lte: new Date('2026-05-31T16:59:59.999Z'),
                },
            },
            select: { status: true },
        });
        expect(mocks.productionFind).not.toHaveBeenCalledWith(
            expect.objectContaining({
                select: expect.objectContaining({ plannedQuantity: true }),
            }),
        );
    });
});
