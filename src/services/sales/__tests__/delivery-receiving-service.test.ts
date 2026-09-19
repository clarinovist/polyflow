import { prisma } from '@/lib/core/prisma';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { receiveDelivery } from '../delivery-receiving-service';
const mocks = vi.hoisted(() => ({
    db: { $queryRaw: vi.fn(), deliveryOrder: { findUnique: vi.fn(), update: vi.fn() }, salesOrder: { update: vi.fn() } },
    audit: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: () => prisma, prisma: { $transaction: async (fn: (tx: typeof mocks.db) => unknown) => fn(mocks.db) } }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
function fixture() {
    return { id: 'do', status: 'SHIPPED', stockCommittedAt: new Date(), salesOrder: {
        id: 'so', orderNumber: 'SO-test', status: 'READY_TO_SHIP', items: [{ quantity: 100, deliveredQty: 80 }],
        deliveryOrders: [{ id: 'do', status: 'SHIPPED' }, { id: 'next', status: 'PENDING' }],
    } };
}
beforeEach(() => { vi.resetAllMocks(); mocks.db.deliveryOrder.findUnique.mockResolvedValue(fixture()); });
describe('receive one delivery', () => {
    it('receives only selected DO and retains residual SO', async () => {
        await receiveDelivery('do', 'warehouse');
        expect(mocks.db.deliveryOrder.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 'do' }, data: { status: 'DELIVERED' } });
        expect(mocks.db.salesOrder.update).toHaveBeenCalledWith({ where: { id: 'so' }, data: { status: 'READY_TO_SHIP' } });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tx: mocks.db, entityId: 'do' }));
    });
    it('keeps SO SHIPPED when other shipments are not yet received', async () => {
        const row = fixture(); row.salesOrder.items[0].deliveredQty = 100;
        row.salesOrder.deliveryOrders[1].status = 'IN_TRANSIT';
        mocks.db.deliveryOrder.findUnique.mockResolvedValue(row);
        await receiveDelivery('do', 'user');
        expect(mocks.db.salesOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SHIPPED' } }));
    });
    it('closes fully fulfilled and received order', async () => {
        const row = fixture(); row.salesOrder.items[0].deliveredQty = 100;
        row.salesOrder.deliveryOrders[1].status = 'DELIVERED';
        mocks.db.deliveryOrder.findUnique.mockResolvedValue(row);
        await receiveDelivery('do', 'user');
        expect(mocks.db.salesOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'DELIVERED' } }));
    });
    it.each(['PENDING', 'LOADING', 'CANCELLED', 'DELIVERED'])('rejects %s', async (status) => {
        mocks.db.deliveryOrder.findUnique.mockResolvedValue({ ...fixture(), status });
        await expect(receiveDelivery('do', 'user')).rejects.toThrow();
        expect(mocks.db.deliveryOrder.update).not.toHaveBeenCalled();
    });
    it('rejects missing DO, uncommitted stock and cancelled SO', async () => {
        mocks.db.deliveryOrder.findUnique.mockResolvedValueOnce(null);
        await expect(receiveDelivery('do', 'user')).rejects.toThrow();
        mocks.db.deliveryOrder.findUnique.mockResolvedValueOnce({ ...fixture(), stockCommittedAt: null });
        await expect(receiveDelivery('do', 'user')).rejects.toThrow();
        const row = fixture(); row.salesOrder.status = 'CANCELLED';
        mocks.db.deliveryOrder.findUnique.mockResolvedValue(row);
        await expect(receiveDelivery('do', 'user')).rejects.toThrow();
    });
});
