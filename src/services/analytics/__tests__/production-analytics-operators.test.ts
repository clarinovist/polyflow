import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

    describe('period and voided entries', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('excludes voided executions and uses WIB business-day bounds by default', async () => {
            vi.useFakeTimers();
            // 22 Okt 2026 18:49 WIB
            vi.setSystemTime(new Date('2026-10-22T11:49:06.000Z'));
            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue(
                [] as never,
            );

            await getProductionAnalytics();

            expect(prisma.productionExecution.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        status: { not: 'VOIDED' },
                        startTime: {
                            gte: new Date('2026-09-30T17:00:00.000Z'),
                            lte: new Date('2026-10-22T16:59:59.999Z'),
                        },
                    },
                }),
            );
        });

        it('applies the same WIB bounds to scrap records and drops voided-linked ones', async () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-10-22T11:49:06.000Z'));
            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue(
                [] as never,
            );

            await getProductionAnalytics();

            expect(prisma.scrapRecord.findMany).toHaveBeenCalledWith({
                where: {
                    recordedAt: {
                        gte: new Date('2026-09-30T17:00:00.000Z'),
                        lte: new Date('2026-10-22T16:59:59.999Z'),
                    },
                    OR: [
                        { productionExecutionId: null },
                        {
                            productionExecution: {
                                status: { not: 'VOIDED' },
                            },
                        },
                    ],
                },
            });
        });

        it('snaps an explicit range to WIB days', async () => {
            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue(
                [] as never,
            );

            await getProductionAnalytics({
                from: new Date('2026-09-30T17:00:00.000Z'),
                to: new Date('2026-10-31T16:59:59.999Z'),
            });

            expect(prisma.productionExecution.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        startTime: {
                            gte: new Date('2026-09-30T17:00:00.000Z'),
                            lte: new Date('2026-10-31T16:59:59.999Z'),
                        },
                    }),
                }),
            );
        });
    });

    describe('affal by process', () => {
        it('totals output and affal per process without mixing processes', async () => {
            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
                execution('EXTRUSION', 600, 30, 'o1'),
                execution('EXTRUSION', 400, 20, 'o2'),
                execution('PACKING', 825, 175, 'o3'),
                execution(null, 10, 1, 'o4'),
            ] as never);

            const { affalByProcess } = await getProductionAnalytics();

            expect(affalByProcess.EXTRUSION).toEqual({
                produced: 1000,
                affal: 50,
                entries: 2,
            });
            expect(affalByProcess.PACKING).toEqual({
                produced: 825,
                affal: 175,
                entries: 1,
            });
            expect(affalByProcess.OTHER).toEqual({
                produced: 10,
                affal: 1,
                entries: 1,
            });
            expect(affalByProcess.MIXING).toEqual({
                produced: 0,
                affal: 0,
                entries: 0,
            });
        });

        it('counts affal from the dedicated columns without double counting kiosk rows', async () => {
            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
                {
                    ...execution('PACKING', 100, 0, 'o1'),
                    scrapProngkolQty: 4,
                    scrapDaunQty: 6,
                },
                {
                    ...execution('PACKING', 100, 10, 'o2'),
                    scrapProngkolQty: 4,
                    scrapDaunQty: 6,
                },
            ] as never);

            const { affalByProcess } = await getProductionAnalytics();

            expect(affalByProcess.PACKING.affal).toBe(20);
        });
    });
});
