import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { tx } = vi.hoisted(() => ({
    tx: {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(),
    },
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        $transaction: vi.fn((fn: (inner: typeof tx) => unknown) => fn(tx)),
    },
}));

import { prisma } from '@/lib/core/prisma';
import {
    checkStockLedgerHealth,
    summarizeStockLedgerHealth,
} from '../stock-ledger-health-service';

describe('checkStockLedgerHealth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.$queryRaw.mockResolvedValue([]);
    });

    it('reports a clean tenant from one read-only transaction', async () => {
        const health = await checkStockLedgerHealth();

        expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
        expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain(
            'SET TRANSACTION READ ONLY',
        );
        expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
        const querySql = tx.$queryRaw.mock.calls[0][0].strings.join('');
        expect(querySql).toContain('FULL JOIN');
        expect(querySql).toContain('"toLocationId"');
        expect(querySql).toContain('"fromLocationId"');
        expect(vi.mocked(prisma.$transaction).mock.calls[0][1]).toMatchObject({
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        });
        expect(health).toEqual({
            mismatches: [],
            roundingCount: 0,
            materialCount: 0,
            findings: 0,
        });
        expect(summarizeStockLedgerHealth('acme', health)).toBe(
            '[StockLedgerHealth] acme: ok',
        );
    });

    it('maps rows, sorts by |diff| descending, and classifies rounding vs material', async () => {
        tx.$queryRaw.mockResolvedValue([
            {
                skuCode: 'SKU-ROUND-POS',
                locationName: 'Gudang A',
                live: '10.0005',
                ledger: '10.0000',
                diff: '0.0005',
            },
            {
                skuCode: 'SKU-MAT-NEG',
                locationName: 'Gudang B',
                live: '5.0000',
                ledger: '30.5000',
                diff: '-25.5000',
            },
            {
                skuCode: 'SKU-BOUNDARY',
                locationName: 'Gudang C',
                live: '1.0100',
                ledger: '1.0000',
                diff: '0.0100',
            },
            {
                skuCode: 'SKU-ROUND-NEG',
                locationName: 'Gudang D',
                live: '2.0000',
                ledger: '2.0099',
                diff: '-0.0099',
            },
            {
                skuCode: 'SKU-LEDGER-ONLY',
                locationName: 'Gudang E',
                live: '0.0000',
                ledger: '4.2500',
            },
        ]);

        const health = await checkStockLedgerHealth();

        expect(health).toEqual({
            mismatches: [
                {
                    skuCode: 'SKU-MAT-NEG',
                    locationName: 'Gudang B',
                    live: '5',
                    ledger: '30.5',
                    diff: '-25.5',
                },
                {
                    skuCode: 'SKU-LEDGER-ONLY',
                    locationName: 'Gudang E',
                    live: '0',
                    ledger: '4.25',
                    diff: '-4.25',
                },
                {
                    skuCode: 'SKU-BOUNDARY',
                    locationName: 'Gudang C',
                    live: '1.01',
                    ledger: '1',
                    diff: '0.01',
                },
                {
                    skuCode: 'SKU-ROUND-NEG',
                    locationName: 'Gudang D',
                    live: '2',
                    ledger: '2.0099',
                    diff: '-0.0099',
                },
                {
                    skuCode: 'SKU-ROUND-POS',
                    locationName: 'Gudang A',
                    live: '10.0005',
                    ledger: '10',
                    diff: '0.0005',
                },
            ],
            roundingCount: 2,
            materialCount: 3,
            findings: 5,
        });
        expect(summarizeStockLedgerHealth('acme', health)).toBe(
            '[StockLedgerHealth] check failed for acme: 5 pasangan saldo≠kartu stok (2 pembulatan, 3 material) — SKU-MAT-NEG@Gudang B -25.5, SKU-LEDGER-ONLY@Gudang E -4.25, SKU-BOUNDARY@Gudang C 0.01, SKU-ROUND-NEG@Gudang D -0.0099, SKU-ROUND-POS@Gudang A 0.0005',
        );
    });

    it('caps the summary list at 10 pairs and appends +n lainnya', () => {
        const mismatches = Array.from({ length: 12 }, (_, idx) => {
            const diff = String(12 - idx);
            return {
                skuCode: `SKU-${idx + 1}`,
                locationName: 'Gudang Utama',
                live: diff,
                ledger: '0',
                diff,
            };
        });
        const line = summarizeStockLedgerHealth('acme', {
            mismatches,
            roundingCount: 2,
            materialCount: 10,
            findings: 12,
        });

        expect(line).toBe(
            '[StockLedgerHealth] check failed for acme: 12 pasangan saldo≠kartu stok (2 pembulatan, 10 material) — ' +
                'SKU-1@Gudang Utama 12, SKU-2@Gudang Utama 11, SKU-3@Gudang Utama 10, SKU-4@Gudang Utama 9, SKU-5@Gudang Utama 8, ' +
                'SKU-6@Gudang Utama 7, SKU-7@Gudang Utama 6, SKU-8@Gudang Utama 5, SKU-9@Gudang Utama 4, SKU-10@Gudang Utama 3, +2 lainnya',
        );
    });
});
