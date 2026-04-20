import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGoodsReceipt } from '../purchasing/receipts-service';
import { prisma } from '@/lib/core/prisma';
import { InventoryCoreService } from '../inventory/core-service';
import { AccountingService } from '../accounting/accounting-service';

vi.mock('@/lib/core/prisma', () => {
    const mockPrisma = {
        $transaction: vi.fn(async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma)),
        goodsReceipt: {
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        stockMovement: {
            create: vi.fn(),
        },
    };

    return { prisma: mockPrisma };
});

vi.mock('../inventory/core-service', () => ({
    InventoryCoreService: {
        incrementStockWithCost: vi.fn(),
    }
}));

vi.mock('../accounting/accounting-service', () => ({
    AccountingService: {
        recordInventoryMovement: vi.fn(),
    }
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('@/services/purchasing/invoices-service', () => ({
    createDraftBillFromPo: vi.fn(),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: {
        error: vi.fn(),
    }
}));

describe('createGoodsReceipt', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.goodsReceipt.findFirst as any).mockResolvedValue(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.goodsReceipt.create as any).mockResolvedValue({ id: 'gr-1', items: [] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.stockMovement.create as any).mockResolvedValue({ id: 'mov-1' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (InventoryCoreService.incrementStockWithCost as any).mockResolvedValue(undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AccountingService.recordInventoryMovement as any).mockResolvedValue(undefined);
    });

    it('should update inventory average cost from receipt unit cost without directly mutating variant standard cost', async () => {
        await createGoodsReceipt({
            receivedDate: new Date('2026-04-20T00:00:00.000Z'),
            locationId: 'loc-1',
            notes: 'receipt test',
            items: [
                {
                    productVariantId: 'pv-1',
                    receivedQty: 10,
                    unitCost: 125
                }
            ]
        }, 'user-1');

        expect(InventoryCoreService.incrementStockWithCost).toHaveBeenCalledWith(
            expect.anything(),
            'loc-1',
            'pv-1',
            10,
            125
        );
        expect(AccountingService.recordInventoryMovement).toHaveBeenCalledTimes(1);
    });
});