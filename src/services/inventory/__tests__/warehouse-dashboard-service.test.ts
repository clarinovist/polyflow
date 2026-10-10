import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('@/lib/core/prisma', () => ({
    prisma: { productVariant: { findMany } },
}));

import { readWarehouseInventoryThresholdSnapshot } from '../warehouse-dashboard-service';

const decimal = (value: number) => ({ toNumber: () => value });
const location = (locationType: string, locationPurpose: string) => ({
    locationType,
    locationPurpose,
});

function variant({
    id,
    threshold = 10,
    reorderPoint = 8,
    unit = 'KG',
    inventories = [],
}: {
    id: string;
    threshold?: number | null;
    reorderPoint?: number | null;
    unit?: string;
    inventories?: Array<{
        quantity: ReturnType<typeof decimal> | number;
        location: ReturnType<typeof location> | null;
    }>;
}) {
    return {
        id,
        name: `Varian ${id}`,
        skuCode: `SKU-${id}`,
        primaryUnit: unit,
        minStockAlert: threshold == null ? null : decimal(threshold),
        reorderPoint: reorderPoint == null ? null : decimal(reorderPoint),
        inventories,
    };
}

describe('readWarehouseInventoryThresholdSnapshot', () => {
    beforeEach(() => vi.resetAllMocks());

    it('uses one archived-filtered canonical read for counts and drivers', async () => {
        findMany.mockResolvedValue([
            variant({
                id: 'mixed-scope',
                threshold: 50,
                reorderPoint: 40,
                inventories: [
                    {
                        quantity: decimal(5),
                        location: location('INTERNAL', 'RAW_MATERIAL'),
                    },
                    {
                        quantity: decimal(3),
                        location: location('INTERNAL', 'FINISHED_GOOD'),
                    },
                    {
                        quantity: decimal(100),
                        location: location('INTERNAL', 'WIP'),
                    },
                    {
                        quantity: decimal(100),
                        location: location('INTERNAL', 'SCRAP'),
                    },
                    {
                        quantity: decimal(100),
                        location: location('INTERNAL', 'GENERAL_PURPOSE'),
                    },
                    {
                        quantity: decimal(100),
                        location: location('CUSTOMER_OWNED', 'RAW_MATERIAL'),
                    },
                ],
            }),
            variant({
                id: 'enough',
                threshold: 5,
                reorderPoint: 4,
                inventories: [
                    {
                        quantity: decimal(5),
                        location: location('INTERNAL', 'RAW_MATERIAL'),
                    },
                ],
            }),
        ]);

        const result = await readWarehouseInventoryThresholdSnapshot();

        expect(findMany).toHaveBeenCalledTimes(1);
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    archivedAt: null,
                    OR: [
                        { minStockAlert: { gt: 0 } },
                        { reorderPoint: { gt: 0 } },
                    ],
                },
            }),
        );
        expect(result).toMatchObject({
            lowStockCount: 1,
            reorderCount: 1,
            lowStockDrivers: [
                {
                    id: 'mixed-scope',
                    eligibleQuantity: 8,
                    threshold: 50,
                    unit: 'KG',
                    shortageRatio: 0.84,
                },
            ],
        });
    });

    it('matches canonical low-stock and reorder consumers on the same fixture', async () => {
        const variants = [
            variant({
                id: 'canonical-low',
                threshold: 20,
                reorderPoint: 15,
                inventories: [
                    {
                        quantity: decimal(3),
                        location: location('INTERNAL', 'RAW_MATERIAL'),
                    },
                    {
                        quantity: decimal(100),
                        location: location('INTERNAL', 'WIP'),
                    },
                ],
            }),
            variant({
                id: 'canonical-safe',
                threshold: 5,
                reorderPoint: 4,
                inventories: [
                    {
                        quantity: decimal(5),
                        location: location('INTERNAL', 'FINISHED_GOOD'),
                    },
                ],
            }),
        ];
        findMany.mockResolvedValue(variants);
        const { isInventoryThresholdTriggered } =
            await import('@/lib/constants/locations');

        const result = await readWarehouseInventoryThresholdSnapshot();
        const canonicalLowStockCount = variants.filter((item) =>
            isInventoryThresholdTriggered(item.inventories, item.minStockAlert),
        ).length;
        const canonicalReorderCount = variants.filter((item) =>
            isInventoryThresholdTriggered(item.inventories, item.reorderPoint),
        ).length;

        expect(result.lowStockCount).toBe(canonicalLowStockCount);
        expect(result.reorderCount).toBe(canonicalReorderCount);
    });

    it('ranks normalized severity, resolves ties by id, and takes a stable top five', async () => {
        findMany.mockResolvedValue([
            variant({
                id: 'z-tie',
                threshold: 1000,
                unit: 'PCS',
                inventories: [
                    {
                        quantity: decimal(500),
                        location: location('INTERNAL', 'FINISHED_GOOD'),
                    },
                ],
            }),
            variant({
                id: 'a-tie',
                threshold: 10,
                unit: 'KG',
                inventories: [
                    {
                        quantity: decimal(5),
                        location: location('INTERNAL', 'RAW_MATERIAL'),
                    },
                ],
            }),
            variant({ id: 'most-severe', threshold: 10, unit: 'M' }),
            variant({
                id: 'medium',
                threshold: 10,
                unit: 'L',
                inventories: [
                    {
                        quantity: decimal(4),
                        location: location('INTERNAL', 'RAW_MATERIAL'),
                    },
                ],
            }),
            variant({
                id: 'less-1',
                threshold: 10,
                inventories: [
                    {
                        quantity: decimal(6),
                        location: location('INTERNAL', 'RAW_MATERIAL'),
                    },
                ],
            }),
            variant({
                id: 'less-2',
                threshold: 10,
                inventories: [
                    {
                        quantity: decimal(7),
                        location: location('INTERNAL', 'RAW_MATERIAL'),
                    },
                ],
            }),
            variant({
                id: 'least',
                threshold: 10,
                inventories: [
                    {
                        quantity: decimal(9),
                        location: location('INTERNAL', 'RAW_MATERIAL'),
                    },
                ],
            }),
        ]);

        const result = await readWarehouseInventoryThresholdSnapshot();

        expect(result.lowStockCount).toBe(7);
        expect(result.lowStockDrivers.map((driver) => driver.id)).toEqual([
            'most-severe',
            'medium',
            'a-tie',
            'z-tie',
            'less-1',
        ]);
        expect(result.lowStockDrivers.map((driver) => driver.unit)).toEqual([
            'M',
            'L',
            'KG',
            'PCS',
            'KG',
        ]);
    });

    it('returns valid zero counts and an empty available driver population', async () => {
        findMany.mockResolvedValue([]);

        await expect(
            readWarehouseInventoryThresholdSnapshot(),
        ).resolves.toEqual({
            lowStockCount: 0,
            reorderCount: 0,
            lowStockDrivers: [],
        });
    });
});
