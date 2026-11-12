import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        productVariant: { findUnique: vi.fn() },
        inventory: { findMany: vi.fn() },
        batch: { findMany: vi.fn() },
        bom: { findMany: vi.fn() },
        bomItem: { findMany: vi.fn() },
        costHistory: { findMany: vi.fn() },
        stockReservation: { findMany: vi.fn() },
        stockMovement: { findMany: vi.fn() },
    },
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            return { success: true as const, data: await fn() };
        } catch (e) {
            return {
                success: false as const,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    },
    AuthorizationError: class AuthorizationError extends Error {},
}));

import { requireAuth } from '@/lib/tools/auth-checks';
import {
    getProduct360Overview,
    listCostHistoryByProductVariant,
    listRecentMovementsByProductVariant,
    listStockByLocation,
} from '../product-360';

const asMock = (fn: unknown) => vi.mocked(fn as (...args: never[]) => unknown);

const sessionFor = (role: string, roles: string[] = [role]) => ({
    user: { id: 'u-1', role, roles },
});

const variantRow = {
    id: 'v-1',
    name: 'Varian Uji',
    skuCode: 'SKU-1',
    price: 1000,
    buyPrice: 800,
    sellPrice: 1200,
    standardCost: 750,
};

function seedOverviewData() {
    mockPrisma.productVariant.findUnique.mockResolvedValue(variantRow);
    mockPrisma.inventory.findMany.mockResolvedValue([
        { id: 'i-1', quantity: 10, averageCost: 500 },
    ]);
    mockPrisma.batch.findMany.mockResolvedValue([{ id: 'b-1' }]);
    mockPrisma.bom.findMany.mockResolvedValue([]);
    mockPrisma.bomItem.findMany.mockResolvedValue([]);
    mockPrisma.costHistory.findMany.mockResolvedValue([
        { id: 'c-1', newCost: 500 },
    ]);
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
}

describe('product 360 actions: valuation redaction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getProduct360Overview', () => {
        it('redacts prices, valuation and cost history for read-only FACTORY_MANAGER', async () => {
            asMock(requireAuth).mockResolvedValue(
                sessionFor('FACTORY_MANAGER'),
            );
            seedOverviewData();

            const result = await getProduct360Overview('v-1');

            expect(result.success).toBe(true);
            const data = (
                result as unknown as {
                    data: {
                        totalQty: number;
                        totalValue: number;
                        variant: Record<string, unknown>;
                        inventories: { averageCost: unknown }[];
                        costHistory: unknown[];
                        batches: unknown[];
                    };
                }
            ).data;
            expect(data.totalQty).toBe(10);
            expect(data.totalValue).toBe(0);
            expect(data.variant).toMatchObject({
                name: 'Varian Uji',
                price: null,
                buyPrice: null,
                sellPrice: null,
                standardCost: null,
            });
            expect(data.inventories[0].averageCost).toBeNull();
            expect(data.costHistory).toEqual([]);
            expect(data.batches).toHaveLength(1);
        });

        it.each([
            ['PLANNING', ['PLANNING']],
            ['WAREHOUSE', ['WAREHOUSE']],
            ['FACTORY_MANAGER', ['FACTORY_MANAGER', 'ADMIN']],
        ])('keeps valuation for %s %j', async (role, roles) => {
            asMock(requireAuth).mockResolvedValue(sessionFor(role, roles));
            seedOverviewData();

            const result = await getProduct360Overview('v-1');

            const data = (
                result as unknown as {
                    data: {
                        totalValue: number;
                        variant: { standardCost: number };
                        costHistory: unknown[];
                    };
                }
            ).data;
            expect(data.totalValue).toBe(5000);
            expect(data.variant.standardCost).toBe(750);
            expect(data.costHistory).toHaveLength(1);
        });
    });

    describe('listStockByLocation', () => {
        it('nulls average cost for read-only FACTORY_MANAGER', async () => {
            asMock(requireAuth).mockResolvedValue(
                sessionFor('FACTORY_MANAGER'),
            );
            mockPrisma.inventory.findMany.mockResolvedValue([
                { id: 'i-1', quantity: 4, averageCost: 123 },
            ]);

            const result = await listStockByLocation('v-1');

            expect(result).toEqual({
                success: true,
                data: [{ id: 'i-1', quantity: 4, averageCost: null }],
            });
        });

        it('returns average cost untouched for other roles', async () => {
            asMock(requireAuth).mockResolvedValue(sessionFor('WAREHOUSE'));
            mockPrisma.inventory.findMany.mockResolvedValue([
                { id: 'i-1', quantity: 4, averageCost: 123 },
            ]);

            const result = await listStockByLocation('v-1');

            expect(result).toEqual({
                success: true,
                data: [{ id: 'i-1', quantity: 4, averageCost: 123 }],
            });
        });
    });

    describe('listCostHistoryByProductVariant', () => {
        it('returns an empty list without querying for read-only FACTORY_MANAGER', async () => {
            asMock(requireAuth).mockResolvedValue(
                sessionFor('FACTORY_MANAGER'),
            );

            const result = await listCostHistoryByProductVariant('v-1');

            expect(result).toEqual({ success: true, data: [] });
            expect(mockPrisma.costHistory.findMany).not.toHaveBeenCalled();
        });

        it('returns cost history for other roles', async () => {
            asMock(requireAuth).mockResolvedValue(sessionFor('FINANCE'));
            mockPrisma.costHistory.findMany.mockResolvedValue([
                { id: 'c-1', newCost: 500 },
            ]);

            const result = await listCostHistoryByProductVariant('v-1');

            expect(result).toEqual({
                success: true,
                data: [{ id: 'c-1', newCost: 500 }],
            });
        });
    });

    describe('listRecentMovementsByProductVariant', () => {
        it('nulls movement cost for read-only FACTORY_MANAGER', async () => {
            asMock(requireAuth).mockResolvedValue(
                sessionFor('FACTORY_MANAGER'),
            );
            mockPrisma.stockMovement.findMany.mockResolvedValue([
                { id: 'm-1', quantity: 2, cost: 77 },
            ]);

            const result = await listRecentMovementsByProductVariant('v-1');

            expect(result).toEqual({
                success: true,
                data: [{ id: 'm-1', quantity: 2, cost: null }],
            });
        });

        it('returns movement cost untouched for other roles', async () => {
            asMock(requireAuth).mockResolvedValue(sessionFor('WAREHOUSE'));
            mockPrisma.stockMovement.findMany.mockResolvedValue([
                { id: 'm-1', quantity: 2, cost: 77 },
            ]);

            const result = await listRecentMovementsByProductVariant('v-1');

            expect(result).toEqual({
                success: true,
                data: [{ id: 'm-1', quantity: 2, cost: 77 }],
            });
        });
    });
});
