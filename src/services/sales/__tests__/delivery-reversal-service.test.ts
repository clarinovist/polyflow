import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reverseDeliveryShipment } from '../delivery-reversal-service';
import { prisma } from '@/lib/core/prisma';
import { DeliveryStatus, SalesOrderStatus, MovementType } from '@prisma/client';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { updateInvoiceStatus } from '@/services/finance/invoice-lifecycle-service';
import { isPeriodOpen } from '@/services/accounting/periods-service';
import { logActivity } from '@/lib/tools/audit';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        deliveryOrder: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        salesOrderItem: {
            update: vi.fn(),
            findMany: vi.fn(),
        },
        salesOrder: {
            update: vi.fn(),
        },
        stockMovement: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
        },
        stockReservation: {
            updateMany: vi.fn(),
        },
        deliveryScheduleOrder: {
            updateMany: vi.fn(),
        },
        salesRemittanceItem: {
            findFirst: vi.fn(),
        },
        $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
            callback(prisma),
        ),
    },
}));

vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: {
        incrementStock: vi.fn(),
    },
}));

vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: {
        recordInventoryMovement: vi.fn(),
    },
}));

vi.mock('@/services/finance/invoice-lifecycle-service', () => ({
    updateInvoiceStatus: vi.fn(),
}));

vi.mock('@/services/accounting/periods-service', () => ({
    isPeriodOpen: vi.fn(),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

function makeDoRecord(overrides: Record<string, unknown> = {}) {
    return {
        id: 'do-1',
        orderNumber: 'DO-2026-0080',
        salesOrderId: 'so-1',
        status: DeliveryStatus.SHIPPED,
        stockCommittedAt: new Date('2026-08-18T06:49:00.000Z'),
        proofOfDeliveryAt: null,
        notes: null,
        items: [{ productVariantId: 'pv-1', quantity: 142 }],
        salesOrder: {
            orderNumber: 'SO-2026-0132',
            items: [{ id: 'soi-1', productVariantId: 'pv-1', deliveredQty: 142 }],
            invoices: [
                { id: 'inv-1', invoiceNumber: '46/INV/VIII/2026', status: 'DRAFT' },
            ],
        },
        ...overrides,
    };
}

function makeMovement(overrides: Record<string, unknown> = {}) {
    return {
        id: 'mov-1',
        type: MovementType.OUT,
        productVariantId: 'pv-1',
        fromLocationId: 'loc-1',
        quantity: 142,
        cost: 5000,
        reference: 'Shipment for SO-2026-0132 via DO-2026-0080',
        ...overrides,
    };
}

describe('reverseDeliveryShipment', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(isPeriodOpen).mockResolvedValue(true);
        vi.mocked(prisma.stockMovement.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.salesRemittanceItem.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
            makeMovement(),
        ] as never);
        vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
            { deliveredQty: 0 },
        ] as never);
        vi.mocked(prisma.stockMovement.create).mockResolvedValue({
            id: 'rev-1',
        } as never);
    });

    it('happy path: reverses stock, decrements deliveredQty, cancels DO, voids invoice, reopens SO', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord() as never,
        );

        const result = await reverseDeliveryShipment(
            'do-1',
            'user-1',
            'Revisi order sebelum kirim ulang',
        );

        expect(result).toEqual({ success: true, reversedLines: 1 });
        expect(InventoryCoreService.incrementStock).toHaveBeenCalledWith(
            prisma,
            'loc-1',
            'pv-1',
            142,
        );
        expect(AccountingService.recordInventoryMovement).toHaveBeenCalled();
        expect(prisma.salesOrderItem.update).toHaveBeenCalledWith({
            where: { id: 'soi-1' },
            data: { deliveredQty: 0 },
        });
        expect(prisma.deliveryOrder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'do-1' },
                data: expect.objectContaining({
                    status: DeliveryStatus.CANCELLED,
                }),
            }),
        );
        expect(prisma.salesOrder.update).toHaveBeenCalledWith({
            where: { id: 'so-1' },
            data: { status: SalesOrderStatus.READY_TO_SHIP },
        });
        expect(updateInvoiceStatus).toHaveBeenCalledWith(
            { id: 'inv-1', status: 'CANCELLED' },
            'user-1',
            prisma,
        );
    });

    it('rejects when DO is not SHIPPED', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord({ status: DeliveryStatus.PENDING }) as never,
        );

        await expect(
            reverseDeliveryShipment('do-1', 'user-1', 'alasan cukup panjang'),
        ).rejects.toThrow(/SHIPPED/);
    });

    it('rejects when already reversed (idempotent via source marker)', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord() as never,
        );
        vi.mocked(prisma.stockMovement.findFirst).mockResolvedValue({
            id: 'existing-reversal',
        } as never);

        await expect(
            reverseDeliveryShipment('do-1', 'user-1', 'alasan cukup panjang'),
        ).rejects.toThrow(/sudah pernah direverse/);
    });

    it('rejects when an invoice is already PAID/PARTIAL', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord({
                salesOrder: {
                    orderNumber: 'SO-2026-0132',
                    items: [
                        { id: 'soi-1', productVariantId: 'pv-1', deliveredQty: 142 },
                    ],
                    invoices: [
                        { id: 'inv-1', invoiceNumber: '46/INV', status: 'PAID' },
                    ],
                },
            }) as never,
        );

        await expect(
            reverseDeliveryShipment('do-1', 'user-1', 'alasan cukup panjang'),
        ).rejects.toThrow(/PAID/);
    });

    it('rejects when the fiscal period is CLOSED', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord() as never,
        );
        vi.mocked(isPeriodOpen).mockResolvedValue(false);

        await expect(
            reverseDeliveryShipment('do-1', 'user-1', 'alasan cukup panjang'),
        ).rejects.toThrow(/CLOSED/);
    });

    it('rejects when proof of delivery already recorded', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord({ proofOfDeliveryAt: new Date() }) as never,
        );

        await expect(
            reverseDeliveryShipment('do-1', 'user-1', 'alasan cukup panjang'),
        ).rejects.toThrow(/[Bb]ukti terima/);
    });

    it('rejects when the invoice is already inside a non-rejected remittance', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord() as never,
        );
        vi.mocked(prisma.salesRemittanceItem.findFirst).mockResolvedValue({
            remittanceId: 'rem-1',
            remittance: { status: 'PENDING', remittanceNumber: 'RMT-001' },
        } as never);

        await expect(
            reverseDeliveryShipment('do-1', 'user-1', 'alasan cukup panjang'),
        ).rejects.toThrow(/setoran/);
    });

    it('partial delivery: decrements deliveredQty and reopens SO to IN_PRODUCTION, not READY_TO_SHIP', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord({
                items: [{ productVariantId: 'pv-1', quantity: 27 }],
                salesOrder: {
                    orderNumber: 'SO-2026-0132',
                    items: [
                        { id: 'soi-1', productVariantId: 'pv-1', deliveredQty: 142 },
                    ],
                    invoices: [
                        { id: 'inv-1', invoiceNumber: '46/INV', status: 'DRAFT' },
                    ],
                },
            }) as never,
        );
        vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
            makeMovement({ quantity: 27 }),
        ] as never);
        vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
            { deliveredQty: 115 },
        ] as never);

        await reverseDeliveryShipment('do-1', 'user-1', 'alasan cukup panjang');

        expect(prisma.salesOrderItem.update).toHaveBeenCalledWith({
            where: { id: 'soi-1' },
            data: { deliveredQty: 115 },
        });
        expect(prisma.salesOrder.update).toHaveBeenCalledWith({
            where: { id: 'so-1' },
            data: { status: SalesOrderStatus.IN_PRODUCTION },
        });
    });

    it('restores FULFILLED reservations back to ACTIVE with a new reservedUntil', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord() as never,
        );

        await reverseDeliveryShipment('do-1', 'user-1', 'alasan cukup panjang');

        expect(prisma.stockReservation.updateMany).toHaveBeenCalledWith({
            where: {
                referenceId: 'so-1',
                reservedFor: 'SALES_ORDER',
                status: 'FULFILLED',
            },
            data: expect.objectContaining({
                status: 'ACTIVE',
                reservedUntil: expect.any(Date),
            }),
        });
    });

    it('logs the audit trail inside the transaction (passes tx)', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord() as never,
        );

        await reverseDeliveryShipment('do-1', 'user-1', 'alasan cukup panjang');

        expect(logActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'REVERSE_DELIVERY_SHIPMENT',
                tx: prisma,
            }),
        );
    });

    it('cascades the linked delivery-schedule stop to CANCELLED, not PLANNED', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
            makeDoRecord() as never,
        );

        await reverseDeliveryShipment('do-1', 'user-1', 'alasan cukup panjang');

        expect(prisma.deliveryScheduleOrder.updateMany).toHaveBeenCalledWith({
            where: { deliveryOrderId: 'do-1', status: { not: 'CANCELLED' } },
            data: { status: 'CANCELLED' },
        });
    });
});
