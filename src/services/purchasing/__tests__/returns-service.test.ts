import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        purchaseReturn: {
            findFirst: vi.fn(),
            create: vi.fn(),
        },
    },
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { prisma } from '@/lib/core/prisma';
import { PurchaseReturnService } from '../returns-service';

const createInput = {
    purchaseOrderId: 'po-1',
    goodsReceiptId: 'gr-1',
    supplierId: 'sup-1',
    sourceLocationId: 'loc-1',
    reason: 'Damaged items',
    notes: 'test',
    items: [
        {
            productVariantId: 'pv-1',
            returnedQty: 2,
            unitCost: 10000,
            reason: 'Damaged',
            notes: 'test item',
        }
    ]
};

describe('PurchaseReturnService.generateReturnNumber', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-03T10:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('generates first return number when no return exists for the day', async () => {
        vi.mocked(prisma.purchaseReturn.findFirst).mockResolvedValue(null as never);

        const number = await PurchaseReturnService.generateReturnNumber();

        expect(number).toBe('PR-20260503-0001');
        expect(prisma.purchaseReturn.findFirst).toHaveBeenCalledWith({
            where: { returnNumber: { startsWith: 'PR-20260503-' } },
            orderBy: { returnNumber: 'desc' },
        });
    });

    it('increments sequence from latest return number', async () => {
        vi.mocked(prisma.purchaseReturn.findFirst).mockResolvedValue({
            returnNumber: 'PR-20260503-0042',
        } as never);

        const number = await PurchaseReturnService.generateReturnNumber();

        expect(number).toBe('PR-20260503-0043');
    });

    it('falls back to 0001 when existing sequence is invalid', async () => {
        vi.mocked(prisma.purchaseReturn.findFirst).mockResolvedValue({
            returnNumber: 'PR-20260503-ABCD',
        } as never);

        const number = await PurchaseReturnService.generateReturnNumber();

        expect(number).toBe('PR-20260503-0001');
    });

    it('falls back to 0001 when existing return number is malformed', async () => {
        vi.mocked(prisma.purchaseReturn.findFirst).mockResolvedValue({
            returnNumber: 'PR-20260503',
        } as never);

        const number = await PurchaseReturnService.generateReturnNumber();

        expect(number).toBe('PR-20260503-0001');
    });

    it('retries createReturn when returnNumber hits unique constraint collision', async () => {
        vi.mocked(prisma.purchaseReturn.findFirst)
            .mockResolvedValueOnce({ returnNumber: 'PR-20260503-0001' } as never)
            .mockResolvedValueOnce({ returnNumber: 'PR-20260503-0002' } as never);

        vi.mocked(prisma.purchaseReturn.create)
            .mockRejectedValueOnce({ code: 'P2002', meta: { target: ['returnNumber'] } } as never)
            .mockResolvedValueOnce({
                id: 'ret-1',
                returnNumber: 'PR-20260503-0003',
                items: [],
            } as never);

        const result = await PurchaseReturnService.createReturn(createInput, 'user-1');

        expect(prisma.purchaseReturn.create).toHaveBeenCalledTimes(2);
        expect(result.id).toBe('ret-1');
    });

    it('throws after exhausting retry attempts on repeated collisions', async () => {
        vi.mocked(prisma.purchaseReturn.findFirst)
            .mockResolvedValue({ returnNumber: 'PR-20260503-0001' } as never);

        vi.mocked(prisma.purchaseReturn.create)
            .mockRejectedValue({ code: 'P2002', meta: { target: ['returnNumber'] } } as never);

        await expect(PurchaseReturnService.createReturn(createInput, 'user-1'))
            .rejects.toThrow('Failed to create Purchase Return due to repeated return number collisions');

        expect(prisma.purchaseReturn.create).toHaveBeenCalledTimes(3);
    });

    it('rethrows non-unique errors without retrying', async () => {
        const dbError = new Error('Database unavailable');

        vi.mocked(prisma.purchaseReturn.findFirst)
            .mockResolvedValue({ returnNumber: 'PR-20260503-0001' } as never);

        vi.mocked(prisma.purchaseReturn.create)
            .mockRejectedValueOnce(dbError as never);

        await expect(PurchaseReturnService.createReturn(createInput, 'user-1'))
            .rejects.toThrow('Database unavailable');

        expect(prisma.purchaseReturn.create).toHaveBeenCalledTimes(1);
    });
});
