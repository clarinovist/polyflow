
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDays, startOfDay } from 'date-fns';
import { getStockLedger } from '../stock-ledger-service';
import { prisma } from '@/lib/core/prisma';

// Mock Prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productVariant: {
            findUniqueOrThrow: vi.fn(),
        },
        stockMovement: {
            findMany: vi.fn(),
        },
    },
}));

describe('StockLedgerService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should correctly calculate opening stock and running balance for Global view (no locationId)', async () => {
        // Mock product variant
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        vi.mocked(prisma.productVariant.findUniqueOrThrow).mockResolvedValue({
            id: 'pv-1',
            name: 'Test Product',
            skuCode: 'SKU-01',
             
            primaryUnit: 'PCS' as any,
            product: { productType: 'RAW_MATERIAL' }
         
        } as any);

        // Mock prior movements (Opening Stock)
        // 10 IN, 2 OUT = 8 opening stock
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        vi.mocked(prisma.stockMovement.findMany).mockImplementation(async (args: Parameters<typeof prisma.stockMovement.findMany>[0]) => {
            const createdAt = args?.where?.createdAt as { lt?: Date; gte?: Date };

            // Opening stock query
            if (createdAt?.lt && !createdAt?.gte) {
                return [
                    { id: 'm1', quantity: { toNumber: () => 10 }, toLocationId: 'loc-1', fromLocationId: null }, // IN +10
                    { id: 'm2', quantity: { toNumber: () => 2 }, toLocationId: null, fromLocationId: 'loc-1' },  // OUT -2
                    { id: 'm3', quantity: { toNumber: () => 5 }, toLocationId: 'loc-2', fromLocationId: 'loc-1' } // TRANSFER 0
                ];
            }

            // Current period movements query
            if (createdAt?.gte && createdAt?.lt) {
                return [
                    { id: 'm4', quantity: { toNumber: () => 15 }, toLocationId: 'loc-1', fromLocationId: null, type: 'IN', createdAt: new Date() }, // IN +15
                    { id: 'm5', quantity: { toNumber: () => 4 }, toLocationId: null, fromLocationId: 'loc-1', type: 'OUT', createdAt: new Date() }  // OUT -4
                ];
            }

            return [];
        });

        const startDate = new Date('2023-01-01');
        const endDate = new Date('2023-12-31');

        const result = await getStockLedger('pv-1', startDate, endDate);

        expect(result.product.name).toBe('Test Product');
        
        // Opening stock should be 10 - 2 = 8
        expect(result.summary.openingStock).toBe(8);
        
        // Current period: 15 IN, 4 OUT
        expect(result.summary.totalIn).toBe(15);
        expect(result.summary.totalOut).toBe(4);
        
        // Closing stock should be 8 + 15 - 4 = 19
        expect(result.summary.closingStock).toBe(19);

        // Verify running balances on entries
        expect(result.entries.length).toBe(2);
        expect(result.entries[0].balance).toBe(23); // 8 + 15
        expect(result.entries[1].balance).toBe(19); // 23 - 4
    });

    it('should correctly include same-day movements after midnight by using end-exclusive date range', async () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        vi.mocked(prisma.productVariant.findUniqueOrThrow).mockResolvedValue({
            id: 'pv-1',
            name: 'Test Product',
            skuCode: 'SKU-01',
             
            primaryUnit: 'PCS' as any,
            product: { productType: 'RAW_MATERIAL' }
         
        } as any);

        const startDate = new Date('2026-05-09T00:00:00.000Z');
        const endDate = new Date('2026-05-09T00:00:00.000Z');

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        vi.mocked(prisma.stockMovement.findMany).mockImplementation(async (args: Parameters<typeof prisma.stockMovement.findMany>[0]) => {
            const createdAt = args?.where?.createdAt as { lt?: Date; gte?: Date };

            // Opening stock query
            if (createdAt?.lt && !createdAt?.gte) {
                return [];
            }

            // Current period movements query
            if (createdAt?.gte && createdAt?.lt) {
                expect(createdAt.gte?.toISOString()).toBe(startDate.toISOString());
                expect(createdAt.lt?.toISOString()).toBe(addDays(startOfDay(endDate), 1).toISOString());

                return [
                    { id: 'm1', quantity: { toNumber: () => 7 }, toLocationId: 'loc-1', fromLocationId: null, type: 'IN', createdAt: new Date('2026-05-09T06:22:20.000Z') },
                    { id: 'm2', quantity: { toNumber: () => 2 }, toLocationId: null, fromLocationId: 'loc-1', type: 'OUT', createdAt: new Date('2026-05-09T08:00:00.000Z') }
                ];
            }

            return [];
        });

        const result = await getStockLedger('pv-1', startDate, endDate);

        expect(result.summary.totalIn).toBe(7);
        expect(result.summary.totalOut).toBe(2);
        expect(result.summary.closingStock).toBe(5);
        expect(result.entries).toHaveLength(2);
    });

    it('should correctly calculate opening stock and running balance for a specific Location', async () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        vi.mocked(prisma.productVariant.findUniqueOrThrow).mockResolvedValue({
            id: 'pv-1',
            name: 'Test Product',
            skuCode: 'SKU-01',
             
            primaryUnit: 'PCS' as any,
            product: { productType: 'RAW_MATERIAL' }
         
        } as any);

        // For location loc-1:
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        vi.mocked(prisma.stockMovement.findMany).mockImplementation(async (args: Parameters<typeof prisma.stockMovement.findMany>[0]) => {
            const createdAt = args?.where?.createdAt as { lt?: Date; gte?: Date };

            // Opening stock query
            if (createdAt?.lt && !createdAt?.gte) {
                return [
                    { id: 'm1', quantity: { toNumber: () => 10 }, toLocationId: 'loc-1', fromLocationId: null }, // IN to loc-1 +10
                    { id: 'm2', quantity: { toNumber: () => 5 }, toLocationId: 'loc-2', fromLocationId: 'loc-1' }  // TRANSFER from loc-1 to loc-2 -5
                ];
            }

            // Current period movements query
            if (createdAt?.gte && createdAt?.lt) {
                return [
                    { id: 'm3', quantity: { toNumber: () => 20 }, toLocationId: 'loc-1', fromLocationId: 'loc-2', type: 'TRANSFER', createdAt: new Date() }, // TRANSFER to loc-1 +20
                ];
            }

            return [];
        });

        const startDate = new Date('2023-01-01');
        const endDate = new Date('2023-12-31');

        const result = await getStockLedger('pv-1', startDate, endDate, 'loc-1');

        // Opening stock for loc-1 should be 10 - 5 = 5
        expect(result.summary.openingStock).toBe(5);

        // Current period: 20 IN for loc-1
        expect(result.summary.totalIn).toBe(20);
        expect(result.summary.totalOut).toBe(0);

        // Closing stock for loc-1 should be 5 + 20 = 25
        expect(result.summary.closingStock).toBe(25);

        // Verify running balances on entries
        expect(result.entries.length).toBe(1);
        expect(result.entries[0].balance).toBe(25);
    });
});
