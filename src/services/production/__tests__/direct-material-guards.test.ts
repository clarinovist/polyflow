import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionMaterialService } from '../material-service';
import { ProductionOrderService } from '../order-service';
import { InventoryMovementService } from '@/services/inventory/movement-service';

const mocks = vi.hoisted(() => ({
    order: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
    },
    stockMovement: { findFirst: vi.fn(), create: vi.fn() },
    inventory: { findUnique: vi.fn() },
    validate: vi.fn(),
    deduct: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => {
    const tx = {
        productionOrder: mocks.order,
        stockMovement: mocks.stockMovement,
        inventory: mocks.inventory,
    };
    return {
        prisma: {
            ...tx,
            $transaction: (fn: (db: typeof tx) => Promise<unknown>) => fn(tx),
        },
    };
});
vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: {
        validateAndLockStock: mocks.validate,
        deductStock: mocks.deduct,
    },
}));
const order = {
    id: 'po',
    orderNumber: 'WO-DIRECT',
    status: 'RELEASED',
    materialConsumptionMode: 'DIRECT',
    plannedMaterials: [],
    materialIssues: [],
};
const issue = {
    productionOrderId: 'po',
    productVariantId: 'wrap',
    locationId: 'supplies',
    quantity: 2,
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.findUnique.mockResolvedValue(order);
    mocks.order.findUniqueOrThrow.mockResolvedValue(order);
    mocks.order.findMany.mockResolvedValue([order]);
    mocks.stockMovement.findFirst.mockResolvedValue(null);
    mocks.inventory.findUnique.mockResolvedValue({
        averageCost: { toNumber: () => 10 },
    });
});

describe('direct order mutation guards', () => {
    it('rejects manual issue before deducting stock', async () => {
        await expect(
            ProductionMaterialService.recordMaterialIssue(issue),
        ).rejects.toThrow(/langsung/i);
        expect(mocks.deduct).not.toHaveBeenCalled();
    });
    it('rejects batch staging and plan changes', async () => {
        await expect(
            ProductionMaterialService.batchIssueMaterials({
                productionOrderId: 'po',
                locationId: 'supplies',
                items: [{ productVariantId: 'wrap', quantity: 2 }],
                recordAsStaged: true,
            }),
        ).rejects.toThrow(/langsung/i);
    });
    it('rejects consolidated issue', async () => {
        await expect(
            ProductionMaterialService.consolidatedBatchIssueMaterials({
                productionOrderIds: ['po'],
                locationId: 'supplies',
                items: [{ productVariantId: 'wrap', quantity: 2 }],
            }),
        ).rejects.toThrow(/langsung/i);
    });
    it('rejects ad hoc issue that would suppress automatic consumption', async () => {
        await expect(
            ProductionMaterialService.recordAdHocMaterialUsage(issue),
        ).rejects.toThrow(/langsung/i);
        expect(mocks.deduct).not.toHaveBeenCalled();
    });
    it('rejects linked production transfers', async () => {
        await expect(
            InventoryMovementService.transferStockBulk(
                {
                    productionOrderId: 'po',
                    sourceLocationId: 'supplies',
                    destinationLocationId: 'fg',
                    items: [{ productVariantId: 'wrap', quantity: 2 }],
                    date: new Date(),
                    notes: '',
                },
                'operator',
            ),
        ).rejects.toThrow(/langsung/i);
    });
    it('rejects assigning a single consumption location on direct orders', async () => {
        await expect(
            ProductionOrderService.updateOrder({
                id: 'po',
                materialConsumptionLocationId: 'fg',
            }),
        ).rejects.toThrow(/langsung/i);
    });
});