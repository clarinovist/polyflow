import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { backflushMaterials } from '../execution-material-consumption';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: {
        validateAndLockStock: vi.fn(),
        deductStock: vi.fn(),
    },
}));
vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: { recordInventoryMovement: vi.fn() },
}));
const order = {
    id: 'po',
    orderNumber: 'WO-DIRECT',
    locationId: 'output',
    plannedQuantity: 10,
    isMaklon: false,
    materialConsumptionMode: 'DIRECT' as const,
    bom: {
        productVariantId: 'finished',
        outputQuantity: 10,
        category: 'PACKING',
        items: [],
    },
    plannedMaterials: [
        {
            productVariantId: 'goods',
            quantity: new Prisma.Decimal(10),
            sourceLocationId: 'fg',
        },
        {
            productVariantId: 'wrap',
            quantity: new Prisma.Decimal(2),
            sourceLocationId: 'supplies',
        },
    ],
};
const mockTx = () => ({
    stockMovement: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi
            .fn()
            .mockImplementation(({ data }: { data: object }) => data),
    },
    inventory: {
        findUnique: vi
            .fn()
            .mockImplementation(
                ({
                    where,
                }: {
                    where: {
                        locationId_productVariantId: { locationId: string };
                    };
                }) => ({
                    averageCost:
                        where.locationId_productVariantId.locationId === 'fg'
                            ? 20
                            : 5,
                }),
            ),
    },
    materialIssue: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
});
describe('direct backflush pipeline', () => {
    it('deducts both warehouses and journals their own cost for a partial output', async () => {
        vi.clearAllMocks();
        const tx = mockTx();
        await backflushMaterials({
            tx: tx as unknown as Prisma.TransactionClient,
            order,
            productionOrderId: 'po',
            totalConsumed: 5,
            reference: 'PROD-TEST',
            userId: 'operator',
        });
        expect(InventoryCoreService.deductStock).toHaveBeenCalledWith(
            tx,
            'fg',
            'goods',
            5,
        );
        expect(InventoryCoreService.deductStock).toHaveBeenCalledWith(
            tx,
            'supplies',
            'wrap',
            1,
        );
        expect(tx.stockMovement.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                fromLocationId: 'fg',
                cost: 20,
                quantity: 5,
            }),
        });
        expect(tx.stockMovement.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                fromLocationId: 'supplies',
                cost: 5,
                quantity: 1,
            }),
        });
        expect(tx.materialIssue.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                locationId: 'supplies',
                status: 'ISSUED',
                quantity: 1,
            }),
        });
        expect(AccountingService.recordInventoryMovement).toHaveBeenCalledTimes(
            2,
        );
    });
    it('does not produce output without a direct material plan', async () => {
        await expect(
            backflushMaterials({
                tx: mockTx() as unknown as Prisma.TransactionClient,
                order: { ...order, plannedMaterials: [] },
                productionOrderId: 'po',
                totalConsumed: 1,
                reference: 'PROD-TEST',
            }),
        ).rejects.toThrow(/bahan/i);
    });
    it('refuses a manual issue conflict rather than silently skipping direct consumption', async () => {
        const tx = mockTx();
        tx.stockMovement.findFirst.mockResolvedValue({ id: 'manual' });
        await expect(
            backflushMaterials({
                tx: tx as unknown as Prisma.TransactionClient,
                order,
                productionOrderId: 'po',
                totalConsumed: 1,
                reference: 'PROD-TEST',
            }),
        ).rejects.toThrow(/manual/i);
    });
});