import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createWalkInReceipt,
    approveWalkInInvoice,
    rejectWalkInInvoice,
} from '../walk-in-receipt-service';
import { BusinessRuleError } from '@/lib/errors/errors';

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        purchaseOrder: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        purchaseOrderItem: {
            findFirst: vi.fn(),
        },
        purchaseInvoice: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        supplier: {
            findUnique: vi.fn(),
        },
        location: {
            findUnique: vi.fn(),
        },
        productVariant: {
            findUnique: vi.fn(),
        },
        goodsReceipt: {
            findMany: vi.fn(),
        },
        $transaction: vi.fn((callback) => callback(mockPrisma)),
    },
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/config/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock('../orders-service', () => ({
    createOrder: vi.fn().mockResolvedValue({
        id: 'po-1',
        orderNumber: 'PO-2026-0001',
        items: [
            { productVariantId: 'pv-1', id: 'poi-1' },
        ],
    }),
    updateOrderStatus: vi.fn(),
}));

vi.mock('../receipts-service', () => ({
    createGoodsReceipt: vi.fn().mockResolvedValue({
        id: 'gr-1',
        receiptNumber: 'GR-2026-0001',
    }),
}));

describe('walk-in-receipt-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createWalkInReceipt', () => {
        const baseData = {
            supplierId: 'sup-1',
            supplierRefNo: 'NOTA-001',
            receivedDate: new Date('2026-07-28'),
            locationId: 'loc-1',
            notes: undefined as string | undefined,
            idempotencyKey: 'key-001',
            items: [
                {
                    productVariantId: 'pv-1',
                    receivedQty: 10,
                    unitCost: 5000,
                },
            ],
        };

        beforeEach(() => {
            mockPrisma.location.findUnique.mockResolvedValue({
                id: 'loc-1',
                name: 'Gudang Utama',
            });
            mockPrisma.supplier.findUnique.mockResolvedValue({
                id: 'sup-1',
                name: 'Supplier A',
            });
            mockPrisma.purchaseOrder.findFirst.mockResolvedValue(null);
        });

        it('should create PO and GR for valid walk-in', async () => {
            const result = await createWalkInReceipt(baseData, 'user-1');

            expect(result.purchaseOrder).toBeDefined();
            expect(result.goodsReceipt).toBeDefined();
            expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'po-1' },
                    data: expect.objectContaining({
                        entrySource: 'WALK_IN_RECEIPT',
                        sourceReference: 'NOTA-001',
                        idempotencyKey: 'key-001',
                    }),
                }),
            );
        });

        it('should return existing result on idempotency hit', async () => {
            mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
                id: 'po-existing',
                orderNumber: 'PO-2026-0001',
                goodsReceipts: [{ id: 'gr-existing', receiptNumber: 'GR-001' }],
                supplier: { id: 'sup-1', name: 'Supplier A' },
            });

            const result = await createWalkInReceipt(baseData, 'user-1');

            expect(result.purchaseOrder.id).toBe('po-existing');
            expect(result.goodsReceipt.id).toBe('gr-existing');
        });

        it('should reject blocked location (SCRAP)', async () => {
            mockPrisma.location.findUnique.mockResolvedValue({
                id: 'loc-scrap',
                name: 'SCRAP',
            });

            await expect(
                createWalkInReceipt(
                    { ...baseData, locationId: 'loc-scrap' },
                    'user-1',
                ),
            ).rejects.toThrow(BusinessRuleError);
        });

        it('should reject when unitCost is 0 (no fallback to 0.01)', async () => {
            mockPrisma.productVariant.findUnique.mockResolvedValue({
                standardCost: null,
            });
            mockPrisma.purchaseOrderItem.findFirst.mockResolvedValue(null);

            await expect(
                createWalkInReceipt(
                    {
                        ...baseData,
                        items: [
                            {
                                productVariantId: 'pv-1',
                                receivedQty: 10,
                                unitCost: 0,
                            },
                        ],
                    },
                    'user-1',
                ),
            ).rejects.toThrow(/Harga item/);
        });

        it('should reject when supplier not found', async () => {
            mockPrisma.supplier.findUnique.mockResolvedValue(null);

            await expect(
                createWalkInReceipt(baseData, 'user-1'),
            ).rejects.toThrow(/Supplier tidak ditemukan/);
        });

        it('should reject empty items', async () => {
            await expect(
                createWalkInReceipt(
                    { ...baseData, items: [] },
                    'user-1',
                ),
            ).rejects.toThrow(/Minimal satu item/);
        });
    });

    describe('approveWalkInInvoice', () => {
        it('should approve DRAFT walk-in invoice to UNPAID', async () => {
            mockPrisma.purchaseInvoice.findUnique.mockResolvedValue({
                id: 'inv-1',
                status: 'DRAFT',
                purchaseOrder: {
                    id: 'po-1',
                    entrySource: 'WALK_IN_RECEIPT',
                    commercialReviewStatus: 'PENDING',
                },
            });
            mockPrisma.purchaseInvoice.update.mockResolvedValue({
                id: 'inv-1',
                status: 'UNPAID',
            });
            mockPrisma.purchaseOrder.update.mockResolvedValue({});

            await approveWalkInInvoice('inv-1', 'user-1');

            expect(mockPrisma.purchaseInvoice.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { status: 'UNPAID' },
                }),
            );
        });

        it('should be idempotent for already UNPAID invoice', async () => {
            mockPrisma.purchaseInvoice.findUnique.mockResolvedValue({
                id: 'inv-1',
                status: 'UNPAID',
                purchaseOrder: {
                    id: 'po-1',
                    entrySource: 'WALK_IN_RECEIPT',
                },
            });

            const result = await approveWalkInInvoice('inv-1', 'user-1');

            expect(result.status).toBe('UNPAID');
            expect(mockPrisma.purchaseInvoice.update).not.toHaveBeenCalled();
        });

        it('should reject non-walk-in invoice', async () => {
            mockPrisma.purchaseInvoice.findUnique.mockResolvedValue({
                id: 'inv-1',
                status: 'DRAFT',
                purchaseOrder: {
                    id: 'po-1',
                    entrySource: 'STANDARD',
                },
            });

            await expect(
                approveWalkInInvoice('inv-1', 'user-1'),
            ).rejects.toThrow(/bukan walk-in/);
        });
    });

    describe('rejectWalkInInvoice', () => {
        it('should cancel DRAFT walk-in invoice', async () => {
            mockPrisma.purchaseInvoice.findUnique.mockResolvedValue({
                id: 'inv-1',
                status: 'DRAFT',
                purchaseOrder: {
                    id: 'po-1',
                    orderNumber: 'PO-001',
                    entrySource: 'WALK_IN_RECEIPT',
                },
            });
            mockPrisma.purchaseInvoice.update.mockResolvedValue({
                id: 'inv-1',
                status: 'CANCELLED',
            });
            mockPrisma.purchaseOrder.update.mockResolvedValue({});

            await rejectWalkInInvoice('inv-1', 'user-1', 'Salah harga');

            expect(mockPrisma.purchaseInvoice.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { status: 'CANCELLED' },
                }),
            );
        });

        it('should be idempotent for already CANCELLED invoice', async () => {
            mockPrisma.purchaseInvoice.findUnique.mockResolvedValue({
                id: 'inv-1',
                status: 'CANCELLED',
                purchaseOrder: {
                    id: 'po-1',
                    entrySource: 'WALK_IN_RECEIPT',
                },
            });

            const result = await rejectWalkInInvoice('inv-1', 'user-1');

            expect(result.status).toBe('CANCELLED');
        });
    });
});
