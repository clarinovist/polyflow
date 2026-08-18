import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    updateDeliveryItemNotes,
    getDeliveryOrders,
    getOpenDeliveryOrders,
    getOpenDeliveryOrderCount,
    getDeliveryOrderById,
    fetchDeliveryStockReadiness,
    updateDeliveryStatus,
    reverseDeliveryShipment,
} from '../deliveries';
import { prisma } from '@/lib/core/prisma';
import {
    requireWarehouseResourcePermission,
    requireAuth,
} from '@/lib/tools/auth-checks';
import { requireSalesApprover } from '@/lib/auth/sales-access';
import { logActivity } from '@/lib/tools/audit';

const mockGetDeliveryStockReadiness = vi.fn();
vi.mock('@/services/sales/delivery-fulfillment-service', () => ({
    getDeliveryStockReadiness: (...args: unknown[]) =>
        mockGetDeliveryStockReadiness(...args),
}));

const mockReverseDeliveryShipment = vi.fn();
vi.mock('@/services/sales/delivery-reversal-service', () => ({
    reverseDeliveryShipment: (...args: unknown[]) =>
        mockReverseDeliveryShipment(...args),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        deliveryOrder: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
            update: vi.fn(),
        },
        deliveryOrderItem: {
            update: vi.fn(),
        },
        performanceMetric: {
            create: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    },
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
    requireWarehouseResourcePermission: vi.fn(),
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesApprover: vi.fn(),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

const baseDeliveryOrder = {
    id: 'do-1',
    orderNumber: 'DO-2026-0001',
    status: 'PENDING',
    items: [
        { id: 'item-1', notes: null },
        { id: 'item-2', notes: 'lama' },
    ],
};

describe('updateDeliveryItemNotes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireWarehouseResourcePermission).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);
    });

    it('saves per-item Keterangan text without touching quantity/verification fields', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            baseDeliveryOrder as never,
        );

        const result = await updateDeliveryItemNotes({
            deliveryOrderId: 'do-1',
            items: [
                { id: 'item-1', notes: '97 rol, 6 zak' },
                { id: 'item-2', notes: '' },
            ],
        });

        expect(result).toEqual({ success: true, data: { success: true } });
        expect(prisma.deliveryOrderItem.update).toHaveBeenCalledWith({
            where: { id: 'item-1' },
            data: { notes: '97 rol, 6 zak' },
        });
        expect(prisma.deliveryOrderItem.update).toHaveBeenCalledWith({
            where: { id: 'item-2' },
            data: { notes: null },
        });
        // Only `notes` is touched — no quantity/verifiedQuantity/verifiedAt keys.
        for (const call of vi.mocked(prisma.deliveryOrderItem.update).mock
            .calls) {
            expect(Object.keys(call[0].data)).toEqual(['notes']);
        }
        expect(logActivity).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'UPDATE_DELIVERY_ITEM_NOTES' }),
        );
    });

    it('rejects when the delivery order is not PENDING or LOADING', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
            ...baseDeliveryOrder,
            status: 'SHIPPED',
        } as never);

        const result = await updateDeliveryItemNotes({
            deliveryOrderId: 'do-1',
            items: [{ id: 'item-1', notes: '97 rol, 6 zak' }],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.code).toBe('INVALID_DELIVERY_STATUS');
        }
        expect(prisma.deliveryOrderItem.update).not.toHaveBeenCalled();
    });

    it('rejects when the delivery order does not exist', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            null as never,
        );

        const result = await updateDeliveryItemNotes({
            deliveryOrderId: 'missing-do',
            items: [{ id: 'item-1', notes: 'x' }],
        });

        expect(result.success).toBe(false);
    });

    it('rejects when an item id does not belong to the delivery order', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            baseDeliveryOrder as never,
        );

        const result = await updateDeliveryItemNotes({
            deliveryOrderId: 'do-1',
            items: [{ id: 'not-in-this-do', notes: 'x' }],
        });

        expect(result.success).toBe(false);
        expect(prisma.deliveryOrderItem.update).not.toHaveBeenCalled();
    });

    it('strips script tags from Keterangan text before saving', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            baseDeliveryOrder as never,
        );

        await updateDeliveryItemNotes({
            deliveryOrderId: 'do-1',
            items: [
                {
                    id: 'item-1',
                    notes: '<script>alert(1)</script>97 rol',
                },
            ],
        });

        expect(prisma.deliveryOrderItem.update).toHaveBeenCalledWith({
            where: { id: 'item-1' },
            data: { notes: '97 rol' },
        });
    });
});

describe('getDeliveryOrders', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sorts open (PENDING/LOADING) delivery orders ahead of closed ones', async () => {
        vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
            { id: 'do-shipped', status: 'SHIPPED' },
            { id: 'do-pending', status: 'PENDING' },
            { id: 'do-loading', status: 'LOADING' },
        ] as never);

        const result = await getDeliveryOrders();

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.map((d) => d.id)).toEqual([
                'do-pending',
                'do-loading',
                'do-shipped',
            ]);
        }
    });

    it('filters by deliveryDate range while still including open DOs via OR', async () => {
        vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([]);

        await getDeliveryOrders({
            startDate: new Date('2026-08-01'),
            endDate: new Date('2026-08-31'),
        });

        const callArgs = vi.mocked(prisma.deliveryOrder.findMany).mock
            .calls[0][0] as { where: { OR?: unknown[] } };
        expect(callArgs.where.OR).toHaveLength(2);
    });

    it('records a performance metric sample without blocking the response', async () => {
        // Arrange
        vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([]);

        // Act
        await getDeliveryOrders();

        // Assert
        expect(prisma.performanceMetric.create).toHaveBeenCalledTimes(1);
        const call = vi.mocked(prisma.performanceMetric.create).mock
            .calls[0][0] as { data: { route: string; durationMs: number } };
        expect(call.data.route).toBe('delivery-orders-list');
        expect(call.data.durationMs).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(call.data.durationMs)).toBe(true);
    });

    it('does not fail the request when recording the metric sample rejects', async () => {
        // Arrange
        vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([]);
        vi.mocked(prisma.performanceMetric.create).mockRejectedValueOnce(
            new Error('db unreachable'),
        );

        // Act
        const result = await getDeliveryOrders();

        // Assert
        expect(result.success).toBe(true);
    });
});

describe('getOpenDeliveryOrders', () => {
    it('orders LOADING before PENDING, then by deliveryDate', async () => {
        vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
            { id: 'b', status: 'PENDING', deliveryDate: '2026-08-02' },
            { id: 'a', status: 'LOADING', deliveryDate: '2026-08-03' },
        ] as never);

        const result = await getOpenDeliveryOrders();

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.map((d) => d.id)).toEqual(['a', 'b']);
        }
    });
});

describe('getOpenDeliveryOrderCount', () => {
    it('returns the count of PENDING/LOADING delivery orders', async () => {
        vi.mocked(prisma.deliveryOrder.count).mockResolvedValue(3);

        const result = await getOpenDeliveryOrderCount();

        expect(result).toEqual({ success: true, data: 3 });
    });
});

describe('getDeliveryOrderById', () => {
    it('returns the delivery order when found', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
            id: 'do-1',
            orderNumber: 'DO-2026-0001',
        } as never);

        const result = await getDeliveryOrderById('do-1');

        expect(result).toEqual({
            success: true,
            data: { id: 'do-1', orderNumber: 'DO-2026-0001' },
        });
    });

    it('returns null data when the delivery order does not exist', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            null as never,
        );

        const result = await getDeliveryOrderById('missing');

        expect(result).toEqual({ success: true, data: null });
    });
});

describe('fetchDeliveryStockReadiness', () => {
    it('delegates to the fulfillment service after requiring auth', async () => {
        vi.mocked(requireAuth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);
        mockGetDeliveryStockReadiness.mockResolvedValue([
            { productVariantId: 'pv-1', isReady: true },
        ]);

        const result = await fetchDeliveryStockReadiness('do-1');

        expect(requireAuth).toHaveBeenCalled();
        expect(mockGetDeliveryStockReadiness).toHaveBeenCalledWith('do-1');
        expect(result).toEqual({
            success: true,
            data: [{ productVariantId: 'pv-1', isReady: true }],
        });
    });
});

describe('updateDeliveryStatus — SHIPPED→CANCELLED guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireWarehouseResourcePermission).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);
    });

    it('rejects a direct SHIPPED→CANCELLED status change and points to reverseDeliveryShipment', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
            id: 'do-1',
            status: 'SHIPPED',
            salesOrderId: 'so-1',
            orderNumber: 'DO-2026-0080',
        } as never);

        const result = await updateDeliveryStatus('do-1', 'CANCELLED');

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.code).toBe('USE_REVERSE_DELIVERY_SHIPMENT');
        }
        expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
    });

    it('still allows other valid transitions (e.g. SHIPPED→IN_TRANSIT)', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
            id: 'do-1',
            status: 'SHIPPED',
            salesOrderId: 'so-1',
            orderNumber: 'DO-2026-0080',
        } as never);

        const result = await updateDeliveryStatus('do-1', 'IN_TRANSIT');

        expect(result.success).toBe(true);
        expect(prisma.deliveryOrder.update).toHaveBeenCalledWith({
            where: { id: 'do-1' },
            data: { status: 'IN_TRANSIT' },
        });
    });
});

describe('reverseDeliveryShipment action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rejects non-ADMIN callers before touching the service', async () => {
        vi.mocked(requireSalesApprover).mockRejectedValue(
            new Error('Unauthorized: Hanya admin yang dapat melakukan aksi ini.'),
        );

        const result = await reverseDeliveryShipment({
            deliveryOrderId: 'do-1',
            reason: 'Revisi order sebelum kirim ulang',
        });

        expect(result.success).toBe(false);
        expect(mockReverseDeliveryShipment).not.toHaveBeenCalled();
    });

    it('delegates to the reversal service for an ADMIN caller', async () => {
        vi.mocked(requireSalesApprover).mockResolvedValue({
            user: { id: 'admin-1' },
        } as never);
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
            salesOrderId: 'so-1',
        } as never);
        mockReverseDeliveryShipment.mockResolvedValue({
            success: true,
            reversedLines: 1,
        });

        const result = await reverseDeliveryShipment({
            deliveryOrderId: 'do-1',
            reason: 'Revisi order sebelum kirim ulang',
        });

        expect(mockReverseDeliveryShipment).toHaveBeenCalledWith(
            'do-1',
            'admin-1',
            'Revisi order sebelum kirim ulang',
        );
        expect(result).toEqual({
            success: true,
            data: { success: true, reversedLines: 1 },
        });
    });

    it('rejects a reason shorter than 5 characters via schema validation', async () => {
        vi.mocked(requireSalesApprover).mockResolvedValue({
            user: { id: 'admin-1' },
        } as never);

        const result = await reverseDeliveryShipment({
            deliveryOrderId: 'do-1',
            reason: 'x',
        });

        expect(result.success).toBe(false);
        expect(mockReverseDeliveryShipment).not.toHaveBeenCalled();
    });
});
