import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { reversePackagedExecution } from '../packaging-reversal-service';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { reversePackagingJournal } from '@/services/accounting/production-packaging-reversal';
vi.mock('@/lib/core/actor-context', () => ({ getActorUserId: () => 'actor' }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/services/accounting/production-packaging-reversal', () => ({ reversePackagingJournal: vi.fn() }));
vi.mock('@/services/inventory/core-service', () => ({ InventoryCoreService: { validateAndLockStock: vi.fn(), incrementStockWithCost: vi.fn() } }));
const d = (n: number) => new Prisma.Decimal(n);
const db = {
    $queryRaw: vi.fn(), productionExecution: { findUniqueOrThrow: vi.fn() },
    stockMovement: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    inventory: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    materialIssue: { findMany: vi.fn(), update: vi.fn() },
};
const tx = db as unknown as Prisma.TransactionClient;
const inputMove = { id: 'consume', type: 'OUT', fromLocationId: 'custody', toLocationId: null, productVariantId: 'label', quantity: d(10), cost: d(0), companyOwned: false, packagingOwnerCustomerId: 'customer', createdAt: new Date(0) };
const outputMove = { id: 'output', type: 'IN', fromLocationId: null, toLocationId: 'fg', productVariantId: 'brand-a', quantity: d(10), cost: d(20), companyOwned: true, createdAt: new Date(0) };
describe('exact packaged-output reversal', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.productionExecution.findUniqueOrThrow.mockResolvedValue({ status: 'COMPLETED' });
        db.stockMovement.findMany.mockResolvedValue([outputMove, inputMove]);
        db.stockMovement.findUnique.mockResolvedValue(null);
        db.stockMovement.findFirst.mockResolvedValue(null);
        db.stockMovement.create.mockImplementation(async ({ data }) => ({ id: `reverse-${data.reversalOfId}`, ...data }));
        db.inventory.findUniqueOrThrow.mockResolvedValue({ id: 'stock', quantity: d(20), averageCost: d(15) });
        db.materialIssue.findMany.mockResolvedValue([{ id: 'issue', stagedSourceId: 'stage', quantity: d(10) }]);
    });
    it('restores exact owner/source, recomputes remaining value, and restores original staging', async () => {
        await reversePackagedExecution(tx, 'exec', 'order');
        expect(db.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { productionExecutionId: 'exec', reversalOfId: null } }));
        expect(db.inventory.update).toHaveBeenCalledWith({ where: { id: 'stock' }, data: { quantity: d(10), averageCost: d(10) } });
        expect(InventoryCoreService.incrementStockWithCost).toHaveBeenCalledWith(tx, 'custody', 'label', 10, 0);
        expect(db.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reversalOfId: 'consume', packagingOwnerCustomerId: 'customer', companyOwned: false }) });
        expect(reversePackagingJournal).toHaveBeenCalledTimes(2);
        expect(db.materialIssue.update).toHaveBeenCalledWith({ where: { id: 'stage' }, data: { quantity: { increment: d(10) } } });
    });
    it('rejects repeated void and existing source reversal', async () => {
        db.productionExecution.findUniqueOrThrow.mockResolvedValueOnce({ status: 'VOIDED' });
        await expect(reversePackagedExecution(tx, 'exec', 'order')).rejects.toThrow('dibatalkan');
        db.stockMovement.findUnique.mockResolvedValue({ id: 'previous' });
        await expect(reversePackagedExecution(tx, 'exec', 'order')).rejects.toThrow('dibalik');
        expect(db.stockMovement.create).not.toHaveBeenCalled();
    });
    it('fails closed when stock no longer holds the source value', async () => {
        db.inventory.findUniqueOrThrow.mockResolvedValue({ id: 'stock', quantity: d(10), averageCost: d(5) });
        await expect(reversePackagedExecution(tx, 'exec', 'order')).rejects.toThrow('Nilai stok');
        expect(db.stockMovement.create).not.toHaveBeenCalled();
    });
});
