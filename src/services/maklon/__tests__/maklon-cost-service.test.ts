import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => {
    const mockTx = {
        maklonCostItem: {
            create: vi.fn(),
            delete: vi.fn(),
            findMany: vi.fn(),
        },
        productionOrder: {
            update: vi.fn(),
        },
    };

    const mockPrisma = {
        maklonCostItem: {
            create: vi.fn(),
            delete: vi.fn(),
            findMany: vi.fn(),
        },
        productionOrder: {
            update: vi.fn(),
        },
        $transaction: vi.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
    };

    return {
        prisma: mockPrisma,
        __mockTx: mockTx,
    };
});

// @ts-expect-error - __mockTx is provided by vi.mock above
import { prisma, __mockTx as tx } from '@/lib/core/prisma';
import { MaklonCostService } from '../maklon-cost-service';

describe('MaklonCostService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('adds cost item using default prisma client', async () => {
        vi.mocked(prisma.maklonCostItem.create).mockResolvedValue({ id: 'cost-1' } as never);

        await MaklonCostService.addCostItem({
            productionOrderId: 'po-1',
            costType: 'LABOR',
            amount: 125000,
            description: 'Labor shift malam',
        });

        expect(prisma.maklonCostItem.create).toHaveBeenCalledWith({
            data: {
                productionOrderId: 'po-1',
                costType: 'LABOR',
                amount: 125000,
                description: 'Labor shift malam',
            },
        });
    });

    it('removes cost item using provided transaction client', async () => {
        vi.mocked(tx.maklonCostItem.delete).mockResolvedValue({ id: 'cost-1' } as never);

        await MaklonCostService.removeCostItem('cost-1', tx as never);

        expect(tx.maklonCostItem.delete).toHaveBeenCalledWith({
            where: { id: 'cost-1' },
        });
        expect(prisma.maklonCostItem.delete).not.toHaveBeenCalled();
    });

    it('returns cost items for a production order', async () => {
        vi.mocked(prisma.maklonCostItem.findMany).mockResolvedValue([
            { id: 'a', amount: 1000 },
            { id: 'b', amount: 2000 },
        ] as never);

        const items = await MaklonCostService.getCostItems('po-2');

        expect(items).toHaveLength(2);
        expect(prisma.maklonCostItem.findMany).toHaveBeenCalledWith({
            where: { productionOrderId: 'po-2' },
        });
    });

    it('updates estimated conversion cost using internal transaction', async () => {
        vi.mocked(tx.maklonCostItem.findMany).mockResolvedValue([
            { amount: 1500.5 },
            { amount: 2499.5 },
        ] as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({ id: 'po-3' } as never);

        await MaklonCostService.updateEstimatedConversionCost('po-3');

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(tx.productionOrder.update).toHaveBeenCalledWith({
            where: { id: 'po-3' },
            data: { estimatedConversionCost: 4000 },
        });
    });

    it('updates estimated conversion cost using provided transaction client without starting new transaction', async () => {
        vi.mocked(tx.maklonCostItem.findMany).mockResolvedValue([
            { amount: 500 },
            { amount: 250 },
        ] as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({ id: 'po-4' } as never);

        await MaklonCostService.updateEstimatedConversionCost('po-4', tx as never);

        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(tx.productionOrder.update).toHaveBeenCalledWith({
            where: { id: 'po-4' },
            data: { estimatedConversionCost: 750 },
        });
    });
});
