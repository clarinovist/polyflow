import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOrder, updateOrder, updateOrderStatus, deleteOrder, getPurchaseOrders, getPurchaseOrderById } from '../orders-service';
import { prisma } from '@/lib/core/prisma';
import { PurchaseOrderStatus } from '@prisma/client';

// Mock Prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        purchaseOrder: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
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
            } as never);

            const mockCreatedOrder = { id: 'po-1', orderNumber: `PO-${year}-0006`, totalAmount: 500 };
             
            vi.mocked(prisma.purchaseOrder.create).mockResolvedValue(mockCreatedOrder as any);

            const input = {
                supplierId: 'sup-1',
                orderDate: new Date(),
                expectedDate: new Date(),
                deliveryAddress: null,
                notes: 'Test PO',
                shippingCost: 0,
                items: [
                    { productVariantId: 'pv-1', quantity: 10, unitPrice: 20, discountPercent: 0, taxPercent: 0, dppOtherAmount: null }, // 200
                    { productVariantId: 'pv-2', quantity: 5, unitPrice: 60, discountPercent: 0, taxPercent: 0, dppOtherAmount: null }   // 300 -> Total 500
                ]
            };

            const result = await createOrder(input as any, 'user-1');

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
            vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue({
                id: 'po-1',
                orderNumber: 'PO-TEST',
                status: PurchaseOrderStatus.DRAFT,
            } as never);
            vi.mocked(prisma.purchaseOrder.update).mockResolvedValue({
                id: 'po-1',
                orderNumber: 'PO-TEST',
                status: PurchaseOrderStatus.SENT
            } as never);

            const result = await updateOrderStatus('po-1', PurchaseOrderStatus.SENT, 'user-1');

            expect(result.status).toBe(PurchaseOrderStatus.SENT);
            expect(prisma.purchaseOrder.update).toHaveBeenCalledWith({
                where: { id: 'po-1' },
                data: { status: PurchaseOrderStatus.SENT }
            });
            // Audit log check — includes fromStatus/toStatus
            const auditMock = await import('@/lib/tools/audit');
            expect(auditMock.logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    fromStatus: PurchaseOrderStatus.DRAFT,
                    toStatus: PurchaseOrderStatus.SENT,
                })
            );
        });
    });

    describe('deleteOrder', () => {
        it('should throw error if order is not in DRAFT or CANCELLED status', async () => {
            vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue({
                id: 'po-1',
                status: PurchaseOrderStatus.SENT,
                goodsReceipts: [],
                invoices: []
            } as never);

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
            } as never);

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

    describe('updateOrder', () => {
        it('should throw error if PO is RECEIVED or CANCELLED', async () => {
            vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue({
                id: 'po-1',
                status: PurchaseOrderStatus.RECEIVED,
                items: [],
                invoices: []
            } as never);

            await expect(updateOrder({ id: 'po-1', supplierId: 'sup-1', orderDate: new Date(), expectedDate: new Date(), notes: 'test', items: [] } as any))
                .rejects.toThrow(/Cannot edit Purchase Order with status RECEIVED/);
        });

        it('should throw error if attempting to edit unit price when invoices exist', async () => {
            vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue({
                id: 'po-1',
                status: PurchaseOrderStatus.SENT,
                items: [{ id: 'poi-1', productVariantId: 'pv-1', unitPrice: 100, receivedQty: 0, quantity: 10 }],
                invoices: [{ id: 'inv-1', status: 'UNPAID' }]
            } as never);

            const input = {
                id: 'po-1',
                supplierId: 'sup-1',
                orderDate: new Date(),
                expectedDate: new Date(),
                notes: 'test',
                items: [{ id: 'poi-1', productVariantId: 'pv-1', unitPrice: 150, quantity: 10 }]
            };

            await expect(updateOrder(input as any))
                .rejects.toThrow(/Unit price cannot be changed because invoices already exist/);
        });

        it('should update purchase order successfully in transaction', async () => {
            vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue({
                id: 'po-1',
                status: PurchaseOrderStatus.DRAFT,
                items: [{ id: 'poi-1', productVariantId: 'pv-1', unitPrice: 100, receivedQty: 0, quantity: 10 }],
                invoices: []
            } as never);

            const updatedMockOrder = { id: 'po-1', totalAmount: 1200 };
            vi.mocked(prisma.purchaseOrder.update).mockResolvedValue(updatedMockOrder as any);

            const input = {
                id: 'po-1',
                supplierId: 'sup-1',
                orderDate: new Date(),
                expectedDate: new Date(),
                notes: 'Updated PO',
                shippingCost: 50,
                items: [
                    { id: 'poi-1', productVariantId: 'pv-1', unitPrice: 100, quantity: 10, discountPercent: 0, taxPercent: 0 }
                ]
            };

            const result = await updateOrder(input as any);
            expect(result).toEqual(updatedMockOrder);
            expect(prisma.purchaseOrderItem.deleteMany).toHaveBeenCalled();
        });
    });

    describe('getPurchaseOrders', () => {
        it('should fetch list of purchase orders with filters', async () => {
            vi.mocked(prisma.purchaseOrder.findMany).mockResolvedValue([{ id: 'po-1' }] as any);

            const result = await getPurchaseOrders({ supplierId: 'sup-1', status: PurchaseOrderStatus.SENT });
            expect(result).toHaveLength(1);
            expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { supplierId: 'sup-1', status: PurchaseOrderStatus.SENT }
            }));
        });
    });

    describe('getPurchaseOrderById', () => {
        it('should fetch purchase order by ID with details', async () => {
            vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue({ id: 'po-1', orderNumber: 'PO-001' } as any);

            const result = await getPurchaseOrderById('po-1');
            expect(result).toEqual({ id: 'po-1', orderNumber: 'PO-001' });
            expect(prisma.purchaseOrder.findUnique).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'po-1' }
            }));
        });
    });
});


