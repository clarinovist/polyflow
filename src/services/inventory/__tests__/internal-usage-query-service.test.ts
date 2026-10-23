import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { getInternalUsageDetail, getInternalUsageFormData, getInternalUsageHistory, serializeInternalUsage } from '../internal-usage-query-service';
const m = vi.hoisted(() => ({ count: vi.fn(), many: vi.fn(), unique: vi.fn(), variants: vi.fn(), reservations: vi.fn(), actor: vi.fn() }));
vi.mock('@/lib/core/prisma', () => { const db = { internalUsage: { count: m.count, findMany: m.many, findUnique: m.unique }, productVariant: { findMany: m.variants }, stockReservation: { groupBy: m.reservations }, user: { findUnique: m.actor } }; return { prisma: { ...db, $transaction: (fn: (tx: unknown) => unknown) => fn(db) } }; });
const dec = (n: number) => new Prisma.Decimal(n);
const row = { id: 'doc', number: 'PI-1', movementId: 'move', productName: 'Pen', skuCode: 'PEN', unit: 'PCS' as const, locationName: 'Office', recipient: 'Staff', department: 'Admin', purpose: 'Writing', recordedByName: 'Warehouse', createdAt: new Date('2026-10-23T03:00:00Z'), stockBefore: dec(24), stockAfter: dec(21), movement: { quantity: dec(3) } };
beforeEach(() => { vi.resetAllMocks(); m.count.mockResolvedValue(1); m.many.mockImplementation(async (args) => args.distinct ? [{ department: 'Admin' }] : [row]); m.unique.mockResolvedValue(row); m.variants.mockResolvedValue([]); m.reservations.mockResolvedValue([]); m.actor.mockResolvedValue({ name: 'Warehouse' }); });
describe('internal usage quantity-only readers', () => {
    it('bounds pagination with snapshot reads and excludes cost/request fields', async () => {
        const result = await getInternalUsageHistory({ page: 99, query: ' Pen ', department: ' Admin ' });
        expect(result).toMatchObject({ page: 1, total: 1, query: 'Pen', department: 'Admin' });
        expect(result.records[0]).toMatchObject({ quantity: 3, stockBefore: 24, stockAfter: 21 });
        expect(m.many.mock.calls[0][0]).toMatchObject({ take: 25, skip: 0, where: { department: 'Admin' } });
        expect(result.records[0]).not.toHaveProperty('journalId');
        expect(serializeInternalUsage({ ...row, requestHash: 'secret' } as typeof row)).not.toHaveProperty('requestHash');
    });
    it('rejects invalid filters and missing detail without reporting empty success', async () => {
        await expect(getInternalUsageHistory({ page: -1 })).rejects.toThrow();
        await expect(getInternalUsageDetail('')).rejects.toThrow();
        m.unique.mockResolvedValue(null); await expect(getInternalUsageDetail('absent')).rejects.toThrow();
    });
    it('preserves historical snapshot strings and dates', async () => {
        expect(await getInternalUsageDetail('doc')).toMatchObject({ productName: 'Pen', createdAt: '2026-10-23T03:00:00.000Z' });
    });
    it('shows physical, reserved and available stock per allowed source', async () => {
        m.variants.mockResolvedValue([{ id: 'pen', name: 'Pen', skuCode: 'PEN', primaryUnit: 'PCS', inventories: [
            { locationId: 'a', location: { name: 'A' }, quantity: dec(24) }, { locationId: 'b', location: { name: 'B' }, quantity: dec(1) },
        ] }]);
        m.reservations.mockResolvedValue([{ productVariantId: 'pen', locationId: 'a', _sum: { quantity: dec(2) } }, { productVariantId: 'pen', locationId: 'b', _sum: { quantity: dec(3) } }]);
        const result = await getInternalUsageFormData('actor');
        expect(result.products[0].stocks).toEqual([{ locationId: 'a', locationName: 'A', quantity: 24, reserved: 2, available: 22 }, { locationId: 'b', locationName: 'B', quantity: 1, reserved: 3, available: 0 }]);
        expect(m.variants.mock.calls[0][0].where).toEqual({ archivedAt: null, product: { productType: 'OPERATIONAL' } });
        expect(m.variants.mock.calls[0][0].select.inventories.where.location).toEqual({ locationType: 'INTERNAL', packagingOwnerCustomerId: null });
    });
});
