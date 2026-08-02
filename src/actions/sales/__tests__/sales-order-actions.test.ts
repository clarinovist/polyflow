import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getSalesOrders,
    checkSalesOrderFulfillment,
    getSalesOrdersByCustomerId,
    getSalesOrderById,
    updateSalesOrder,
    confirmSalesOrder,
    markReadyToShip,
    shipSalesOrder,
    deliverSalesOrder,
    cancelSalesOrder,
    deleteSalesOrder,
    sendQuotationOrder,
    acceptQuotationOrder,
    rejectQuotationOrder,
    reopenQuotationOrder,
} from '../sales';
import { SalesService } from '@/services/sales/sales-service';
import {
    sendQuotation,
    acceptQuotation,
    rejectQuotation,
    reopenQuotation,
} from '@/services/sales/orders-service';
import { requireAuth } from '@/lib/tools/auth-checks';
import { requireSalesAccess, requireSalesApprover } from '@/lib/auth/sales-access';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError } from '@/lib/errors/errors';

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesOrder: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
            aggregate: vi.fn(),
            groupBy: vi.fn(),
        },
        inventory: {
            findMany: vi.fn(),
        },
        stockReservation: {
            groupBy: vi.fn(),
        },
    },
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn(),
    requireSalesApprover: vi.fn(),
}));

vi.mock('@/services/sales/sales-service', () => ({
    SalesService: {
        getOrders: vi.fn(),
        getOrderById: vi.fn(),
        updateOrder: vi.fn(),
        confirmOrder: vi.fn(),
        markReadyToShip: vi.fn(),
        shipOrder: vi.fn(),
        deliverOrder: vi.fn(),
        cancelOrder: vi.fn(),
        deleteOrder: vi.fn(),
    },
}));

vi.mock('@/services/sales/orders-service', () => ({
    sendQuotation: vi.fn(),
    acceptQuotation: vi.fn(),
    rejectQuotation: vi.fn(),
    reopenQuotation: vi.fn(),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const SESSION = { user: { id: 'user-1' } };

/** Unwrap a safeAction envelope, failing loudly when the action errored. */
function dataOf<T>(res: { success: boolean; data?: T; error?: string }): T {
    if (!res.success) throw new Error(`action failed: ${res.error}`);
    return res.data as T;
}

describe('sales order actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
        vi.mocked(requireSalesAccess).mockResolvedValue(SESSION as never);
        vi.mocked(requireSalesApprover).mockResolvedValue(SESSION as never);
    });

    describe('read actions', () => {
        it('passes date range and filters through to the service', async () => {
            // Arrange
            vi.mocked(SalesService.getOrders).mockResolvedValue([] as never);
            const startDate = new Date('2026-07-01');
            const endDate = new Date('2026-07-31');

            // Act
            await getSalesOrders(true, { startDate, endDate }, 'customer', {
                orderType: 'MAKLON_JASA',
                paymentState: 'outstanding',
            });

            // Assert
            expect(SalesService.getOrders).toHaveBeenCalledWith(
                expect.objectContaining({
                    includeItems: true,
                    startDate,
                    endDate,
                    demandType: 'customer',
                    orderType: 'MAKLON_JASA',
                    paymentState: 'outstanding',
                }),
            );
        });

        it('falls back to defaults when called with no arguments', async () => {
            // Arrange
            vi.mocked(SalesService.getOrders).mockResolvedValue([] as never);

            // Act
            await getSalesOrders();

            // Assert
            expect(SalesService.getOrders).toHaveBeenCalledWith({
                includeItems: false,
                startDate: undefined,
                endDate: undefined,
                demandType: undefined,
                orderType: undefined,
                orderTypes: undefined,
                paymentState: undefined,
                statusFilter: undefined,
            });
        });

        it('scopes the order list to one customer', async () => {
            // Arrange
            vi.mocked(SalesService.getOrders).mockResolvedValue([
                { id: 'so-1' },
            ] as never);

            // Act
            const res = await getSalesOrdersByCustomerId('cust-1');

            // Assert
            expect(SalesService.getOrders).toHaveBeenCalledWith({
                customerId: 'cust-1',
            });
            expect(dataOf(res)).toHaveLength(1);
        });

        it('returns null instead of erroring when the order is missing', async () => {
            // Arrange
            vi.mocked(SalesService.getOrderById).mockResolvedValue(
                null as never,
            );

            // Act
            const res = await getSalesOrderById('missing');

            // Assert
            expect(dataOf(res)).toBeNull();
        });

        it('serializes the order it found', async () => {
            // Arrange
            vi.mocked(SalesService.getOrderById).mockResolvedValue({
                id: 'so-1',
                orderNumber: 'SO-1',
            } as never);

            // Act
            const res = await getSalesOrderById('so-1');

            // Assert
            expect(dataOf(res)).toMatchObject({ orderNumber: 'SO-1' });
        });
    });

    describe('lifecycle actions', () => {
        it('updates an order and revalidates its detail page', async () => {
            // Arrange
            vi.mocked(SalesService.updateOrder).mockResolvedValue(
                undefined as never,
            );

            // Act — updateSalesOrderSchema requires a date and at least one item
            const res = await updateSalesOrder({
                id: 'so-1',
                orderDate: new Date('2026-07-06'),
                notes: 'catatan',
                items: [
                    {
                        productVariantId: 'pv-1',
                        quantity: 2,
                        unitPrice: 1000,
                    },
                ],
            } as never);

            // Assert
            expect(SalesService.updateOrder).toHaveBeenCalled();
            expect(revalidatePath).toHaveBeenCalledWith('/sales/orders/so-1');
            expect(dataOf(res)).toEqual({ id: 'so-1' });
        });

        it('confirms an order on behalf of the current user', async () => {
            // Arrange
            vi.mocked(SalesService.confirmOrder).mockResolvedValue({
                id: 'so-1',
            } as never);

            // Act
            await confirmSalesOrder('so-1');

            // Assert
            expect(SalesService.confirmOrder).toHaveBeenCalledWith(
                'so-1',
                'user-1',
            );
        });

        it('marks an order ready to ship', async () => {
            // Arrange
            vi.mocked(SalesService.markReadyToShip).mockResolvedValue(
                undefined as never,
            );

            // Act
            const res = await markReadyToShip('so-1');

            // Assert
            expect(SalesService.markReadyToShip).toHaveBeenCalledWith(
                'so-1',
                'user-1',
            );
            expect(dataOf(res)).toBe(true);
        });

        it('ships an order with carrier details and revalidates inventory', async () => {
            // Arrange
            vi.mocked(SalesService.shipOrder).mockResolvedValue(
                undefined as never,
            );

            // Act
            await shipSalesOrder({
                id: 'so-1',
                trackingNumber: 'RESI-1',
                carrier: 'JNE',
            });

            // Assert
            expect(SalesService.shipOrder).toHaveBeenCalledWith(
                'so-1',
                'user-1',
                { trackingNumber: 'RESI-1', carrier: 'JNE' },
            );
            expect(revalidatePath).toHaveBeenCalledWith('/warehouse/inventory');
        });

        it('ships an order when carrier details are omitted', async () => {
            // Arrange
            vi.mocked(SalesService.shipOrder).mockResolvedValue(
                undefined as never,
            );

            // Act
            const res = await shipSalesOrder({ id: 'so-1' });

            // Assert — the schema defaults both optional fields to ''
            expect(SalesService.shipOrder).toHaveBeenCalledWith(
                'so-1',
                'user-1',
                { trackingNumber: '', carrier: '' },
            );
            expect(dataOf(res)).toBe(true);
        });

        it('delivers an order and revalidates the delivery pages', async () => {
            // Arrange
            vi.mocked(SalesService.deliverOrder).mockResolvedValue(
                undefined as never,
            );

            // Act
            await deliverSalesOrder('so-1');

            // Assert
            expect(SalesService.deliverOrder).toHaveBeenCalledWith(
                'so-1',
                'user-1',
            );
            expect(revalidatePath).toHaveBeenCalledWith('/sales/deliveries');
        });

        it('requires approver rights to cancel, not plain auth', async () => {
            // Arrange
            vi.mocked(SalesService.cancelOrder).mockResolvedValue(
                undefined as never,
            );

            // Act
            await cancelSalesOrder('so-1');

            // Assert
            expect(requireSalesApprover).toHaveBeenCalled();
            expect(SalesService.cancelOrder).toHaveBeenCalledWith(
                'so-1',
                'user-1',
            );
        });

        it('surfaces a service failure as a failed envelope', async () => {
            // Arrange
            vi.mocked(SalesService.cancelOrder).mockRejectedValue(
                new Error('boom'),
            );

            // Act
            const res = await cancelSalesOrder('so-1');

            // Assert
            expect(res.success).toBe(false);
        });

        it('deletes an order', async () => {
            // Arrange
            vi.mocked(SalesService.deleteOrder).mockResolvedValue(
                undefined as never,
            );

            // Act
            const res = await deleteSalesOrder('so-1');

            // Assert
            expect(SalesService.deleteOrder).toHaveBeenCalledWith('so-1');
            expect(dataOf(res)).toBe(true);
        });
    });

    describe('checkSalesOrderFulfillment', () => {
        function stockFor(quantity: number) {
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
                id: 'so-1',
                sourceLocationId: 'loc-1',
                items: [{ productVariantId: 'pv-1', quantity: 10 }],
                productionOrders: [],
            } as never);
            vi.mocked(prisma.inventory.findMany).mockResolvedValue([
                { productVariantId: 'pv-1', quantity },
            ] as never);
        }

        it('can fulfil when free stock covers the order', async () => {
            // Arrange
            stockFor(25);
            vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue(
                [] as never,
            );

            // Act
            const res = await checkSalesOrderFulfillment('so-1');

            // Assert
            expect(dataOf(res)).toEqual({ canFulfill: true, shortages: [] });
        });

        it('counts other orders reservations against available stock', async () => {
            // Arrange — 25 on hand, 20 reserved elsewhere, 10 required
            stockFor(25);
            vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([
                {
                    productVariantId: 'pv-1',
                    _sum: { quantity: { toNumber: () => 20 } },
                },
            ] as never);

            // Act
            const res = await checkSalesOrderFulfillment('so-1');

            // Assert
            expect(dataOf(res)).toEqual({
                canFulfill: false,
                shortages: [
                    {
                        productVariantId: 'pv-1',
                        required: 10,
                        available: 5,
                        shortage: 5,
                    },
                ],
            });
        });

        it('never reports negative availability when over-reserved', async () => {
            // Arrange — reservations exceed stock on hand
            stockFor(5);
            vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([
                {
                    productVariantId: 'pv-1',
                    _sum: { quantity: { toNumber: () => 40 } },
                },
            ] as never);

            // Act
            const res = await checkSalesOrderFulfillment('so-1');

            // Assert
            expect(dataOf(res).shortages[0]).toMatchObject({
                available: 0,
                shortage: 10,
            });
        });

        it('treats a variant with no inventory row as zero stock', async () => {
            // Arrange
            stockFor(0);
            vi.mocked(prisma.inventory.findMany).mockResolvedValue([] as never);
            vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([
                { productVariantId: 'pv-1', _sum: { quantity: null } },
            ] as never);

            // Act
            const res = await checkSalesOrderFulfillment('so-1');

            // Assert
            expect(dataOf(res).canFulfill).toBe(false);
            expect(dataOf(res).shortages[0].available).toBe(0);
        });

        it('fails when the order does not exist', async () => {
            // Arrange
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
                null as never,
            );

            // Act
            const res = await checkSalesOrderFulfillment('missing');

            // Assert
            expect(res.success).toBe(false);
        });
    });

    describe('quotation actions', () => {
        it('sends a quotation as the current user', async () => {
            // Arrange
            vi.mocked(sendQuotation).mockResolvedValue({ id: 'so-1' } as never);

            // Act
            await sendQuotationOrder('so-1');

            // Assert
            expect(sendQuotation).toHaveBeenCalledWith('so-1', 'user-1');
            expect(revalidatePath).toHaveBeenCalledWith('/sales/orders');
        });

        it('accepts a quotation', async () => {
            // Arrange
            vi.mocked(acceptQuotation).mockResolvedValue({
                id: 'so-1',
            } as never);

            // Act
            await acceptQuotationOrder('so-1');

            // Assert
            expect(acceptQuotation).toHaveBeenCalledWith('so-1', 'user-1');
        });

        it('forwards the rejection reason as enum', async () => {
            // Arrange
            vi.mocked(rejectQuotation).mockResolvedValue({
                id: 'so-1',
            } as never);

            // Act
            await rejectQuotationOrder('so-1', 'HARGA_TERLALU_TINGGI' as never);

            // Assert
            expect(rejectQuotation).toHaveBeenCalledWith(
                'so-1',
                'user-1',
                'HARGA_TERLALU_TINGGI',
                undefined,
            );
        });

        it('forwards notes for LAINNYA', async () => {
            // Arrange
            vi.mocked(rejectQuotation).mockResolvedValue({
                id: 'so-1',
            } as never);

            // Act
            await rejectQuotationOrder(
                'so-1',
                'LAINNYA' as never,
                'custom reason detail',
            );

            // Assert
            expect(rejectQuotation).toHaveBeenCalledWith(
                'so-1',
                'user-1',
                'LAINNYA',
                'custom reason detail',
            );
        });

        it('reopens a closed quotation', async () => {
            // Arrange
            vi.mocked(reopenQuotation).mockResolvedValue({
                id: 'so-1',
            } as never);

            // Act
            await reopenQuotationOrder('so-1');

            // Assert
            expect(reopenQuotation).toHaveBeenCalledWith('so-1', 'user-1');
        });
    });

    describe('authorization guards (gap 03 — kelompok 5)', () => {
        // getSalesOrderById exception: stays requireAuth() per plan Section 9, so WAREHOUSE can still read
        it('getSalesOrderById uses plain requireAuth() — WAREHOUSE still passes (cross-portal exception)', async () => {
            // Arrange — simulate WAREHOUSE session passing requireAuth but SalesService returning an order
            vi.mocked(SalesService.getOrderById).mockResolvedValue({
                id: 'so-1',
                orderNumber: 'SO-1',
            } as never);

            // Act
            const res = await getSalesOrderById('so-1');

            // Assert
            expect(requireAuth).toHaveBeenCalled();
            expect(requireSalesAccess).not.toHaveBeenCalled();
            expect(res.success).toBe(true);
        });

        it('cancelSalesOrder uses requireSalesApprover() — WAREHOUSE/SALES would be blocked at guard level', async () => {
            // Arrange — approver passes in this happy path
            vi.mocked(SalesService.cancelOrder).mockResolvedValue(undefined as never);

            // Act
            await cancelSalesOrder('so-1');

            // Assert
            expect(requireSalesApprover).toHaveBeenCalled();
            expect(requireAuth).not.toHaveBeenCalled();
            expect(requireSalesAccess).not.toHaveBeenCalled();
        });

        it('deleteSalesOrder uses requireSalesApprover() — SALES is rejected', async () => {
            // Arrange — simulate SALES user rejected by approver guard
            vi.mocked(requireSalesApprover).mockRejectedValue(
                new BusinessRuleError(
                    'Unauthorized: Hanya admin yang dapat melakukan aksi ini (cancel order, force ops).',
                ),
            );

            // Act
            const res = await deleteSalesOrder('so-1');

            // Assert — guard failure surfaces as failed envelope (BusinessRuleError → safeAction)
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error).toMatch(/admin/i);
            }
        });

        it('getSalesOrders uses requireSalesAccess() — rejected SALES-access returns failed envelope', async () => {
            // Arrange
            const guardError = new BusinessRuleError(
                'Unauthorized: Akses sales hanya untuk admin atau sales.',
            );
            vi.mocked(requireSalesAccess).mockRejectedValue(guardError);

            // Act
            const res = await getSalesOrders();

            // Assert
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error).toMatch(/akses sales/i);
            }
        });

        it('quotation actions use requireSalesAccess() — allowed roles pass', async () => {
            // Arrange
            vi.mocked(sendQuotation).mockResolvedValue({ id: 'so-1' } as never);

            // Act
            const res = await sendQuotationOrder('so-1');

            // Assert
            expect(requireSalesAccess).toHaveBeenCalled();
            expect(res.success).toBe(true);
        });
    });
});
