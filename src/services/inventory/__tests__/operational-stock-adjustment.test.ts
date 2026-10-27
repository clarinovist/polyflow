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

    it('keeps a non-operational adjustment on its existing cost path', async () => {
        tx.productVariant.findUnique
            .mockResolvedValueOnce({ skuCode: 'RAW', product: { productType: 'RAW_MATERIAL' } })
            .mockResolvedValueOnce({ buyPrice: d(10) });
        await InventoryMovementService.adjustStock({ ...adjustIn }, 'actor');
        expect(tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ cost: undefined }) });
    });
});
