import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(),
    productVariantFindMany: vi.fn(),
    bomFindFirst: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));
vi.mock('@/lib/auth/hpp-price-simulator-access', () => ({
    requireHppPriceSimulatorAccess: mocks.guard,
}));

import {
    getHppPriceSimulatorDefault,
    getHppPriceSimulatorVariantOptions,
} from '../hpp-price-simulator';
import {
    readHppPriceSimulatorDefault,
    readHppPriceSimulatorVariantOptions,
} from '../hpp-price-simulator-query';

const db = {
    productVariant: { findMany: mocks.productVariantFindMany },
    bom: { findFirst: mocks.bomFindFirst },
};

const decimal = (value: number) => ({ toNumber: () => value });

type DecimalTestValue = { toNumber: () => number } | null;

type TestBomRow = {
    id: string;
    name: string;
    outputQuantity: { toNumber: () => number };
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string;
    };
    items: Array<{
        id: string;
        productVariantId: string;
        quantity: { toNumber: () => number };
        scrapPercentage: { toNumber: () => number } | null;
        productVariant: {
            name: string;
            skuCode: string;
            primaryUnit: string;
            standardCost: DecimalTestValue;
            buyPrice: DecimalTestValue;
            inventories: Array<{
                quantity: { toNumber: () => number };
                averageCost: DecimalTestValue;
                location: { locationType: string };
            }>;
            price?: DecimalTestValue;
            sellPrice?: DecimalTestValue;
        };
    }>;
} & Record<string, unknown>;

function bomRow(overrides: Record<string, unknown> = {}): TestBomRow {
    return {
        id: 'bom-default',
        name: 'Default BOM',
        outputQuantity: decimal(100),
        productVariant: {
            id: 'variant-output',
            name: 'Finished Product',
            skuCode: 'FG-1',
            primaryUnit: 'PCS',
        },
        items: [
            {
                id: 'item-1',
                productVariantId: 'material-1',
                quantity: decimal(2),
                scrapPercentage: decimal(5),
                productVariant: {
                    name: 'Resin',
                    skuCode: 'RM-1',
                    primaryUnit: 'KG',
                    standardCost: decimal(90),
                    buyPrice: decimal(80),
                    inventories: [
                        {
                            quantity: decimal(10),
                            averageCost: decimal(100),
                            location: { locationType: 'INTERNAL' },
                        },
                        {
                            quantity: decimal(5),
                            averageCost: decimal(160),
                            location: { locationType: 'INTERNAL' },
                        },
                    ],
                },
            },
        ],
        ...overrides,
    };
}

function callDefault(productVariantId = 'variant-output') {
    return getHppPriceSimulatorDefault(productVariantId);
}

describe('HPP price simulator dedicated read', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({ db, userId: 'admin-1', roles: ['ADMIN'] });
        mocks.productVariantFindMany.mockResolvedValue([]);
        mocks.bomFindFirst.mockResolvedValue(null);
    });

    it('guards both dedicated reads before business queries', async () => {
        mocks.guard.mockRejectedValue(new Error('denied'));

        await expect(getHppPriceSimulatorVariantOptions()).resolves.toMatchObject({
            success: false,
        });
        await expect(callDefault()).resolves.toMatchObject({ success: false });
        expect(mocks.productVariantFindMany).not.toHaveBeenCalled();
        expect(mocks.bomFindFirst).not.toHaveBeenCalled();
    });

    it('lists only variants with an active, unarchived default BOM using a minimal projection', async () => {
        mocks.productVariantFindMany.mockResolvedValue([
            {
                id: 'variant-output',
                name: 'Finished Product',
                skuCode: 'FG-1',
                primaryUnit: 'PCS',
                productionBoms: [
                    {
                        id: 'bom-default',
                        name: 'Default BOM',
                        outputQuantity: decimal(100),
                    },
                ],
            },
        ]);

        await expect(getHppPriceSimulatorVariantOptions()).resolves.toEqual({
            success: true,
            data: [
                {
                    id: 'variant-output',
                    name: 'Finished Product',
                    skuCode: 'FG-1',
                    primaryOutputUnit: 'PCS',
                    defaultBom: {
                        id: 'bom-default',
                        name: 'Default BOM',
                        outputQuantity: 100,
                    },
                },
            ],
        });
        expect(mocks.productVariantFindMany).toHaveBeenCalledWith({
            where: {
                archivedAt: null,
                productionBoms: {
                    some: {
                        isActive: true,
                        isDefault: true,
                        archivedAt: null,
                    },
                },
            },
            select: {
                id: true,
                name: true,
                skuCode: true,
                primaryUnit: true,
                productionBoms: {
                    where: {
                        isActive: true,
                        isDefault: true,
                        archivedAt: null,
                    },
                    select: { id: true, name: true, outputQuantity: true },
                    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
                    take: 1,
                },
            },
            orderBy: [{ name: 'asc' }, { skuCode: 'asc' }],
        });
    });

    it('returns no option when the selected default BOM projection is absent', async () => {
        mocks.productVariantFindMany.mockResolvedValue([
            {
                id: 'variant-no-bom',
                name: 'No BOM',
                skuCode: 'FG-0',
                primaryUnit: 'PCS',
                productionBoms: [],
            },
        ]);

        await expect(
            readHppPriceSimulatorVariantOptions(db as never),
        ).resolves.toEqual([]);
    });

    it('queries one active/default BOM for the requested variant and returns minimal material defaults', async () => {
        mocks.bomFindFirst.mockResolvedValue(bomRow());

        const result = await callDefault();

        expect(result).toMatchObject({
            success: true,
            data: {
                variant: {
                    id: 'variant-output',
                    primaryOutputUnit: 'PCS',
                },
                bom: {
                    id: 'bom-default',
                    name: 'Default BOM',
                    outputQuantity: {
                        mode: 'default',
                        defaultSnapshot: {
                            value: 100,
                            metadata: { source: 'bom' },
                        },
                    },
                },
                materials: [
                    {
                        id: 'item-1',
                        productVariantId: 'material-1',
                        primaryUnit: 'KG',
                        quantity: {
                            defaultSnapshot: { value: 2 },
                        },
                        scrapPercentage: {
                            defaultSnapshot: { value: 5 },
                        },
                        unitCost: {
                            defaultSnapshot: {
                                value: 120,
                                metadata: { source: 'inventory_average' },
                            },
                        },
                        costSource: 'inventory_average',
                    },
                ],
            },
        });
        expect(mocks.bomFindFirst).toHaveBeenCalledWith({
            where: {
                productVariantId: 'variant-output',
                isActive: true,
                isDefault: true,
                archivedAt: null,
                productVariant: { archivedAt: null },
            },
            select: {
                id: true,
                name: true,
                outputQuantity: true,
                productVariant: {
                    select: {
                        id: true,
                        name: true,
                        skuCode: true,
                        primaryUnit: true,
                    },
                },
                items: {
                    select: {
                        id: true,
                        productVariantId: true,
                        quantity: true,
                        scrapPercentage: true,
                        productVariant: {
                            select: {
                                name: true,
                                skuCode: true,
                                primaryUnit: true,
                                standardCost: true,
                                buyPrice: true,
                                inventories: {
                                    select: {
                                        quantity: true,
                                        averageCost: true,
                                        location: {
                                            select: { locationType: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { id: 'asc' },
                },
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        });
        const queryText = JSON.stringify(mocks.bomFindFirst.mock.calls[0][0]);
        expect(queryText).not.toContain('sellPrice');
        expect(queryText).not.toContain('"price"');
        expect(queryText).not.toContain('dailyRate');
    });

    it.each([
        { name: 'no BOM', row: null },
        { name: 'inactive/non-default filtered by query', row: null },
    ])('returns null for $name', async ({ row }) => {
        mocks.bomFindFirst.mockResolvedValue(row);
        await expect(
            readHppPriceSimulatorDefault(db as never, 'variant-output'),
        ).resolves.toBeNull();
    });

    it('uses INTERNAL positive quantities, excludes CUSTOMER_OWNED/non-positive quantities, and retains warnings', async () => {
        const row = bomRow();
        row.items[0].productVariant.standardCost = decimal(150);
        row.items[0].productVariant.inventories = [
            {
                quantity: decimal(1),
                averageCost: decimal(330),
                location: { locationType: 'INTERNAL' },
            },
            {
                quantity: decimal(100),
                averageCost: decimal(1),
                location: { locationType: 'CUSTOMER_OWNED' },
            },
            {
                quantity: decimal(0),
                averageCost: null,
                location: { locationType: 'INTERNAL' },
            },
            {
                quantity: decimal(-1),
                averageCost: null,
                location: { locationType: 'INTERNAL' },
            },
        ] as never;
        mocks.bomFindFirst.mockResolvedValue(row);

        const result = await readHppPriceSimulatorDefault(
            db as never,
            'variant-output',
        );
        expect(result?.materials[0]).toMatchObject({
            costSource: 'inventory_average',
            unitCost: { defaultSnapshot: { value: 330 } },
            costCandidates: {
                inventoryAverage: {
                    status: 'selected',
                    positiveInternalRowCount: 1,
                    excludedCustomerOwnedRowCount: 1,
                    excludedNonPositiveQuantityRowCount: 2,
                    totalQuantity: 1,
                },
            },
            costWarnings: [
                'low_internal_stock',
                'inventory_standard_cost_gap',
                'low_stock_cost_outlier',
            ],
        });
    });

    it.each([null, 0, -1, Number.NaN, Infinity])(
        'invalidates all positive INTERNAL inventory for averageCost %s and falls back',
        async (invalidAverageCost) => {
            const row = bomRow();
            row.items[0].productVariant.inventories = [
                {
                    quantity: decimal(3),
                    averageCost: decimal(100),
                    location: { locationType: 'INTERNAL' },
                },
                {
                    quantity: decimal(1),
                    averageCost:
                        invalidAverageCost === null
                            ? null
                            : decimal(invalidAverageCost),
                    location: { locationType: 'INTERNAL' },
                },
            ];
            mocks.bomFindFirst.mockResolvedValue(row);

            const result = await readHppPriceSimulatorDefault(
                db as never,
                'variant-output',
            );
            expect(result?.materials[0]).toMatchObject({
                costSource: 'standard_cost',
                unitCost: { defaultSnapshot: { value: 90 } },
                costCandidates: {
                    inventoryAverage: {
                        status: 'invalid',
                        reason: 'invalid_positive_internal_average_cost',
                    },
                    standardCost: { status: 'selected', value: 90 },
                },
            });
        },
    );

    it('falls back to buyPrice then missing/null and cannot use selling prices', async () => {
        const buyPriceRow = bomRow();
        buyPriceRow.items[0].productVariant.inventories = [];
        buyPriceRow.items[0].productVariant.standardCost = null;
        buyPriceRow.items[0].productVariant.buyPrice = decimal(80);
        mocks.bomFindFirst.mockResolvedValueOnce(buyPriceRow);

        await expect(
            readHppPriceSimulatorDefault(db as never, 'variant-output'),
        ).resolves.toMatchObject({
            materials: [
                {
                    costSource: 'buy_price',
                    unitCost: { defaultSnapshot: { value: 80 } },
                },
            ],
        });

        const missingRow = bomRow();
        missingRow.items[0].productVariant.inventories = [];
        missingRow.items[0].productVariant.standardCost = null;
        missingRow.items[0].productVariant.buyPrice = null;
        Object.assign(missingRow.items[0].productVariant, {
            price: decimal(999),
            sellPrice: decimal(1_999),
        });
        mocks.bomFindFirst.mockResolvedValueOnce(missingRow);

        await expect(
            readHppPriceSimulatorDefault(db as never, 'variant-output'),
        ).resolves.toMatchObject({
            materials: [
                {
                    costSource: 'missing',
                    unitCost: { defaultSnapshot: { value: null } },
                },
            ],
        });
    });

    it('uses only the tenant-bound client returned by the guard and accepts no tenant selector', async () => {
        mocks.bomFindFirst.mockResolvedValue(bomRow());

        await callDefault('variant-output');

        expect(mocks.guard).toHaveBeenCalledTimes(1);
        expect(mocks.bomFindFirst).toHaveBeenCalledTimes(1);
        expect(getHppPriceSimulatorDefault).toHaveLength(1);
        expect(JSON.stringify(mocks.bomFindFirst.mock.calls)).not.toContain(
            'tenantId',
        );
    });

    it('rejects malformed variant ids before querying BOM data', async () => {
        const result = await callDefault("' OR 1=1");
        expect(result).toMatchObject({
            success: false,
            code: 'VALIDATION_ERROR',
        });
        expect(mocks.bomFindFirst).not.toHaveBeenCalled();
    });
});
