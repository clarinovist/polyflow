import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveMaterialLocation } from '../execution-material-location';

// Mock prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

// Mock constants
vi.mock('@/lib/constants/locations', () => ({
    WAREHOUSE_SLUGS: {
        MIXING: 'mixing',
        FINISHING: 'finishing',
        RAW_MATERIAL: 'raw-material',
        PACKING_AREA: 'packing-area',
        CUSTOMER_OWNED: 'customer-owned',
    },
    MAKLON_STAGE_SLUGS: {
        WIP: 'wip',
        RAW_MATERIAL: 'raw-material-maklon',
        FINISHED_GOOD: 'finished-good-maklon',
    },
}));

describe('resolveMaterialLocation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return order location for non-maklon orders with EXTRUSION category', async () => {
        // Arrange
        const mockTx = {
            location: {
                findUnique: vi.fn().mockResolvedValue({ id: 'loc-mixing' }),
            },
        };

        const order = {
            id: 'po-1',
            locationId: 'loc-1',
            isMaklon: false,
            bom: { category: 'EXTRUSION' },
        };

        // Act
        const result = await resolveMaterialLocation(mockTx as any, order, 'pv-1');

        // Assert
        expect(result).toBe('loc-mixing');
        expect(mockTx.location.findUnique).toHaveBeenCalledWith({
            where: { slug: 'mixing' },
        });
    });

    it('should return order location for non-maklon orders with MIXING category', async () => {
        // Arrange
        const mockTx = {
            location: {
                findUnique: vi.fn().mockResolvedValue({ id: 'loc-mixing' }),
            },
        };

        const order = {
            id: 'po-1',
            locationId: 'loc-1',
            isMaklon: false,
            bom: { category: 'MIXING' },
        };

        // Act
        const result = await resolveMaterialLocation(mockTx as any, order, 'pv-1');

        // Assert
        expect(result).toBe('loc-mixing');
    });

    it('should return order location when PACKING category and order location has stock', async () => {
        // Arrange
        const mockTx = {
            location: {
                findUnique: vi.fn(),
            },
            inventory: {
                findUnique: vi.fn().mockResolvedValue({
                    quantity: { toNumber: () => 100 },
                }),
            },
        };

        const order = {
            id: 'po-1',
            locationId: 'loc-1',
            isMaklon: false,
            bom: { category: 'PACKING' },
        };

        // Act
        const result = await resolveMaterialLocation(mockTx as any, order, 'pv-1');

        // Assert
        expect(result).toBe('loc-1');
    });

    it('should return order location when REWORK category and order location has stock', async () => {
        // Arrange
        const mockTx = {
            location: {
                findUnique: vi.fn(),
            },
            inventory: {
                findUnique: vi.fn().mockResolvedValue({
                    quantity: { toNumber: () => 50 },
                }),
            },
        };

        const order = {
            id: 'po-1',
            locationId: 'loc-1',
            isMaklon: false,
            bom: { category: 'REWORK' },
        };

        // Act
        const result = await resolveMaterialLocation(mockTx as any, order, 'pv-1');

        // Assert
        expect(result).toBe('loc-1');
    });

    it('should return order location for maklon orders when no other location found', async () => {
        // Arrange
        const mockTx = {
            location: {
                findUnique: vi.fn().mockResolvedValue(null),
            },
            inventory: {
                findUnique: vi.fn().mockResolvedValue(null),
                findFirst: vi.fn().mockResolvedValue(null),
            },
        };

        const order = {
            id: 'po-1',
            locationId: 'loc-1',
            isMaklon: true,
            bom: { category: 'EXTRUSION' },
        };

        // Act
        const result = await resolveMaterialLocation(mockTx as any, order, 'pv-1');

        // Assert
        expect(result).toBe('loc-1');
    });

    it('should return order location as fallback', async () => {
        // Arrange
        const mockTx = {
            location: {
                findUnique: vi.fn().mockResolvedValue(null),
            },
            inventory: {
                findUnique: vi.fn().mockResolvedValue(null),
                findFirst: vi.fn().mockResolvedValue(null),
            },
        };

        const order = {
            id: 'po-1',
            locationId: 'loc-1',
            isMaklon: false,
            bom: { category: 'STANDARD' },
        };

        // Act
        const result = await resolveMaterialLocation(mockTx as any, order, 'pv-1');

        // Assert
        expect(result).toBe('loc-1');
    });
});
