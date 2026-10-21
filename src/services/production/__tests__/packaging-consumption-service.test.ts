import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { consumeActualPackaging } from '../packaging-consumption-service';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
vi.mock('@/services/inventory/core-service', () => ({ InventoryCoreService: { validateAndLockStock: vi.fn(), deductStock: vi.fn() } }));
vi.mock('@/services/accounting/accounting-service', () => ({ AccountingService: { recordInventoryMovement: vi.fn() } }));
const d = (n: number) => new Prisma.Decimal(n);
const db = {
    location: { findUniqueOrThrow: vi.fn() }, productVariant: { findUniqueOrThrow: vi.fn() },
    inventory: { findUniqueOrThrow: vi.fn() }, stockMovement: { create: vi.fn() },
    materialIssue: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
};
const tx = db as unknown as Prisma.TransactionClient;
const row = { productVariantId: 'sack', sourceLocationId: 'stock', ownerCustomerId: null, quantity: 10 };
describe('actual packaging consumption', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.location.findUniqueOrThrow.mockResolvedValue({ id: 'stock', locationType: 'INTERNAL', packagingOwnerCustomerId: null });
        db.productVariant.findUniqueOrThrow.mockResolvedValue({ id: 'sack', primaryUnit: 'PCS', archivedAt: null, product: { productType: 'PACKAGING' } });
        db.inventory.findUniqueOrThrow.mockResolvedValue({ averageCost: d(3) });
        db.stockMovement.create.mockImplementation(async ({ data }) => ({ id: 'movement', ...data }));
        db.materialIssue.findMany.mockResolvedValue([]);
    });
    it('locks stock and posts actual consumption, cost and execution lineage once', async () => {
        const result = await consumeActualPackaging(tx, 'exec', 'order', [row], 'actor');
        expect(InventoryCoreService.validateAndLockStock).toHaveBeenCalledWith(tx, 'stock', 'sack', 10, 'order');
        expect(InventoryCoreService.deductStock).toHaveBeenCalledOnce();
        expect(result[0].cost.toNumber()).toBe(30);
        expect(db.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productionExecutionId: 'exec', companyOwned: true, quantity: 10 }) });
        expect(AccountingService.recordInventoryMovement).toHaveBeenCalledOnce();
    });
    it('keeps custody quantity but forces zero value even if master/inventory has a price', async () => {
        db.location.findUniqueOrThrow.mockResolvedValue({ id: 'stock', locationType: 'CUSTOMER_OWNED', packagingOwnerCustomerId: 'a' });
        const result = await consumeActualPackaging(tx, 'exec', 'order', [{ ...row, ownerCustomerId: 'a' }]);
        expect(result[0].cost.toNumber()).toBe(0);
        expect(result[0].movement.companyOwned).toBe(false);
        expect(result[0].movement.packagingOwnerCustomerId).toBe('a');
    });
    it('rejects wrong customer before deducting stock', async () => {
        db.location.findUniqueOrThrow.mockResolvedValue({ id: 'stock', locationType: 'CUSTOMER_OWNED', packagingOwnerCustomerId: 'b' });
        await expect(consumeActualPackaging(tx, 'exec', 'order', [{ ...row, ownerCustomerId: 'a' }])).rejects.toThrow('Pemilik');
        expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
    });
    it('preserves staged source identity for partial allocations and remainder', async () => {
        db.materialIssue.findMany.mockResolvedValue([{ id: 'stage', quantity: d(6) }]);
        await consumeActualPackaging(tx, 'exec', 'order', [row]);
        expect(db.materialIssue.update).toHaveBeenCalledWith({ where: { id: 'stage' }, data: { quantity: { decrement: d(6) } } });
        expect(db.materialIssue.create).toHaveBeenCalledTimes(2);
        expect(db.materialIssue.create.mock.calls[0][0].data).toMatchObject({ stagedSourceId: 'stage', productionExecutionId: 'exec', quantity: d(6) });
        expect(db.materialIssue.create.mock.calls[1][0].data.quantity.toNumber()).toBe(4);
    });
    it('propagates shortage without a stock or accounting mutation', async () => {
        vi.mocked(InventoryCoreService.validateAndLockStock).mockRejectedValueOnce(new Error('shortage'));
        await expect(consumeActualPackaging(tx, 'exec', 'order', [row])).rejects.toThrow('shortage');
        expect(db.stockMovement.create).not.toHaveBeenCalled();
    });
    it('rejects non-packaging and missing valuation', async () => {
        db.productVariant.findUniqueOrThrow.mockResolvedValue({ primaryUnit: 'KG', product: { productType: 'RAW_MATERIAL' } });
        await expect(consumeActualPackaging(tx, 'exec', 'order', [row])).rejects.toThrow('kemasan');
        db.productVariant.findUniqueOrThrow.mockResolvedValue({ primaryUnit: 'PCS', product: { productType: 'PACKAGING' } });
        db.inventory.findUniqueOrThrow.mockResolvedValue({ averageCost: null });
        await expect(consumeActualPackaging(tx, 'exec', 'order', [row])).rejects.toThrow('Biaya');
    });
});
