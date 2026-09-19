import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { closeOrder } from '../close-order-service';
import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';

vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: () => prisma, prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'po' }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
    purchaseOrderItem: { update: vi.fn() },
    $transaction: vi.fn(async (run) => run(prisma)),
} }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

const item = (id: string, quantity: number, receivedQty: number) => ({
    id, quantity: new Prisma.Decimal(quantity), receivedQty: new Prisma.Decimal(receivedQty),
});
function order(status: PurchaseOrderStatus = PurchaseOrderStatus.PARTIAL_RECEIVED) {
    return { id: 'po', status, items: [item('a', 100, 40), item('b', 20, 0), item('c', 10, 12)] };
}

describe('closeOrder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(order() as never);
        vi.mocked(logActivity).mockResolvedValue(undefined);
    });

    it('closes a large remainder without modifying quantities or financial records', async () => {
        await expect(closeOrder('po', '  Supplier tidak mengirim sisa  ', 'actor')).resolves.toEqual({ id: 'po', status: 'CLOSED' });
        expect(prisma.$queryRaw).toHaveBeenCalled();
        expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prisma.purchaseOrder.findUnique).mock.invocationCallOrder[0]);
        expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
        expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
        expect(prisma.purchaseOrderItem.update).not.toHaveBeenCalled();
        expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'actor', entityId: 'po', action: 'CLOSE_PURCHASE_ORDER',
            fromStatus: 'PARTIAL_RECEIVED', toStatus: 'CLOSED', tx: prisma,
            details: 'Supplier tidak mengirim sisa',
            changes: { remainingItems: [
                { id: 'a', ordered: '100', received: '40', remaining: '60' },
                { id: 'b', ordered: '20', received: '0', remaining: '20' },
            ] },
        }));
    });
    it.each(['', '   ', 'x'.repeat(1001), null, 12])('rejects invalid reason %j before a transaction', async reason => {
        await expect(closeOrder('po', reason as string, 'actor')).rejects.toThrow();
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it('rejects missing PO', async () => {
        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(null);
        await expect(closeOrder('missing', 'reason', 'actor')).rejects.toThrow();
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
    it.each(['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED', 'CLOSED'] as const)('rejects %s', async status => {
        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(order(status) as never);
        await expect(closeOrder('po', 'reason', 'actor')).rejects.toThrow();
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
    });
    it.each([[], [item('a', 10, 0)], [item('a', 10, 10)], [item('a', 10, 11)]].map(items => ({ items })))('rejects inconsistent partial quantities', async ({ items }) => {
        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue({ ...order(), items } as never);
        await expect(closeOrder('po', 'reason', 'actor')).rejects.toThrow();
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
    it('rejects empty IDs without a transaction', async () => {
        await expect(closeOrder('  ', 'reason', 'actor')).rejects.toThrow();
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it('propagates audit failure so the transaction rolls back', async () => {
        vi.mocked(logActivity).mockRejectedValue(new Error('audit unavailable'));
        await expect(closeOrder('po', 'reason', 'actor')).rejects.toThrow('audit unavailable');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
});
