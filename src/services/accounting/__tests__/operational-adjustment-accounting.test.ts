import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type StockMovement } from '@prisma/client';
import {
    OPERATIONAL_ADJUSTMENT_MISSING_SOURCE_BASIS,
    allocateOperationalLossCredit,
    isOperationalLoss,
    withOperationalLossCost,
} from '../operational-adjustment-accounting';

const m = vi.hoisted(() => ({ basis: vi.fn(), inventory: vi.fn(), update: vi.fn() }));
vi.mock('@/services/inventory/internal-usage-accounting', () => ({ skuInventoryBasis: m.basis }));
const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const db = { inventory: { findUnique: m.inventory }, stockMovement: { update: m.update } } as unknown as Prisma.TransactionClient;
const loss = { id: 'adj', type: 'ADJUSTMENT', productVariantId: 'note', fromLocationId: 'office', toLocationId: null, quantity: d(2), cost: null } as unknown as StockMovement;
beforeEach(() => { vi.resetAllMocks(); m.inventory.mockResolvedValue({ averageCost: d(4000) }); m.update.mockResolvedValue({}); });

describe('operational stock adjustment losses', () => {
    it('applies only to company stock losses of operational items', () => {
        expect(isOperationalLoss(loss, 'OPERATIONAL')).toBe(true);
        expect(isOperationalLoss({ ...loss, toLocationId: 'office' }, 'OPERATIONAL')).toBe(false);
        expect(isOperationalLoss(loss, 'RAW_MATERIAL')).toBe(false);
        expect(isOperationalLoss({ ...loss, type: 'OUT' }, 'OPERATIONAL')).toBe(false);
    });
    it('values an uncosted loss at the location WAC and persists it, never a master price', async () => {
        const valued = await withOperationalLossCost(db, loss);
        expect(valued.cost?.toString()).toBe('4000');
        expect(m.update).toHaveBeenCalledWith({ where: { id: 'adj' }, data: { cost: d(4000) } });
        m.inventory.mockResolvedValue({ averageCost: null });
        expect((await withOperationalLossCost(db, loss)).cost?.toString()).toBe('0');
        m.inventory.mockResolvedValue(null);
        expect((await withOperationalLossCost(db, loss)).cost?.toString()).toBe('0');
    });
    it('keeps a persisted positive cost and rejects a loss without a source location', async () => {
        expect(await withOperationalLossCost(db, { ...loss, cost: d(3500) })).toMatchObject({ cost: d(3500) });
        expect(m.update).not.toHaveBeenCalled();
        await expect(withOperationalLossCost(db, { ...loss, fromLocationId: null })).rejects.toThrow('lokasi');
    });
    it('credits the resolved account first, then other accounts holding this SKU basis', async () => {
        m.basis.mockResolvedValue(new Map([['raw', d(3000)], ['packaging', d(40000)], ['stale', d(-500)]]));
        expect(await allocateOperationalLossCredit(db, 'note', 'raw', d(8000), 'Nota')).toEqual([
            { accountId: 'raw', credit: d(3000) }, { accountId: 'packaging', credit: d(5000) },
        ]);
        expect(await allocateOperationalLossCredit(db, 'note', 'packaging', d(8000), 'Nota')).toEqual([{ accountId: 'packaging', credit: d(8000) }]);
    });
    it('rejects a loss larger than the SKU-attributed basis instead of crediting an unrelated account', async () => {
        m.basis.mockResolvedValue(new Map([['packaging', d(5000)]]));
        await expect(allocateOperationalLossCredit(db, 'note', 'raw', d(8000), 'Nota Kontan'))
            .rejects.toMatchObject({ code: OPERATIONAL_ADJUSTMENT_MISSING_SOURCE_BASIS, message: expect.stringContaining('Nota Kontan') });
        m.basis.mockResolvedValue(new Map());
        await expect(allocateOperationalLossCredit(db, 'note', 'raw', d(1), 'Nota')).rejects.toThrow('Finance');
    });
});
