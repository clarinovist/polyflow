import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
const mocks = vi.hoisted(() => ({ audit: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
import { orderCustomersSchema, updateOrderCustomers, updateOrderCustomersInTransaction, validateOrderCustomers } from '../order-customer-service';

const tx = {
    $queryRaw: vi.fn(),
    customer: { count: vi.fn() },
    productionOrderCustomer: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
};
const client = tx as unknown as Prisma.TransactionClient;
describe('SPK customer destinations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.$queryRaw.mockResolvedValue([{ id: 'wo', status: 'IN_PROGRESS' }]);
        tx.customer.count.mockResolvedValue(2);
        tx.productionOrderCustomer.findMany.mockResolvedValue([{ customerId: 'old' }]);
        mocks.transaction.mockImplementation((fn) => fn(client));
    });
    it('deduplicates tenant-local ids and audits replacement inside the transaction', async () => {
        await updateOrderCustomers({ orderId: 'wo', customerIds: ['a', 'b', 'a'] }, 'actor');
        expect(tx.customer.count).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } } });
        expect(tx.productionOrderCustomer.createMany).toHaveBeenCalledWith({ data: [{ productionOrderId: 'wo', customerId: 'a' }, { productionOrderId: 'wo', customerId: 'b' }] });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'actor', tx: client, changes: { before: ['old'], after: ['a', 'b'] } }));
    });
    it('clears explicit destinations without touching source SO/maklon', async () => {
        await updateOrderCustomersInTransaction(client, { orderId: 'wo', customerIds: [] }, 'actor');
        expect(tx.customer.count).not.toHaveBeenCalled();
        expect(tx.productionOrderCustomer.deleteMany).toHaveBeenCalledWith({ where: { productionOrderId: 'wo' } });
        expect(tx.productionOrderCustomer.createMany).not.toHaveBeenCalled();
    });
    it.each(['COMPLETED', 'CANCELLED'])('rejects terminal %s before writing', async (status) => {
        tx.$queryRaw.mockResolvedValue([{ id: 'wo', status }]);
        await expect(updateOrderCustomersInTransaction(client, { orderId: 'wo', customerIds: [] }, 'actor')).rejects.toThrow('tidak bisa');
        expect(tx.productionOrderCustomer.deleteMany).not.toHaveBeenCalled();
    });
    it('rejects a missing order', async () => {
        tx.$queryRaw.mockResolvedValue([]);
        await expect(updateOrderCustomersInTransaction(client, { orderId: 'missing', customerIds: [] }, 'actor')).rejects.toThrow();
        expect(tx.productionOrderCustomer.deleteMany).not.toHaveBeenCalled();
    });
    it('rejects nonlocal customers before deleting old links', async () => {
        tx.customer.count.mockResolvedValue(0);
        await expect(updateOrderCustomersInTransaction(client, { orderId: 'wo', customerIds: ['foreign'] }, 'actor')).rejects.toThrow('tenant');
        expect(tx.productionOrderCustomer.deleteMany).not.toHaveBeenCalled();
    });
    it('propagates audit failure so the surrounding transaction rolls back', async () => {
        mocks.audit.mockRejectedValueOnce(new Error('audit failure'));
        await expect(updateOrderCustomers({ orderId: 'wo', customerIds: [] }, 'actor')).rejects.toThrow('audit failure');
    });
    it('validates shape, limits and empty ids', async () => {
        expect(orderCustomersSchema.safeParse({ orderId: 'wo', customerIds: [' '] }).success).toBe(false);
        expect(orderCustomersSchema.safeParse({ orderId: 'wo', customerIds: Array(101).fill('a') }).success).toBe(false);
        expect(await validateOrderCustomers(client, [])).toEqual([]);
    });
});
