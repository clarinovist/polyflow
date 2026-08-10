import { describe, it, expect, vi, beforeEach } from 'vitest';

import { resolveMaterialSources } from '../material-source-resolver';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        location: { findMany: vi.fn() },
        inventory: { findMany: vi.fn() },
    },
}));

const LOCATIONS = [
    {
        id: 'rm',
        name: 'Gudang Bahan Baku',
        slug: 'gudang-bahan-baku',
        locationPurpose: 'RAW_MATERIAL',
    },
    {
        id: 'pack',
        name: 'Gudang Bahan Pembantu & Pengemas',
        slug: 'gudang-packaging',
        locationPurpose: 'PACKING',
    },
    {
        id: 'fg',
        name: 'Gudang Barang Jadi',
        slug: 'gudang-barang-jadi',
        locationPurpose: 'FINISHED_GOOD',
    },
    {
        id: 'wip',
        name: 'Gudang WIP & Intermediate',
        slug: 'gudang-wip-intermediate',
        locationPurpose: 'WIP',
    },
    {
        id: 'scrap',
        name: 'Gudang Scrap',
        slug: 'gudang-scrap',
        locationPurpose: 'SCRAP',
    },
];

/** Inventory rows use Decimal-like objects, matching Prisma's return shape */
function stockRow(productVariantId: string, locationId: string, qty: number) {
    return {
        productVariantId,
        locationId,
        quantity: { toNumber: () => qty },
    };
}

function mockDb(rows: ReturnType<typeof stockRow>[]) {
    vi.mocked(prisma.location.findMany).mockResolvedValue(
        LOCATIONS as never,
    );
    vi.mocked(prisma.inventory.findMany).mockResolvedValue(rows as never);
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('resolveMaterialSources', () => {
    it('sends each material to its own warehouse within one order', async () => {
        // Arrange — a packing order: supplies in the pengemas store, product in FG
        mockDb([
            stockRow('opp', 'pack', 1440),
            stockRow('karton', 'pack', 1407),
            stockRow('sedotan', 'fg', 873),
        ]);

        // Act
        const result = await resolveMaterialSources({
            materials: [
                {
                    productVariantId: 'opp',
                    productType: 'AUXILIARY',
                    requiredQty: 160,
                },
                {
                    productVariantId: 'karton',
                    productType: 'AUXILIARY',
                    requiredQty: 100,
                },
                {
                    productVariantId: 'sedotan',
                    productType: 'FINISHED_GOOD',
                    requiredQty: 700,
                },
            ],
            fallbackLocationId: 'fg',
        });

        // Assert
        expect(result.map((r) => r.sourceLocationId)).toEqual([
            'pack',
            'pack',
            'fg',
        ]);
        expect(result.every((r) => r.isShortage)).toBe(false);
    });

    it('does not report a shortage when stock sits in another warehouse', async () => {
        // Arrange — the packaging is stocked, just not where the order points
        mockDb([stockRow('opp', 'pack', 1440)]);

        // Act
        const [resolved] = await resolveMaterialSources({
            materials: [
                {
                    productVariantId: 'opp',
                    productType: 'AUXILIARY',
                    requiredQty: 160,
                },
            ],
            fallbackLocationId: 'fg',
        });

        // Assert — this is what kept opening packing orders as WAITING_MATERIAL
        expect(resolved.isShortage).toBe(false);
        expect(resolved.sourceLocationId).toBe('pack');
        expect(resolved.stockAtSource).toBe(1440);
    });

    it('reports a shortage only when no warehouse holds enough', async () => {
        // Arrange
        mockDb([stockRow('opp', 'pack', 50), stockRow('opp', 'rm', 40)]);

        // Act
        const [resolved] = await resolveMaterialSources({
            materials: [
                {
                    productVariantId: 'opp',
                    productType: 'AUXILIARY',
                    requiredQty: 200,
                },
            ],
            fallbackLocationId: 'fg',
        });

        // Assert
        expect(resolved.isShortage).toBe(true);
        expect(resolved.totalStock).toBe(90);
    });

    it('honours the caller location when it covers the requirement', async () => {
        // Arrange — the same auxiliary is stocked in both places
        mockDb([stockRow('aux', 'rm', 500), stockRow('aux', 'pack', 500)]);

        // Act
        const [resolved] = await resolveMaterialSources({
            materials: [
                {
                    productVariantId: 'aux',
                    productType: 'AUXILIARY',
                    requiredQty: 100,
                },
            ],
            fallbackLocationId: 'rm',
        });

        // Assert — an explicit choice wins over the type default
        expect(resolved.sourceLocationId).toBe('rm');
    });

    it('falls back to the fullest warehouse when neither default covers it', async () => {
        // Arrange — type default holds too little, an unrelated warehouse holds more
        mockDb([stockRow('aux', 'pack', 10), stockRow('aux', 'wip', 400)]);

        // Act
        const [resolved] = await resolveMaterialSources({
            materials: [
                {
                    productVariantId: 'aux',
                    productType: 'AUXILIARY',
                    requiredQty: 200,
                },
            ],
            fallbackLocationId: 'rm',
        });

        // Assert
        expect(resolved.sourceLocationId).toBe('wip');
        expect(resolved.stockAtSource).toBe(400);
    });

    it('never draws on scrap stock', async () => {
        // Arrange
        mockDb([stockRow('aux', 'scrap', 9999)]);

        // Act
        const [resolved] = await resolveMaterialSources({
            materials: [
                {
                    productVariantId: 'aux',
                    productType: 'AUXILIARY',
                    requiredQty: 100,
                },
            ],
            fallbackLocationId: 'rm',
        });

        // Assert
        expect(resolved.totalStock).toBe(0);
        expect(resolved.isShortage).toBe(true);
        expect(resolved.sourceLocationId).toBe('pack');
    });

    it('still names where stock belongs when there is none anywhere', async () => {
        // Arrange
        mockDb([]);

        // Act
        const [resolved] = await resolveMaterialSources({
            materials: [
                {
                    productVariantId: 'adonan',
                    productType: 'INTERMEDIATE',
                    requiredQty: 50,
                },
            ],
            fallbackLocationId: 'rm',
        });

        // Assert
        expect(resolved.sourceLocationId).toBe('wip');
        expect(resolved.sourceLocationName).toBe('Gudang WIP & Intermediate');
        expect(resolved.stockAtSource).toBe(0);
        expect(resolved.isShortage).toBe(true);
    });

    it('returns an empty list without touching the database', async () => {
        // Act
        const result = await resolveMaterialSources({ materials: [] });

        // Assert
        expect(result).toEqual([]);
        expect(prisma.location.findMany).not.toHaveBeenCalled();
    });
});
