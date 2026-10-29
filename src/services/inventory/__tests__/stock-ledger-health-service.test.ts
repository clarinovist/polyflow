import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { tx } = vi.hoisted(() => ({
    tx: {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(),
        inventory: {
            findUnique: vi.fn(),
        },
        stockMovement: {
            findMany: vi.fn(),
        },
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
    getStockLedgerPairHistory,
    summarizeStockLedgerHealth,
} from '../stock-ledger-health-service';

describe('checkStockLedgerHealth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.$queryRaw.mockResolvedValue([]);
        tx.inventory.findUnique.mockResolvedValue(null);
        tx.stockMovement.findMany.mockResolvedValue([]);
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
                productVariantId: 'pv-round-pos',
                locationId: 'loc-a',
                skuCode: 'SKU-ROUND-POS',
                locationName: 'Gudang A',
                live: '10.0005',
                ledger: '10.0000',
                diff: '0.0005',
            },
            {
                productVariantId: 'pv-mat-neg',
                locationId: 'loc-b',
                skuCode: 'SKU-MAT-NEG',
                locationName: 'Gudang B',
                live: '5.0000',
                ledger: '30.5000',
                diff: '-25.5000',
            },
            {
                productVariantId: 'pv-boundary',
                locationId: 'loc-c',
                skuCode: 'SKU-BOUNDARY',
                locationName: 'Gudang C',
                live: '1.0100',
                ledger: '1.0000',
                diff: '0.0100',
            },
            {
                productVariantId: 'pv-round-neg',
                locationId: 'loc-d',
                skuCode: 'SKU-ROUND-NEG',
                locationName: 'Gudang D',
                live: '2.0000',
                ledger: '2.0099',
                diff: '-0.0099',
            },
            {
                productVariantId: 'pv-ledger-only',
                locationId: 'loc-e',
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
                    productVariantId: 'pv-mat-neg',
                    locationId: 'loc-b',
                    skuCode: 'SKU-MAT-NEG',
                    locationName: 'Gudang B',
                    live: '5',
                    ledger: '30.5',
                    diff: '-25.5',
                },
                {
                    productVariantId: 'pv-ledger-only',
                    locationId: 'loc-e',
                    skuCode: 'SKU-LEDGER-ONLY',
                    locationName: 'Gudang E',
                    live: '0',
                    ledger: '4.25',
                    diff: '-4.25',
                },
                {
                    productVariantId: 'pv-boundary',
                    locationId: 'loc-c',
                    skuCode: 'SKU-BOUNDARY',
                    locationName: 'Gudang C',
                    live: '1.01',
                    ledger: '1',
                    diff: '0.01',
                },
                {
                    productVariantId: 'pv-round-neg',
                    locationId: 'loc-d',
                    skuCode: 'SKU-ROUND-NEG',
                    locationName: 'Gudang D',
                    live: '2',
                    ledger: '2.0099',
                    diff: '-0.0099',
                },
                {
                    productVariantId: 'pv-round-pos',
                    locationId: 'loc-a',
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
                productVariantId: `pv-${idx + 1}`,
                locationId: 'loc-main',
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

describe('getStockLedgerPairHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.inventory.findUnique.mockResolvedValue(null);
        tx.stockMovement.findMany.mockResolvedValue([]);
    });

    it('computes signed deltas, running balance, and first negative position in a read-only transaction', async () => {
        tx.inventory.findUnique.mockResolvedValue({
            quantity: new Prisma.Decimal('8.5000'),
        });
        tx.stockMovement.findMany.mockResolvedValue([
            {
                id: 'mov-1',
                createdAt: new Date('2026-10-01T08:00:00.000Z'),
                type: 'IN',
                reference: 'GR-001',
                quantity: new Prisma.Decimal('10.0000'),
                fromLocationId: null,
                toLocationId: 'loc-1',
            },
            {
                id: 'mov-2',
                createdAt: new Date('2026-10-02T08:00:00.000Z'),
                type: 'OUT',
                reference: 'DO-001',
                quantity: new Prisma.Decimal('12.5000'),
                fromLocationId: 'loc-1',
                toLocationId: null,
            },
            {
                id: 'mov-3',
                createdAt: new Date('2026-10-03T08:00:00.000Z'),
                type: 'TRANSFER',
                reference: 'TRF-001',
                quantity: new Prisma.Decimal('11.0000'),
                fromLocationId: 'loc-2',
                toLocationId: 'loc-1',
            },
        ]);

        const history = await getStockLedgerPairHistory('pv-1', 'loc-1');

        expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
        expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain(
            'SET TRANSACTION READ ONLY',
        );
        expect(vi.mocked(prisma.$transaction).mock.calls[0][1]).toMatchObject({
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        });
        expect(tx.inventory.findUnique).toHaveBeenCalledWith({
            where: {
                locationId_productVariantId: {
                    locationId: 'loc-1',
                    productVariantId: 'pv-1',
                },
            },
            select: { quantity: true },
        });
        expect(tx.stockMovement.findMany).toHaveBeenCalledWith({
            where: {
                productVariantId: 'pv-1',
                OR: [{ fromLocationId: 'loc-1' }, { toLocationId: 'loc-1' }],
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
                id: true,
                createdAt: true,
                type: true,
                reference: true,
                quantity: true,
                fromLocationId: true,
                toLocationId: true,
            },
        });

        expect(history).toEqual({
            productVariantId: 'pv-1',
            locationId: 'loc-1',
            live: '8.5',
            ledger: '8.5',
            diff: '0',
            openingBalance: '0',
            truncated: false,
            totalMovements: 3,
            firstNegative: {
                id: 'mov-2',
                createdAt: '2026-10-02T08:00:00.000Z',
                type: 'OUT',
                reference: 'DO-001',
                inQuantity: '0',
                outQuantity: '12.5',
                delta: '-12.5',
                runningBalance: '-2.5',
            },
            movements: [
                {
                    id: 'mov-1',
                    createdAt: '2026-10-01T08:00:00.000Z',
                    type: 'IN',
                    reference: 'GR-001',
                    inQuantity: '10',
                    outQuantity: '0',
                    delta: '10',
                    runningBalance: '10',
                },
                {
                    id: 'mov-2',
                    createdAt: '2026-10-02T08:00:00.000Z',
                    type: 'OUT',
                    reference: 'DO-001',
                    inQuantity: '0',
                    outQuantity: '12.5',
                    delta: '-12.5',
                    runningBalance: '-2.5',
                },
                {
                    id: 'mov-3',
                    createdAt: '2026-10-03T08:00:00.000Z',
                    type: 'TRANSFER',
                    reference: 'TRF-001',
                    inQuantity: '11',
                    outQuantity: '0',
                    delta: '11',
                    runningBalance: '8.5',
                },
            ],
        });
    });

    it('truncates to the newest movements while keeping running balance anchored to prior total', async () => {
        tx.inventory.findUnique.mockResolvedValue({
            quantity: new Prisma.Decimal('20'),
        });
        tx.stockMovement.findMany.mockResolvedValue([
            {
                id: 'mov-1',
                createdAt: new Date('2026-10-01T08:00:00.000Z'),
                type: 'IN',
                reference: 'GR-001',
                quantity: new Prisma.Decimal('15'),
                fromLocationId: null,
                toLocationId: 'loc-1',
            },
            {
                id: 'mov-2',
                createdAt: new Date('2026-10-02T08:00:00.000Z'),
                type: 'OUT',
                reference: 'DO-001',
                quantity: new Prisma.Decimal('5'),
                fromLocationId: 'loc-1',
                toLocationId: null,
            },
            {
                id: 'mov-3',
                createdAt: new Date('2026-10-03T08:00:00.000Z'),
                type: 'IN',
                reference: 'GR-002',
                quantity: new Prisma.Decimal('8'),
                fromLocationId: null,
                toLocationId: 'loc-1',
            },
            {
                id: 'mov-4',
                createdAt: new Date('2026-10-04T08:00:00.000Z'),
                type: 'OUT',
                reference: null,
                quantity: new Prisma.Decimal('3'),
                fromLocationId: 'loc-1',
                toLocationId: 'loc-2',
            },
        ]);

        const history = await getStockLedgerPairHistory('pv-1', 'loc-1', 2);

        expect(history).toEqual({
            productVariantId: 'pv-1',
            locationId: 'loc-1',
            live: '20',
            ledger: '15',
            diff: '5',
            openingBalance: '10',
            truncated: true,
            totalMovements: 4,
            firstNegative: null,
            movements: [
                {
                    id: 'mov-3',
                    createdAt: '2026-10-03T08:00:00.000Z',
                    type: 'IN',
                    reference: 'GR-002',
                    inQuantity: '8',
                    outQuantity: '0',
                    delta: '8',
                    runningBalance: '18',
                },
                {
                    id: 'mov-4',
                    createdAt: new Date('2026-10-04T08:00:00.000Z').toISOString(),
                    type: 'OUT',
                    reference: null,
                    inQuantity: '0',
                    outQuantity: '3',
                    delta: '-3',
                    runningBalance: '15',
                },
            ],
        });
    });
});
