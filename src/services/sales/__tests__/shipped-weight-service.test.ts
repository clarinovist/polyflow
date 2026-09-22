import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type SalesOrderStatus, type Unit } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { getShippedWeightStats } from '../shipped-weight-service';

vi.mock('@/lib/core/prisma', () => ({
    prisma: { salesOrder: { findMany: vi.fn() } },
}));

const decimal = (value: string | number) => new Prisma.Decimal(value);
const line = (
    quantity: string | number,
    primaryUnit: Unit = 'KG',
    enteredUnit: Unit | null = null,
    factor: number | null = null,
    productVariantId = 'variant-1',
) => ({
    productVariantId,
    quantity: decimal(quantity),
    enteredUnit,
    conversionFactorSnapshot: factor == null ? null : decimal(factor),
    productVariant: { primaryUnit },
});
const order = (
    deliveries: ReturnType<typeof line>[][],
    status: SalesOrderStatus = 'READY_TO_SHIP',
    ordered = 1000,
    delivered = 0,
) => ({
    status,
    items: [{ productVariantId: 'variant-1', quantity: decimal(ordered), deliveredQty: decimal(delivered) }],
    deliveryOrders: deliveries.map((items) => ({ items })),
});
function records(orders: ReturnType<typeof order>[]) {
    vi.mocked(prisma.salesOrder.findMany).mockResolvedValue(orders as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    records([]);
});

describe('getShippedWeightStats', () => {
    it('scopes physical shipments to SO dates/customer and excludes cancelled orders and unshipped DOs', async () => {
        const scope = {
            customerId: 'customer-1',
            orderDate: {
                gte: new Date('2026-08-31T17:00:00.000Z'),
                lte: new Date('2026-09-30T16:59:59.999Z'),
            },
        };
        await getShippedWeightStats(scope);
        const query = vi.mocked(prisma.salesOrder.findMany).mock.calls[0][0]!;
        expect(query.where).toMatchObject({
            AND: [scope, { status: { not: 'CANCELLED' } }],
            items: { some: { productVariant: { product: { productType: { not: 'SERVICE' } } } } },
            OR: [
                { status: { in: ['SHIPPED', 'DELIVERED'] } },
                { items: { some: { deliveredQty: { gt: 0 } } } },
                { deliveryOrders: { some: { status: { in: ['SHIPPED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'RETURNED'] } } } },
            ],
        });
        expect(query.select).toMatchObject({
            deliveryOrders: {
                where: { status: { in: ['SHIPPED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'RETURNED'] } },
                select: { items: {
                    where: { productVariant: { product: { productType: { not: 'SERVICE' } } } },
                } },
            },
        });
        const encoded = JSON.stringify(query);
        expect(encoded).not.toContain('deliveryDate');
        expect(encoded).not.toContain('stockCommittedAt');
        expect(encoded).not.toContain('estimatedWeightKg');
        expect(encoded).not.toContain('isFreeItem'); // physical freebies count too
        expect(prisma.salesOrder.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns a real zero for no shipments (including service-only orders filtered by query)', async () => {
        expect(await getShippedWeightStats({ customerId: { not: null } })).toEqual({
            shippedWeightKg: 0, shippedOrderCount: 0, unconvertedItemCount: 0, incompleteOrderCount: 0,
        });
    });

    it('counts only the 400 kg dispatched from a 1000 kg SO still READY_TO_SHIP', async () => {
        // PENDING/LOADING/CANCELLED DOs are excluded by the query, not by SO status.
        records([order([[line(400)]], 'READY_TO_SHIP', 1000, 400)]);
        expect(await getShippedWeightStats({})).toEqual({
            shippedWeightKg: 400, shippedOrderCount: 1, unconvertedItemCount: 0, incompleteOrderCount: 0,
        });
    });

    it.each(['SHIPPED', 'DELIVERED'] as const)('counts multiple DOs once per SO in %s without adding deliveredQty again', async (status) => {
        records([order([[line(400)], [line(600)]], status, 1000, 1000)]);
        expect(await getShippedWeightStats({})).toEqual({
            shippedWeightKg: 1000, shippedOrderCount: 1, unconvertedItemCount: 0, incompleteOrderCount: 0,
        });
    });

    it('uses final normalized quantities even for legacy shipments without verification/commit markers', async () => {
        records([order([[line(200, 'KG', 'BAL', 25), line(100, 'KG', 'ROLL', 5)]])]);
        expect((await getShippedWeightStats({})).shippedWeightKg).toBe(300);
    });

    it('converts a non-KG primary unit only with a historical entered-KG snapshot', async () => {
        records([order([[line(20, 'ROLL', 'KG', 0.5)]])]);
        expect(await getShippedWeightStats({})).toMatchObject({
            shippedWeightKg: 40, shippedOrderCount: 1, unconvertedItemCount: 0,
        });
    });

    it('does not round each line before summing or expose floating-point sum drift', async () => {
        records([order([[line('0.0049'), line('0.0049'), line('0.1'), line('0.2')]])]);
        expect((await getShippedWeightStats({})).shippedWeightKg).toBe(0.3098);
    });

    it('counts distinct contributing orders, not DOs or orders containing only unknown weight', async () => {
        records([
            order([[line(100)], [line(200)]]),
            order([[line(50)]]),
            order([[line(2, 'PCS')]]),
        ]);
        expect(await getShippedWeightStats({})).toMatchObject({
            shippedWeightKg: 350, shippedOrderCount: 2, unconvertedItemCount: 1,
        });
    });

    it.each([null, 0, -1])('reports non-KG without a usable conversion (%s) instead of guessing kg', async (factor) => {
        records([order([[line(10, 'BAL', 'KG', factor)]])]);
        expect(await getShippedWeightStats({})).toMatchObject({
            shippedWeightKg: 0, shippedOrderCount: 0, unconvertedItemCount: 1,
        });
    });

    it('does not count zero-load rows as a contributing order or a conversion problem', async () => {
        records([order([[line(0), line(0, 'PCS')]])]);
        expect(await getShippedWeightStats({})).toMatchObject({
            shippedWeightKg: 0, shippedOrderCount: 0, unconvertedItemCount: 0,
        });
    });

    it('reports invalid historical quantities instead of subtracting weight', async () => {
        records([order([[line(-5), line('NaN')]])]);
        expect(await getShippedWeightStats({})).toMatchObject({
            shippedWeightKg: 0, unconvertedItemCount: 2,
        });
    });

    it('flags completed and partially shipped legacy orders whose DO detail is missing', async () => {
        records([
            order([], 'SHIPPED', 1000, 0),
            order([], 'DELIVERED', 200, 200),
            order([], 'READY_TO_SHIP', 1000, 300),
        ]);
        expect(await getShippedWeightStats({})).toEqual({
            shippedWeightKg: 0, shippedOrderCount: 0, unconvertedItemCount: 0, incompleteOrderCount: 3,
        });
    });

    it('flags partially missing DO details without assuming all ordered kg have shipped', async () => {
        records([order([[line(400)]], 'DELIVERED', 1000, 1000)]);
        expect(await getShippedWeightStats({})).toMatchObject({
            shippedWeightKg: 400, incompleteOrderCount: 1,
        });
    });

    it('aggregates duplicate SO variants when checking completeness', async () => {
        const duplicate = order([[line(400)]], 'SHIPPED', 300, 300);
        duplicate.items.push({ productVariantId: 'variant-1', quantity: decimal(300), deliveredQty: decimal(300) });
        records([duplicate]);
        expect((await getShippedWeightStats({})).incompleteOrderCount).toBe(1);
    });

    it('does not subtract returned goods from gross outbound quantity', async () => {
        // RETURNED is explicitly included in the DO query; no return table is joined.
        records([order([[line(1000)]], 'READY_TO_SHIP', 1000, 800)]);
        expect(await getShippedWeightStats({})).toMatchObject({
            shippedWeightKg: 1000, incompleteOrderCount: 0,
        });
    });

    it('propagates database errors so callers can distinguish unavailable from zero', async () => {
        vi.mocked(prisma.salesOrder.findMany).mockRejectedValue(new Error('unavailable'));
        await expect(getShippedWeightStats({})).rejects.toThrow('unavailable');
    });
});
