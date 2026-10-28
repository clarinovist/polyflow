import { describe, expect, it, vi } from 'vitest';
import { allocateByMaterial, readConversionPool } from '../conversion-cost-allocation';
import { nonClosingJournalFilter } from '../closing-reference-filter';

const sum = (values: Iterable<number>) => [...values].reduce((total, v) => total + Math.round(v * 100), 0) / 100;

describe('allocateByMaterial', () => {
    it('splits by material cost and ties out to the pool exactly', () => {
        // Arrange — three equal weights force a rounding remainder
        const targets = [
            { productionOrderId: 'b', materialCost: 1000 },
            { productionOrderId: 'a', materialCost: 1000 },
            { productionOrderId: 'c', materialCost: 1000 },
        ];

        // Act
        const result = allocateByMaterial(targets, 100);

        // Assert
        expect(result.allocations.get('a')).toBe(33.34);
        expect(result.allocations.get('b')).toBe(33.33);
        expect(result.allocations.get('c')).toBe(33.33);
        expect(sum(result.allocations.values())).toBe(100);
        expect(result).toMatchObject({ allocated: 100, unallocated: 0 });
    });

    it('weights by material and gives the remainder to the largest material', () => {
        const result = allocateByMaterial(
            [
                { productionOrderId: 'small', materialCost: 1_000_000 },
                { productionOrderId: 'big', materialCost: 3_000_000 },
                { productionOrderId: 'none', materialCost: 0 },
            ],
            101_300_000.01,
        );

        expect(result.allocations.get('small')).toBe(25_325_000);
        expect(result.allocations.get('big')).toBe(75_975_000.01);
        expect(result.allocations.has('none')).toBe(false);
        expect(sum(result.allocations.values())).toBe(101_300_000.01);
    });

    it('stays exact for large pools and many SPKs', () => {
        const targets = Array.from({ length: 187 }, (_, i) => ({ productionOrderId: `o${i}`, materialCost: 7_891_234.56 + i * 13.7 }));

        const result = allocateByMaterial(targets, 185_100_000.37);

        expect(sum(result.allocations.values())).toBe(185_100_000.37);
    });

    it('reports the pool as unallocated when it cannot be split', () => {
        expect(allocateByMaterial([], 500)).toEqual({ allocations: new Map(), allocated: 0, unallocated: 500 });
        expect(allocateByMaterial([{ productionOrderId: 'a', materialCost: 0 }], 500).unallocated).toBe(500);
        expect(allocateByMaterial([{ productionOrderId: 'a', materialCost: 10 }], -25)).toMatchObject({ allocated: 0, unallocated: -25 });
        expect(allocateByMaterial([{ productionOrderId: 'a', materialCost: 10 }], 0).allocations.size).toBe(0);
    });
});

describe('readConversionPool', () => {
    it('nets debit against credit per account for POSTED lines in the period', async () => {
        // Arrange
        const start = new Date('2026-10-01T00:00:00Z');
        const end = new Date('2026-10-31T23:59:59Z');
        const findMany = vi.fn(async () => [
            { accountId: 'wage', debit: 25_000_000, credit: 0, account: { code: '5-012b', name: 'Tenaga Kerja Langsung' } },
            { accountId: 'power', debit: 74_200_000, credit: 0, account: { code: '5-031', name: 'Pemakaian Listrik' } },
            { accountId: 'wage', debit: 0, credit: 1_000_000.5, account: { code: '5-012b', name: 'Tenaga Kerja Langsung' } },
            { accountId: 'wage', debit: null, credit: null, account: { code: '5-012b', name: 'Tenaga Kerja Langsung' } },
        ]);

        // Act
        const pool = await readConversionPool({ journalLine: { findMany } } as never, ['wage', 'power'], start, end);

        // Assert
        expect(pool).toEqual({
            total: 98_199_999.5,
            byAccount: [
                { accountId: 'wage', code: '5-012b', name: 'Tenaga Kerja Langsung', amount: 23_999_999.5 },
                { accountId: 'power', code: '5-031', name: 'Pemakaian Listrik', amount: 74_200_000 },
            ],
        });
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                accountId: { in: ['wage', 'power'] },
                journalEntry: { status: 'POSTED', entryDate: { gte: start, lte: end }, ...nonClosingJournalFilter() },
            },
        }));
    });

    it('leaves out month-end closing entries, which zero every expense account of a closed month', async () => {
        // Arrange
        const findMany = vi.fn(async () => []);

        // Act
        await readConversionPool({ journalLine: { findMany } } as never, ['wage'], new Date('2026-09-01'), new Date('2026-09-30'));

        // Assert — same exclusion as the profit and loss report
        const [[args]] = findMany.mock.calls as unknown as [[{ where: { journalEntry: Record<string, unknown> } }]];
        expect(args.where.journalEntry).toMatchObject(nonClosingJournalFilter());
        expect(JSON.stringify(args.where.journalEntry)).toContain('CLOSING-');
        expect(JSON.stringify(args.where.journalEntry)).toContain('CLOSE-');
    });

    it('reads nothing when no account is chosen', async () => {
        const findMany = vi.fn();

        expect(await readConversionPool({ journalLine: { findMany } } as never, [], new Date(), new Date())).toEqual({ total: 0, byAccount: [] });
        expect(findMany).not.toHaveBeenCalled();
    });
});
