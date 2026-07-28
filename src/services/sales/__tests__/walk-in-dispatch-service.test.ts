import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createWalkInDispatch,
    approveWalkInDispatch,
    rejectWalkInDispatch,
} from '../walk-in-dispatch-service';
import { BusinessRuleError } from '@/lib/errors/errors';

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        salesOrder: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
        customer: {
            findUnique: vi.fn(),
        },
        customerProductPrice: {
            findFirst: vi.fn(),
        },
        location: {
            findUnique: vi.fn(),
        },
        productVariant: {
            findUnique: vi.fn(),
        },
        deliveryOrder: {},
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

vi.mock('../credit-service', () => ({
    checkCreditLimit: vi.fn(),
}));

vi.mock('../orders-service', () => ({
    confirmOrder: vi.fn().mockResolvedValue({
        orderId: 'so-1',
        status: 'CONFIRMED',
    }),
}));

vi.mock('../delivery-fulfillment-service', () => ({
    createDeliveryOrderFromSalesOrder: vi.fn().mockResolvedValue({
        id: 'do-1',
        orderNumber: 'DO-2026-0001',
    }),
}));

describe('walk-in-dispatch-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createWalkInDispatch', () => {
        const baseData = {
            customerId: 'cust-1',
            sourceLocationId: 'loc-1',
            sourceReference: 'WA-08123456789',
            idempotencyKey: 'key-001',
            items: [
                {
                    productVariantId: 'pv-1',
                    quantity: 5,
                },
            ],
        };

        beforeEach(() => {
            mockPrisma.salesOrder.findFirst.mockResolvedValue(null);
            mockPrisma.customer.findUnique.mockResolvedValue({
                id: 'cust-1',
                name: 'Customer A',
                lifecycleStatus: 'ACTIVE',
            });
            mockPrisma.location.findUnique.mockResolvedValue({
                id: 'loc-1',
                name: 'Gudang Utama',
            });
            mockPrisma.customerProductPrice.findFirst.mockResolvedValue({
                unitPrice: { toNumber: () => 10000 },
            });
            mockPrisma.salesOrder.create.mockResolvedValue({
                id: 'so-1',
                orderNumber: 'SO-2026-0001',
                status: 'CONFIRMED',
                commercialReviewStatus: 'NOT_REQUIRED',
                entrySource: 'EMERGENCY_DISPATCH',
                items: [],
            });
        });

        it('should create SO and DO for valid emergency dispatch', async () => {
            const result = await createWalkInDispatch(baseData, 'user-1');

            expect(result.salesOrder).toBeDefined();
            expect(result.deliveryOrder).toBeDefined();
            expect(result.needsApproval).toBe(false);
        });

        it('should return existing result on idempotency hit', async () => {
            mockPrisma.salesOrder.findFirst.mockResolvedValue({
                id: 'so-existing',
                orderNumber: 'SO-2026-0001',
                status: 'CONFIRMED',
                commercialReviewStatus: 'NOT_REQUIRED',
                deliveryOrders: [{ id: 'do-existing', orderNumber: 'DO-001' }],
            });

            const result = await createWalkInDispatch(baseData, 'user-1');

            expect(result.salesOrder.id).toBe('so-existing');
            expect(result.deliveryOrder?.id).toBe('do-existing');
        });

        it('should reject inactive customer', async () => {
            mockPrisma.customer.findUnique.mockResolvedValue({
                id: 'cust-1',
                name: 'Customer A',
                lifecycleStatus: 'INACTIVE',
            });

            await expect(
                createWalkInDispatch(baseData, 'user-1'),
            ).rejects.toThrow(/tidak aktif/);
        });

        it('should reject when price not found for non-free item', async () => {
            mockPrisma.customerProductPrice.findFirst.mockResolvedValue(null);
            mockPrisma.productVariant.findUnique.mockResolvedValue({
                sellPrice: null,
                price: null,
            });

            await expect(
                createWalkInDispatch(baseData, 'user-1'),
            ).rejects.toThrow(/Harga.*tidak ditemukan/);
        });

        it('should allow free item with zero price', async () => {
            const result = await createWalkInDispatch(
                {
                    ...baseData,
                    items: [
                        {
                            productVariantId: 'pv-1',
                            quantity: 5,
                            isFreeItem: true,
                        },
                    ],
                },
                'user-1',
            );

            expect(result.salesOrder).toBeDefined();
        });

        it('should reject empty items', async () => {
            await expect(
                createWalkInDispatch(
                    { ...baseData, items: [] },
                    'user-1',
                ),
            ).rejects.toThrow(/Minimal satu item/);
        });

        it('should need approval when credit check fails', async () => {
            const { checkCreditLimit } = await import('../credit-service');
            (checkCreditLimit as ReturnType<typeof vi.fn>).mockRejectedValue(
                new BusinessRuleError('CREDIT_LIMIT_EXCEEDED'),
            );

            const result = await createWalkInDispatch(baseData, 'user-1');

            expect(result.needsApproval).toBe(true);
            expect(result.deliveryOrder).toBeNull();
        });
    });

    describe('approveWalkInDispatch', () => {
        it('should approve pending emergency dispatch and create DO', async () => {
            mockPrisma.salesOrder.findUnique.mockResolvedValue({
                id: 'so-1',
                entrySource: 'EMERGENCY_DISPATCH',
                commercialReviewStatus: 'PENDING',
                sourceLocationId: 'loc-1',
                items: [],
                deliveryOrders: [],
            });
            mockPrisma.salesOrder.update.mockResolvedValue({});

            const result = await approveWalkInDispatch('so-1', 'user-1');

            expect(result.deliveryOrder).toBeDefined();
        });

        it('should be idempotent when DO already exists', async () => {
            mockPrisma.salesOrder.findUnique.mockResolvedValue({
                id: 'so-1',
                entrySource: 'EMERGENCY_DISPATCH',
                commercialReviewStatus: 'PENDING',
                items: [],
                deliveryOrders: [{ id: 'do-existing' }],
            });

            const result = await approveWalkInDispatch('so-1', 'user-1');

            expect(result.deliveryOrder.id).toBe('do-existing');
        });

        it('should reject non-emergency SO', async () => {
            mockPrisma.salesOrder.findUnique.mockResolvedValue({
                id: 'so-1',
                entrySource: 'STANDARD',
                commercialReviewStatus: 'NOT_REQUIRED',
            });

            await expect(
                approveWalkInDispatch('so-1', 'user-1'),
            ).rejects.toThrow(/bukan emergency/);
        });
    });

    describe('rejectWalkInDispatch', () => {
        it('should cancel and reject emergency dispatch', async () => {
            mockPrisma.salesOrder.findUnique.mockResolvedValue({
                id: 'so-1',
                entrySource: 'EMERGENCY_DISPATCH',
                commercialReviewStatus: 'PENDING',
            });
            mockPrisma.salesOrder.update.mockResolvedValue({
                id: 'so-1',
                status: 'CANCELLED',
                commercialReviewStatus: 'REJECTED',
            });

            await rejectWalkInDispatch('so-1', 'user-1', 'Stok kosong');

            expect(mockPrisma.salesOrder.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        commercialReviewStatus: 'REJECTED',
                        status: 'CANCELLED',
                    },
                }),
            );
        });
    });
});
