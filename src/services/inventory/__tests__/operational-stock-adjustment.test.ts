import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { tx } = vi.hoisted(() => ({ tx: {
    $queryRaw: vi.fn(),
    productVariant: { findUnique: vi.fn() },
    inventory: { findUnique: vi.fn(), upsert: vi.fn() },
    stockMovement: { create: vi.fn(async ({ data }: { data: object }) => ({ id: 'movement', ...data })) },
    batch: { findUnique: vi.fn() },
} }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { $transaction: (fn: (inner: typeof tx) => unknown) => fn(tx) } }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/services/accounting/accounting-service', () => ({ AccountingService: { recordInventoryMovement: vi.fn() } }));
vi.mock('../core-service', () => ({ InventoryCoreService: { calculateWAC: vi.fn(async () => 4000) } }));

import { InventoryMovementService } from '../movement-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { InventoryCoreService } from '../core-service';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const adjustIn = { locationId: 'atk-store', productVariantId: 'atk', type: 'ADJUSTMENT_IN', quantity: 2, reason: 'Temuan stok' } as const;

describe('operational stock adjustment in', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.inventory.findUnique.mockResolvedValue({ averageCost: null });
    });

    it('persists the resolved cost on the movement so the journal is not priced from a fallback', async () => {
        tx.productVariant.findUnique.mockResolvedValue({ skuCode: 'ATK', standardCost: null, buyPrice: d(4000),
            product: { productType: 'OPERATIONAL' } });
        await InventoryMovementService.adjustStock({ ...adjustIn }, 'actor');
        expect(tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ cost: d(4000) }) });
        expect(AccountingService.recordInventoryMovement).toHaveBeenCalledTimes(1);
    });

    it('rejects a cost-less operational adjustment before any stock change', async () => {
        tx.productVariant.findUnique.mockResolvedValue({ skuCode: 'ATK', standardCost: null, buyPrice: null,
            product: { productType: 'OPERATIONAL' } });
        await expect(InventoryMovementService.adjustStock({ ...adjustIn }, 'actor'))
            .rejects.toMatchObject({ code: 'OPERATIONAL_STOCK_COST_REQUIRED' });
        expect(tx.inventory.upsert).not.toHaveBeenCalled();
        expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('values other stock at the location average for WAC, movement and journal alike', async () => {
        tx.productVariant.findUnique.mockResolvedValue({ skuCode: 'PACK', standardCost: d(34728.5378), buyPrice: null,
            product: { productType: 'AUXILIARY' } });
        tx.inventory.findUnique.mockResolvedValue({ averageCost: d(29146.3966) });
        await InventoryMovementService.adjustStock({ ...adjustIn }, 'actor');
        expect(InventoryCoreService.calculateWAC).toHaveBeenCalledWith('atk', 'atk-store', 2, 29146.3966, tx);
        expect(tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ cost: d(29146.3966) }) });
    });

    it('persists an explicit zero for stock without any cost source, so no fallback price is journaled', async () => {
        tx.productVariant.findUnique.mockResolvedValue({ skuCode: 'FG', standardCost: null, buyPrice: null, price: d(15000),
            product: { productType: 'FINISHED_GOOD' } });
        await InventoryMovementService.adjustStock({ ...adjustIn }, 'actor');
        expect(tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ cost: d(0) }) });
        expect(AccountingService.recordInventoryMovement).toHaveBeenCalledTimes(1);
    });

    it('applies the same cost rule to bulk adjustments', async () => {
        tx.productVariant.findUnique.mockResolvedValue({ skuCode: 'PACK', standardCost: d(47659.9168), buyPrice: null,
            product: { productType: 'AUXILIARY' } });
        await InventoryMovementService.adjustStockBulk({ locationId: 'wip', items: [
            { productVariantId: 'pack', type: 'ADJUSTMENT_IN', quantity: 10.2, reason: 'Penyesuaian Stok' },
        ] }, 'actor');
        expect(InventoryCoreService.calculateWAC).toHaveBeenCalledWith('pack', 'wip', 10.2, 47659.9168, tx);
        expect(tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ cost: d(47659.9168) }) });
    });
});
