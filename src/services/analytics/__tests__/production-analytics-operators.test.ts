import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/core/prisma';
import { getProductionAnalytics } from '../production-analytics-service';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: { findMany: vi.fn() },
        scrapRecord: { findMany: vi.fn() },
        productVariant: { findMany: vi.fn() },
        qualityInspection: { findMany: vi.fn() },
        productionExecution: { findMany: vi.fn() },
    },
}));

const operator = { code: 'OP1', name: 'Mularno' };

const execution = (
    category: string | null,
    quantityProduced: number,
    scrapQuantity: number,
    productionOrderId: string,
) => ({
    machine: null,
    operator,
    productionOrderId,
    quantityProduced,
    scrapQuantity,
    scrapProngkolQty: 0,
    scrapDaunQty: 0,
    startTime: new Date('2026-10-20T01:00:00Z'),
    endTime: null,
    productionOrder: { bom: { category } },
});

describe('getProductionAnalytics operator productivity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);
        vi.mocked(prisma.scrapRecord.findMany).mockResolvedValue([]);
        vi.mocked(prisma.productVariant.findMany).mockResolvedValue([]);
        vi.mocked(prisma.qualityInspection.findMany).mockResolvedValue([]);
    });

    it('keeps one operator separate per process instead of summing units', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            execution('EXTRUSION', 600, 30, 'o1'),
            execution('EXTRUSION', 400, 20, 'o2'),
            execution('PACKING', 1500, 0, 'o3'),
        ] as never);

        const { operatorProductivity } = await getProductionAnalytics();

        expect(operatorProductivity).toHaveLength(2);
        const extrusion = operatorProductivity.find(
            (o) => o.process === 'EXTRUSION',
        );
        const packing = operatorProductivity.find(
            (o) => o.process === 'PACKING',
        );
        expect(extrusion).toMatchObject({
            operatorCode: 'OP1',
            totalQuantityProduced: 1000,
            totalScrapQuantity: 50,
            ordersHandled: 2,
        });
        expect(packing).toMatchObject({
            totalQuantityProduced: 1500,
            totalScrapQuantity: 0,
            ordersHandled: 1,
        });
    });

    it('puts executions without a known BOM category under OTHER', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            execution(null, 10, 0, 'o1'),
        ] as never);

        const { operatorProductivity } = await getProductionAnalytics();

        expect(operatorProductivity).toHaveLength(1);
        expect(operatorProductivity[0].process).toBe('OTHER');
    });

    it('asks Prisma for the BOM category of each execution', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue(
            [] as never,
        );

        await getProductionAnalytics();

        expect(prisma.productionExecution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                include: expect.objectContaining({
                    productionOrder: {
                        select: { bom: { select: { category: true } } },
                    },
                }),
            }),
        );
    });
});
