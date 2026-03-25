import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOrder, updateOrderStatus, deleteOrder } from '../orders-service';
import { prisma } from '@/lib/core/prisma';
import { PurchaseOrderStatus } from '@prisma/client';

// Mock Prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        purchaseOrder: {
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            findUnique: vi.fn(),
            delete: vi.fn(),
        },
        purchaseOrderItem: {
            deleteMany: vi.fn(),
        },
        $transaction: vi.fn(async (cb) => {
            return cb(prisma);
        })
    },
}));

// Mock Audit
vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

describe('OrdersService (Purchasing)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createOrder', () => {
        it('should calculate total amount and generate correct PO number', async () => {
            // Mock last order for numbering
            const year = new Date().getFullYear();
            vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue({
                orderNumber: `PO-${year}-0005`
            } as any);

            const mockCreatedOrder = { id: 'po-1', orderNumber: `PO-${year}-0006`, totalAmount: 500 };
            vi.mocked(prisma.purchaseOrder.create).mockResolvedValue(mockCreatedOrder as any);

            const input = {
                supplierId: 'sup-1',
                orderDate: new Date(),
                expectedDate: new Date(),
                notes: 'Test PO',
                items: [
                    { productVariantId: 'pv-1', quantity: 10, unitPrice: 20 }, // 200
                    { productVariantId: 'pv-2', quantity: 5, unitPrice: 60 }   // 300 -> Total 500
                ]
            };

            const result = await createOrder(input, 'user-1');

            expect(result).toEqual(mockCreatedOrder);
            expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        orderNumber: `PO-${year}-0006`,
                        totalAmount: 500, // 200 + 300
                        status: PurchaseOrderStatus.DRAFT,
                        createdById: 'user-1'
                    })
                })
            );
        });
    });

    describe('updateOrderStatus', () => {
        it('should update status and log activity', async () => {
            vi.mocked(prisma.purchaseOrder.update).mockResolvedValue({
                id: 'po-1',
                orderNumber: 'PO-TEST',
                status: PurchaseOrderStatus.SENT
            } as any);

            const result = await updateOrderStatus('po-1', PurchaseOrderStatus.SENT, 'user-1');

            expect(result.status).toBe(PurchaseOrderStatus.SENT);
            expect(prisma.purchaseOrder.update).toHaveBeenCalledWith({
                where: { id: 'po-1' },
                data: { status: PurchaseOrderStatus.SENT }
            });
            // Audit log check
            const auditMock = await import('@/lib/tools/audit');
            expect(auditMock.logActivity).toHaveBeenCalled();
        });
    });

    describe('deleteOrder', () => {
        it('should throw error if order is not in DRAFT or CANCELLED status', async () => {
            vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue({
                id: 'po-1',
                status: PurchaseOrderStatus.SENT,
                goodsReceipts: [],
                invoices: []
            } as any);

            await expect(deleteOrder('po-1', 'user-1'))
                .rejects.toThrow(/Only DRAFT or CANCELLED orders can be deleted/);
        });

        it('should delete order and items if in DRAFT status', async () => {
            vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue({
                id: 'po-1',
                orderNumber: 'PO-TEST',
                status: PurchaseOrderStatus.DRAFT,
                goodsReceipts: [],
                invoices: []
            } as any);

            await deleteOrder('po-1', 'user-1');

            expect(prisma.$transaction).toHaveBeenCalled();
            expect(prisma.purchaseOrderItem.deleteMany).toHaveBeenCalledWith({
                where: { purchaseOrderId: 'po-1' }
            });
            expect(prisma.purchaseOrder.delete).toHaveBeenCalledWith({
                where: { id: 'po-1' }
            });
        });
    });
});

