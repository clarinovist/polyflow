import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        account: { findUnique: vi.fn() },
        journalEntry: { findMany: vi.fn() },
        stockMovement: { findMany: vi.fn() },
        stockOpname: { findMany: vi.fn() },
    },
}));

import { prisma } from '@/lib/core/prisma';
import { getInventoryAdjustmentReportDetails } from '../inventory-adjustment-report-service';

describe('inventory-adjustment-report-service', () => {
    beforeEach(() => vi.clearAllMocks());

    it('maps posted gain journals to business events and discloses inferred cost', async () => {
        vi.mocked(prisma.account.findUnique).mockResolvedValue({
            id: 'gain',
            code: '81100',
            name: 'Inventory Adjustment Gain',
            type: 'REVENUE',
        } as never);
        vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
            {
                id: 'journal-1',
                entryNumber: 'JE-001',
                entryDate: new Date('2026-10-01T08:17:00Z'),
                createdAt: new Date('2026-10-01T08:17:01Z'),
                reference: 'OPN-202610-0001',
                referenceId: 'movement-1',
                createdBy: null,
                lines: [{ debit: 0, credit: 3000 }],
            },
        ] as never);
        vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
            {
                id: 'movement-1',
                quantity: 2,
                cost: null,
                reference: 'OPN-202610-0001',
                createdAt: new Date('2026-10-01T08:17:00Z'),
                productVariantId: 'variant-1',
                fromLocation: null,
                toLocation: { name: 'Gudang Bahan Baku' },
                createdBy: null,
                productVariant: {
                    name: 'HD 1',
                    primaryUnit: 'KG',
                    product: { name: 'HD' },
                },
            },
        ] as never);
        vi.mocked(prisma.stockOpname.findMany).mockResolvedValue([
            {
                id: 'opname-1',
                opnameNumber: 'OPN-202610-0001',
                items: [
                    {
                        productVariantId: 'variant-1',
                        systemQuantity: 10,
                        countedQuantity: 12,
                    },
                ],
            },
        ] as never);

        const result = await getInventoryAdjustmentReportDetails(
            'gain',
            new Date('2026-10-01T00:00:00+07:00'),
            new Date('2026-10-31T23:59:59+07:00'),
        );

        expect(result).toMatchObject({
            accountCode: '81100',
            direction: 'GAIN',
            eventCount: 1,
            totalAmount: 3000,
        });
        expect(result.events[0]).toMatchObject({
            movementId: 'movement-1',
            productName: 'HD',
            variantName: 'HD 1',
            locationName: 'Gudang Bahan Baku',
            quantity: 2,
            unitCost: 1500,
            costBasis: 'INFERRED',
            sourceType: 'STOCK_OPNAME',
            sourceId: 'opname-1',
            actorName: null,
            systemQuantity: 10,
            countedQuantity: 12,
        });
        expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    status: 'POSTED',
                    referenceType: 'STOCK_ADJUSTMENT',
                    lines: { some: { accountId: 'gain' } },
                    entryDate: {
                        gte: new Date('2026-09-30T17:00:00.000Z'),
                        lte: new Date('2026-10-31T16:59:59.999Z'),
                    },
                }),
            }),
        );
    });

    it('fails closed for a non-adjustment account', async () => {
        vi.mocked(prisma.account.findUnique).mockResolvedValue({
            id: 'sales',
            code: '41100',
            name: 'Sales',
            type: 'REVENUE',
        } as never);

        const result = await getInventoryAdjustmentReportDetails(
            'sales',
            new Date('2026-10-01'),
            new Date('2026-10-31'),
        );

        expect(result.events).toEqual([]);
        expect(prisma.journalEntry.findMany).not.toHaveBeenCalled();
    });
});
