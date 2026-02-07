
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionMaterialService } from '@/services/production/material-service';

// Mock tx object
const mockTx: any = {
    productionOrder: {
        findUniqueOrThrow: vi.fn()
    },
    productionMaterial: {
        delete: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn()
    },
    stockMovement: {
        findFirst: vi.fn(),
        create: vi.fn()
    },
    batch: {
        findMany: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn()
    },
    inventory: {
        update: vi.fn(),
        findUnique: vi.fn()
    },
    materialIssue: {
        create: vi.fn()
    }
};

// Mock prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        $transaction: vi.fn((callback) => callback(mockTx))
    }
}));

// Mock InventoryService
vi.mock('@/services/inventory-service', () => ({
    InventoryService: {
        validateAndLockStock: vi.fn(),
        deductStock: vi.fn(),
        incrementStock: vi.fn()
    }
}));

// Mock AccountingService
vi.mock('@/services/accounting-service', () => ({
    AccountingService: {
        recordInventoryMovement: vi.fn()
    }
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ProductionMaterialService.batchIssueMaterials', () => {
    it('should use deleteMany for deletions (optimized implementation)', async () => {
        const order = {
            id: 'po-1',
            orderNumber: 'PO-1',
            plannedMaterials: [
                { id: 'pm-1', productVariantId: 'pv-1', quantity: 10, productVariant: { name: 'Item 1' } },
                { id: 'pm-2', productVariantId: 'pv-2', quantity: 20, productVariant: { name: 'Item 2' } }
            ],
            materialIssues: []
        };
        mockTx.productionOrder.findUniqueOrThrow.mockResolvedValue(order);

        await ProductionMaterialService.batchIssueMaterials({
            productionOrderId: 'po-1',
            locationId: 'loc-1',
            items: [],
            removedPlannedMaterialIds: ['pm-1', 'pm-2'],
            addedPlannedMaterials: []
        });

        // Expect deleteMany to be called once
        expect(mockTx.productionMaterial.deleteMany).toHaveBeenCalledTimes(1);
        expect(mockTx.productionMaterial.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['pm-1', 'pm-2'] } } });

        // Ensure individual deletes are NOT called
        expect(mockTx.productionMaterial.delete).not.toHaveBeenCalled();
    });

    it('should prevent deletion if material is already issued', async () => {
        const order = {
            id: 'po-1',
            orderNumber: 'PO-1',
            plannedMaterials: [
                { id: 'pm-1', productVariantId: 'pv-1', quantity: 10, productVariant: { name: 'Item 1' } }
            ],
            materialIssues: [
                { productVariantId: 'pv-1', quantity: 5 } // Partially issued
            ]
        };
        mockTx.productionOrder.findUniqueOrThrow.mockResolvedValue(order);

        await expect(ProductionMaterialService.batchIssueMaterials({
            productionOrderId: 'po-1',
            locationId: 'loc-1',
            items: [],
            removedPlannedMaterialIds: ['pm-1'],
            addedPlannedMaterials: []
        })).rejects.toThrow('Cannot remove Item 1 because it has already been partially issued.');

        expect(mockTx.productionMaterial.deleteMany).not.toHaveBeenCalled();
        expect(mockTx.productionMaterial.delete).not.toHaveBeenCalled();
    });
});
