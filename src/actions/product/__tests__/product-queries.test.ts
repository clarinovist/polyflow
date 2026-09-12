import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { count, findMany, queryRaw, requireAuth } = vi.hoisted(() => ({
    count: vi.fn(),
    findMany: vi.fn(),
    queryRaw: vi.fn(),
    requireAuth: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: never[]) => unknown) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { productVariant: { count, findMany }, $queryRaw: queryRaw },
}));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth }));
vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            return { success: true as const, data: await fn() };
        } catch (error) {
            return {
                success: false as const,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
}));

import { getProductCatalogPage } from '../product-queries';

function variant(stock: number | string, skuCode = `SKU-${stock}`) {
    return {
        id: `variant-${stock}`,
        productId: 'product-1',
        name: `Variant ${stock}`,
        skuCode,
        primaryUnit: 'KG',
        salesUnit: null,
        conversionFactor: 1,
        price: 15000,
        standardCost: 9000,
        buyPrice: 10000,
        minStockAlert: 2,
        archivedAt: null,
        product: { name: 'Produk', productType: 'FINISHED_GOOD' },
        inventories: [
            {
                quantity: new Prisma.Decimal(stock),
                averageCost: new Prisma.Decimal('8000'),
            },
        ],
        _count: { inventories: 1 },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    count.mockResolvedValue(1);
    findMany.mockResolvedValue([variant(3)]);
    queryRaw.mockResolvedValue([]);
});

describe('getProductCatalogPage', () => {
    it('uses a dedicated bounded query with the default page size', async () => {
        const result = await getProductCatalogPage();

        expect(result).toMatchObject({
            success: true,
            data: { page: 1, pageSize: 50, total: 1, pageCount: 1 },
        });
        expect(requireAuth).toHaveBeenCalledOnce();
        expect(count).toHaveBeenCalledWith({ where: { archivedAt: null } });
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 0, take: 50 }),
        );
        expect(result.success && result.data.items[0]).toMatchObject({
            skuCode: 'SKU-3',
            stock: 3,
            currentCost: 8000,
            currentStockValue: 24000,
        });
    });

    it('keeps Decimal stock and value arithmetic exact until serialization', async () => {
        findMany.mockResolvedValue([
            {
                ...variant('0.3'),
                inventories: [
                    {
                        quantity: new Prisma.Decimal('0.1'),
                        averageCost: new Prisma.Decimal('0.2'),
                    },
                    {
                        quantity: new Prisma.Decimal('0.2'),
                        averageCost: new Prisma.Decimal('0.2'),
                    },
                ],
                _count: { inventories: 2 },
            },
        ]);

        const result = await getProductCatalogPage();

        expect(result.success && result.data.items[0]).toMatchObject({
            stock: 0.3,
            currentCost: 0.2,
            currentStockValue: 0.06,
        });
    });

    it('applies search, type, and archive filters before pagination', async () => {
        await getProductCatalogPage({
            search: ' rafia ',
            type: 'RAW_MATERIAL',
            includeArchived: true,
            page: 2,
            pageSize: 500,
            sort: 'price',
            direction: 'desc',
        });

        const where = count.mock.calls[0][0].where;
        expect(where).toMatchObject({
            product: { productType: 'RAW_MATERIAL' },
            OR: expect.arrayContaining([
                { skuCode: { contains: 'rafia', mode: 'insensitive' } },
                { name: { contains: 'rafia', mode: 'insensitive' } },
                {
                    product: {
                        name: { contains: 'rafia', mode: 'insensitive' },
                    },
                },
            ]),
        });
        expect(where).not.toHaveProperty('archivedAt');
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where,
                skip: 0,
                take: 100,
                orderBy: expect.arrayContaining([
                    { price: 'desc' },
                    { skuCode: 'asc' },
                ]),
            }),
        );
    });

    it('keeps computed-sort raw SQL search in parity with Prisma literal contains', async () => {
        count.mockResolvedValue(0);

        await getProductCatalogPage({ search: '50%_off', sort: 'stock' });

        const query = queryRaw.mock.calls[0][0] as {
            strings: readonly string[];
            values: readonly unknown[];
        };
        expect(query.strings.join('?')).toContain("ESCAPE E'\\\\'");
        expect(query.values).toContain(String.raw`%50\%\_off%`);
    });

    it('pages computed stock in the database before loading current-page details', async () => {
        count.mockResolvedValue(51);
        queryRaw.mockResolvedValue([{ id: 'variant-1' }]);
        findMany.mockResolvedValue([variant(1)]);

        const result = await getProductCatalogPage({
            page: 2,
            pageSize: 50,
            sort: 'stock',
            direction: 'desc',
        });

        expect(result).toMatchObject({
            success: true,
            data: { page: 2, pageSize: 50, total: 51, pageCount: 2 },
        });
        expect(result.success && result.data.items).toHaveLength(1);
        expect(result.success && result.data.items[0].stock).toBe(1);
        expect(queryRaw).toHaveBeenCalledOnce();
        const query = queryRaw.mock.calls[0][0];
        expect(query.strings.join(' ')).toContain('OFFSET');
        expect(query.values).toEqual(expect.arrayContaining([50, 50]));
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: { in: ['variant-1'] } } }),
        );
    });

    it('clamps invalid pages while keeping stable total and page counts', async () => {
        count.mockResolvedValue(120);
        findMany.mockResolvedValue([]);

        const result = await getProductCatalogPage({ page: 99, pageSize: 50 });

        expect(result).toMatchObject({
            success: true,
            data: { page: 3, pageSize: 50, total: 120, pageCount: 3 },
        });
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 100, take: 50 }),
        );
    });
});
