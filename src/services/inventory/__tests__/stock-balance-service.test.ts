import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStockBalance } from '../stock-balance-service';

const db = vi.hoisted(() => ({
    locations: vi.fn(), products: vi.fn(), groupBy: vi.fn(), transaction: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { $transaction: db.transaction },
}));

type Movement = {
    productVariantId: string;
    fromLocationId: string | null;
    toLocationId: string | null;
    createdAt: Date;
    quantity: Prisma.Decimal;
};
type DirectionWhere = {
    fromLocationId?: string | null | { not: string | null };
    toLocationId?: string | null | { not: string | null };
    OR?: DirectionWhere[];
};
const period = { startDate: '2026-09-01', endDate: '2026-09-30' };
const product = (id: string, unit = 'KG') => ({ id, skuCode: id, name: `Barang ${id}`, primaryUnit: unit });
const move = (qty: string, from: string | null, to: string | null, date: string, id = 'A'): Movement => ({
    productVariantId: id, quantity: new Prisma.Decimal(qty), fromLocationId: from,
    toLocationId: to, createdAt: new Date(date),
});

function mockMovements(movements: Movement[]) {
    const matches = (movement: Movement, where: DirectionWhere): boolean => {
        for (const key of ['fromLocationId', 'toLocationId'] as const) {
            const condition = where[key];
            if (condition === undefined) continue;
            if (condition !== null && typeof condition === 'object') {
                // SQL nullable NOT excludes null, unless explicitly included via OR.
                if (movement[key] === null || movement[key] === condition.not) return false;
            } else if (movement[key] !== condition) return false;
        }
        return !where.OR || where.OR.some((part) => matches(movement, part));
    };
    db.groupBy.mockImplementation(async ({ where }: {
        where: DirectionWhere & { createdAt: { lt: Date; gte?: Date } };
    }) => {
        const sums = new Map<string, Prisma.Decimal>();
        for (const movement of movements) {
            if (movement.createdAt >= where.createdAt.lt) continue;
            if (where.createdAt.gte && movement.createdAt < where.createdAt.gte) continue;
            if (!matches(movement, where)) continue;
            sums.set(movement.productVariantId, (sums.get(movement.productVariantId) ?? new Prisma.Decimal(0)).plus(movement.quantity));
        }
        return [...sums].map(([productVariantId, quantity]) => ({ productVariantId, _sum: { quantity } }));
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    db.transaction.mockImplementation(async (callback) => callback({
        location: { findMany: db.locations },
        productVariant: { findMany: db.products },
        stockMovement: { groupBy: db.groupBy },
    }));
    db.locations.mockResolvedValue([{ id: 'L1', name: 'Gudang A' }, { id: 'L2', name: 'Gudang B' }]);
    db.products.mockResolvedValue([product('A'), product('B', 'PCS')]);
    mockMovements([]);
});
afterEach(() => vi.useRealTimers());

describe('quantity stock balance', () => {
    it('recaps multiple products globally, ignoring internal and self transfers', async () => {
        mockMovements([
            move('100', null, 'L1', '2026-08-31T16:59:59.999Z'),
            move('20', 'L1', null, '2026-08-31T16:59:59.999Z'),
            move('10', 'L1', 'L2', '2026-08-15T00:00:00Z'),
            move('30', null, 'L2', '2026-09-10T00:00:00Z'),
            move('15', 'L1', null, '2026-09-20T00:00:00Z'),
            move('50', 'L1', 'L2', '2026-09-20T00:00:00Z'),
            move('12', 'L1', 'L1', '2026-09-20T00:00:00Z'),
            move('99', null, null, '2026-09-20T00:00:00Z'),
            move('3', null, 'L1', '2026-09-20T00:00:00Z', 'B'),
        ]);
        const result = await getStockBalance(period);
        expect(result.rows[0]).toEqual({
            productVariantId: 'A', skuCode: 'A', name: 'Barang A', unit: 'KG',
            openingStock: 80, totalIn: 30, totalOut: 15, closingStock: 95,
        });
        expect(result.rows[1]).toMatchObject({ unit: 'PCS', closingStock: 3 });
        expect(db.groupBy).toHaveBeenCalledTimes(4);
        expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
        expect(result).not.toHaveProperty('totalQuantity');
    });

    it('counts both directions for selected location including receipts, returns and adjustments', async () => {
        mockMovements([
            move('100', null, 'L1', '2026-08-20T00:00:00Z'),
            move('30', 'L1', 'L2', '2026-08-20T00:00:00Z'),
            move('10', 'L2', 'L1', '2026-09-10T00:00:00Z'),
            move('2', null, 'L1', '2026-09-10T00:00:00Z'),
            move('4', 'L1', null, '2026-09-10T00:00:00Z'),
            move('6', 'L1', 'L2', '2026-09-10T00:00:00Z'),
            move('50', 'L1', 'L1', '2026-09-10T00:00:00Z'),
            move('99', null, 'L2', '2026-09-10T00:00:00Z'),
        ]);
        const result = await getStockBalance({ ...period, locationId: ' L1 ' });
        expect(result.locationId).toBe('L1');
        expect(result.rows[0]).toMatchObject({ openingStock: 70, totalIn: 12, totalOut: 10, closingStock: 72 });
        expect(db.products.mock.calls[0][0].where.OR).toEqual([
            { inventories: { some: { locationId: 'L1' } } },
            { movements: { some: { createdAt: { lt: new Date('2026-09-30T17:00:00Z') }, OR: [{ fromLocationId: 'L1' }, { toLocationId: 'L1' }] } } },
        ]);
    });

    it('uses WIB inclusive days and excludes the next midnight regardless of process timezone', async () => {
        mockMovements([
            move('1', null, 'L1', '2026-08-31T16:59:59.999Z'),
            move('2', null, 'L1', '2026-08-31T17:00:00Z'),
            move('4', null, 'L1', '2026-09-01T16:59:59.999Z'),
            move('8', null, 'L1', '2026-09-01T17:00:00Z'),
        ]);
        const result = await getStockBalance({ startDate: '2026-09-01', endDate: '2026-09-01' });
        expect(result.rows[0]).toMatchObject({ openingStock: 1, totalIn: 6, closingStock: 7 });
    });

    it('defaults to current month-to-date in WIB at month rollover', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-31T18:00:00Z'));
        const result = await getStockBalance();
        expect(result).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-01', locationId: '' });
    });

    it('preserves decimal arithmetic, negative balances and zero-stock products', async () => {
        mockMovements([
            move('0.1', null, 'L1', '2026-08-10T00:00:00Z'),
            move('0.2', null, 'L1', '2026-09-10T00:00:00Z'),
            move('0.3001', 'L1', null, '2026-09-10T00:00:00Z'),
        ]);
        const result = await getStockBalance(period);
        expect(result.rows[0].closingStock).toBe(-0.0001);
        expect(result.rows[1]).toMatchObject({ openingStock: 0, totalIn: 0, totalOut: 0, closingStock: 0 });
    });

    it('keeps archived history, excludes fixed assets and never queries price/current quantity', async () => {
        await getStockBalance(period);
        expect(db.products).toHaveBeenCalledWith({
            where: { product: { productType: { not: 'FIXED_ASSET' } } },
            select: { id: true, skuCode: true, name: true, primaryUnit: true },
            orderBy: { skuCode: 'asc' },
        });
        for (const [args] of db.groupBy.mock.calls) {
            expect(args._sum).toEqual({ quantity: true });
            expect(args.where.productVariant).toEqual({ product: { productType: { not: 'FIXED_ASSET' } } });
        }
    });

    it('handles empty database and null aggregate defensively', async () => {
        db.groupBy.mockResolvedValue([{ productVariantId: 'A', _sum: { quantity: null } }]);
        expect((await getStockBalance(period)).rows[0].closingStock).toBe(0);
        db.products.mockResolvedValue([]);
        expect((await getStockBalance(period)).rows).toEqual([]);
    });

    it.each([
        { startDate: '2026-02-30' }, { endDate: '09/30/2026' }, { startDate: '' },
        { startDate: '2026-10-01', endDate: '2026-09-01' },
    ])('rejects invalid period before reading database: %j', async (invalid) => {
        await expect(getStockBalance({ ...period, ...invalid })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
        expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects unknown locations rather than silently showing global results', async () => {
        await expect(getStockBalance({ ...period, locationId: 'unknown' })).rejects.toThrow('Gudang/lokasi tidak ditemukan');
        expect(db.groupBy).not.toHaveBeenCalled();
    });

    it('propagates database failures, never substituting zero balances', async () => {
        db.groupBy.mockRejectedValue(new Error('database unavailable'));
        await expect(getStockBalance(period)).rejects.toThrow('database unavailable');
    });
});
