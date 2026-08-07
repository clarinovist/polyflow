import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
    class MockNextResponse {
        _body: unknown;
        status: number;
        constructor(body?: unknown, init?: { status?: number }) {
            this._body = body;
            this.status = init?.status ?? 200;
        }
        async json() {
            return this._body;
        }
        static json(body: unknown, init?: { status?: number }) {
            return new MockNextResponse(body, init);
        }
    }
    return { NextResponse: MockNextResponse };
});

vi.mock('@/lib/core/tenant', () => ({
    withTenantRoute: (handler: (req: Request) => unknown) => handler,
}));

vi.mock('@/lib/tools/api-auth', () => ({
    requireApiRoles: vi.fn(async () => ({ response: null, userId: 'user-1' })),
}));

const mockPrisma = vi.hoisted(() => ({
    productVariant: { findMany: vi.fn() },
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: mockPrisma,
}));

import { GET } from '../route';

const BASE_URL = 'http://localhost/api/products/variants';

function makeVariant(overrides: Record<string, unknown> = {}) {
    return {
        id: 'variant-1',
        skuCode: 'SKU-1',
        name: 'Roll HD Ungu',
        product: { name: 'Roll HD', productType: 'FINISHED_GOOD' },
        ...overrides,
    };
}

/** `withTenantRoute` is mocked away, so the handler takes a plain Request here. */
async function invokeGet(query = '') {
    return (await GET(
        new Request(`${BASE_URL}${query}`) as never,
    )) as unknown as { json: () => Promise<unknown> };
}

/** Runs the handler against an empty result set and returns the Prisma args. */
async function callGet(query = '') {
    mockPrisma.productVariant.findMany.mockResolvedValueOnce([]);
    await invokeGet(query);
    return mockPrisma.productVariant.findMany.mock.calls[0][0];
}

describe('GET /api/products/variants', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('filters by the productionBoms relation, not the non-existent boms relation', async () => {
        // Arrange + Act
        const args = await callGet('?hasBom=true');

        // Assert
        expect(args.where.productionBoms).toEqual({
            some: { isActive: true, archivedAt: null },
        });
        expect(args.where).not.toHaveProperty('boms');
        expect(args.select).not.toHaveProperty('boms');
        expect(args.select._count.select).toHaveProperty('productionBoms');
    });

    it('keeps the product type filter when hasBom is also set', async () => {
        // Arrange + Act
        const args = await callGet('?hasBom=true&type=FINISHED_GOOD,WIP');

        // Assert
        expect(args.where.product).toEqual({
            productType: { in: ['FINISHED_GOOD', 'WIP'] },
        });
        expect(args.where.productionBoms).toBeDefined();
    });

    it('drops unknown product types instead of passing them to Prisma', async () => {
        // Arrange + Act
        const args = await callGet('?type=FINISHED_GOOD,NOT_A_TYPE');

        // Assert
        expect(args.where.product).toEqual({
            productType: { in: ['FINISHED_GOOD'] },
        });
    });

    it('omits the product filter entirely when no valid type is given', async () => {
        // Arrange + Act
        const args = await callGet('?type=NOT_A_TYPE');

        // Assert
        expect(args.where).not.toHaveProperty('product');
    });

    it('searches sku and name case-insensitively', async () => {
        // Arrange + Act
        const args = await callGet('?q=ungu');

        // Assert
        expect(args.where.OR).toEqual([
            { skuCode: { contains: 'ungu', mode: 'insensitive' } },
            { name: { contains: 'ungu', mode: 'insensitive' } },
        ]);
    });

    it('skips bom selection when neither hasBom nor includeBomCount is set', async () => {
        // Arrange + Act
        const args = await callGet();

        // Assert
        expect(args.select).not.toHaveProperty('productionBoms');
        expect(args.select).not.toHaveProperty('_count');
    });

    it('maps productionBoms onto the bomCount/boms response contract', async () => {
        // Arrange
        const boms = [
            {
                id: 'bom-1',
                name: 'BOM A',
                isDefault: true,
                outputQuantity: 1,
            },
        ];
        mockPrisma.productVariant.findMany.mockResolvedValueOnce([
            makeVariant({ _count: { productionBoms: 1 }, productionBoms: boms }),
        ]);

        // Act
        const res = await invokeGet('?hasBom=true');
        const body = await res.json();

        // Assert
        expect(body).toEqual([
            {
                id: 'variant-1',
                skuCode: 'SKU-1',
                name: 'Roll HD Ungu',
                product: { name: 'Roll HD', productType: 'FINISHED_GOOD' },
                bomCount: 1,
                boms,
            },
        ]);
    });

    it('returns variants without bom fields when counts are not requested', async () => {
        // Arrange
        mockPrisma.productVariant.findMany.mockResolvedValueOnce([
            makeVariant(),
        ]);

        // Act
        const res = await invokeGet();
        const body = await res.json();

        // Assert
        expect(body).toEqual([
            {
                id: 'variant-1',
                skuCode: 'SKU-1',
                name: 'Roll HD Ungu',
                product: { name: 'Roll HD', productType: 'FINISHED_GOOD' },
            },
        ]);
    });

    it('returns the auth response without querying when the caller lacks a role', async () => {
        // Arrange
        const { requireApiRoles } = await import('@/lib/tools/api-auth');
        const denied = { status: 403 };
        vi.mocked(requireApiRoles).mockResolvedValueOnce({
            response: denied,
        } as never);

        // Act
        const res = await invokeGet();

        // Assert
        expect(res).toBe(denied);
        expect(mockPrisma.productVariant.findMany).not.toHaveBeenCalled();
    });
});
