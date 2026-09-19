import { prisma } from '@/lib/core/prisma';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { changeDeliveryLoad } from '../delivery-load-service';
const mocks = vi.hoisted(() => ({
    db: { $queryRaw: vi.fn(), deliveryOrder: { findUnique: vi.fn(), update: vi.fn() }, deliveryOrderItem: { update: vi.fn() } }, audit: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: () => prisma, prisma: { $transaction: async (fn: (tx: typeof mocks.db) => unknown) => fn(mocks.db) } }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
function fixture() { return { id: 'do', salesOrderId: 'so', orderNumber: 'DO-test', status: 'LOADING', stockCommittedAt: null,
    items: [{ id: 'line', productVariantId: 'a', quantity: 80, verifiedQuantity: 80 as number | null, conversionFactorSnapshot: 10 }],
    salesOrder: { status: 'CONFIRMED', items: [{ id: 'soi', productVariantId: 'a', quantity: 100, deliveredQty: 0 }] },
}; }
let row = fixture();
beforeEach(() => { vi.resetAllMocks(); row = fixture(); mocks.db.deliveryOrder.findUnique.mockImplementation(async () => row); });
describe('serialized warehouse loading', () => {
    it('qty mutation clears verification and uses primary conversion', async () => {
        await changeDeliveryLoad('do', 'user', { kind: 'quantity', items: [{ id: 'line', quantity: 70 }] });
        expect(mocks.db.deliveryOrderItem.update).toHaveBeenCalledWith({ where: { id: 'line' }, data: expect.objectContaining({ quantity: 70, enteredQuantity: 7, verifiedQuantity: null }) });
        expect(mocks.db.deliveryOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: { loadVerifiedAt: null, loadVerifiedById: null } }));
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tx: mocks.db }));
    });
    it('saves count even when excess but does not allow correction beyond SO', async () => {
        await changeDeliveryLoad('do', 'user', { kind: 'verify', items: [{ id: 'line', verifiedQuantity: 110 }] });
        expect(mocks.db.deliveryOrderItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ verifiedQuantity: 110 }) }));
        row.items[0].verifiedQuantity = 110;
        await expect(changeDeliveryLoad('do', 'user', { kind: 'correct' })).rejects.toThrow(/melebihi/);
    });
    it('locks exact counts; corrects underload to physical and locks atomically', async () => {
        await changeDeliveryLoad('do', 'user', { kind: 'lock' });
        expect(mocks.db.deliveryOrderItem.update).not.toHaveBeenCalled();
        row.items[0].verifiedQuantity = 60;
        await changeDeliveryLoad('do', 'user', { kind: 'correct' });
        expect(mocks.db.deliveryOrderItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: 60, enteredQuantity: 6 }) }));
    });
    it('rejects mismatch and incomplete verification', async () => {
        row.items[0].verifiedQuantity = 70;
        await expect(changeDeliveryLoad('do', 'user', { kind: 'lock' })).rejects.toThrow(/selisih/);
        row.items[0].verifiedQuantity = null;
        await expect(changeDeliveryLoad('do', 'user', { kind: 'correct' })).rejects.toThrow(/Semua baris/);
    });
    it('rejects stale row IDs, duplicates, mismatch product and empty SJ', async () => {
        await expect(changeDeliveryLoad('do', 'user', { kind: 'verify', items: [{ id: 'old-id', verifiedQuantity: 80 }] })).rejects.toThrow(/berubah/);
        await expect(changeDeliveryLoad('do', 'user', { kind: 'quantity', items: [{ id: 'line', quantity: 80 }, { id: 'line', quantity: 80 }] })).rejects.toThrow(/berubah/);
        row.salesOrder.items.push({ ...row.salesOrder.items[0] });
        await expect(changeDeliveryLoad('do', 'user', { kind: 'lock' })).rejects.toThrow(/duplikat/);
        row = fixture(); row.items[0].productVariantId = 'foreign';
        await expect(changeDeliveryLoad('do', 'user', { kind: 'lock' })).rejects.toThrow(/tidak cocok/);
        row = fixture(); row.items = [];
        await expect(changeDeliveryLoad('do', 'user', { kind: 'lock' })).rejects.toThrow(/tidak punya/);
    });
    it('rejects missing/committed/cancelled documents and invalid quantities', async () => {
        mocks.db.deliveryOrder.findUnique.mockResolvedValueOnce(null);
        await expect(changeDeliveryLoad('do', 'user', { kind: 'lock' })).rejects.toThrow();
        row.status = 'SHIPPED';
        await expect(changeDeliveryLoad('do', 'user', { kind: 'lock' })).rejects.toThrow(/PENDING/);
        row = fixture(); row.salesOrder.status = 'CANCELLED';
        await expect(changeDeliveryLoad('do', 'user', { kind: 'lock' })).rejects.toThrow(/dibatalkan/);
        row = fixture();
        await expect(changeDeliveryLoad('do', 'user', { kind: 'quantity', items: [{ id: 'line', quantity: -1 }] })).rejects.toThrow(/tidak valid/);
        await expect(changeDeliveryLoad('do', 'user', { kind: 'quantity', items: [{ id: 'line', quantity: 101 }] })).rejects.toThrow(/melebihi/);
    });
});
