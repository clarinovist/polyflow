import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reverseDeliveryShipment } from '../delivery-reversal-service';
import { prisma } from '@/lib/core/prisma';
import { DeliveryStatus, SalesOrderStatus, MovementType, Prisma } from '@prisma/client';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { recordShipmentReversal } from '@/services/accounting/shipment-reversal-journal';
import { updateInvoiceStatus } from '@/services/finance/invoice-lifecycle-service';
import { requireOpenJournalPeriod } from '@/services/finance/sales-recognition-service';
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
        $queryRaw: vi.fn().mockResolvedValue([]),
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

vi.mock('@/services/accounting/shipment-reversal-journal', () => ({
    recordShipmentReversal: vi.fn(),
}));

vi.mock('@/services/finance/invoice-lifecycle-service', () => ({
    updateInvoiceStatus: vi.fn(),
}));

vi.mock('@/services/finance/sales-recognition-service', () => ({
    requireOpenJournalPeriod: vi.fn(),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

function makeDoRecord(overrides: Record<string, unknown> = {}) {
    return {
        id: 'do-1',
        orderNumber: 'DO-2026-0080',
        salesOrderId: 'so-1',
        sourceLocationId: 'loc-1',
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
        toLocationId: null,
        salesOrderId: 'so-1',
        quantity: 142,
        cost: 5000,
        reference: 'Shipment for SO-2026-0132 via DO-2026-0080',
        ...overrides,
    };
}

describe('reverseDeliveryShipment', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireOpenJournalPeriod).mockResolvedValue(undefined);
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
        expect(recordShipmentReversal).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'mov-1' }),
            expect.objectContaining({ id: 'rev-1' }),
            'user-1', prisma, { offBalanceSheet: false },
        );
        expect(prisma.salesOrderItem.update).toHaveBeenCalledWith({
            where: { id: 'soi-1' },
            data: { deliveredQty: new Prisma.Decimal(0) },
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

    it('never values a shipment reversal through the generic production-IN path', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord() as never);
        vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([makeMovement({ cost: null })] as never);

        await reverseDeliveryShipment('do-1', 'user-1', 'Historical shipment reversal');

        expect(AccountingService.recordInventoryMovement).not.toHaveBeenCalled();
    });

    it('locks the delivery before checking its status to serialize reversal requests', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord() as never);

        await reverseDeliveryShipment('do-1', 'user-1', 'Serialize cancellation');

        expect(prisma.$queryRaw).toHaveBeenCalled();
        expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(prisma.deliveryOrder.findUnique).mock.invocationCallOrder[0],
        );
    });

    it('refuses to cancel a committed delivery when source movements are absent', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord() as never);
        vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([]);

        await expect(reverseDeliveryShipment('do-1', 'user-1', 'Missing source movement'))
            .rejects.toThrow(/mutasi.*pengiriman|shipment.*movement/i);
        expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
    });

    it('rejects a partial movement set before any mutation', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord({
            items: [
                { productVariantId: 'pv-1', quantity: 142 },
                { productVariantId: 'pv-2', quantity: 20 },
            ],
        }) as never);

        await expect(reverseDeliveryShipment('do-1', 'user-1', 'Partial source'))
            .rejects.toThrow(/mutasi.*pengiriman/i);
        expect(InventoryCoreService.incrementStock).not.toHaveBeenCalled();
        expect(prisma.stockMovement.create).not.toHaveBeenCalled();
        expect(recordShipmentReversal).not.toHaveBeenCalled();
        expect(prisma.salesOrderItem.update).not.toHaveBeenCalled();
        expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
        expect(updateInvoiceStatus).not.toHaveBeenCalled();
        expect(prisma.salesOrder.update).not.toHaveBeenCalled();
        expect(prisma.stockReservation.updateMany).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
    });

    it.each([
        ['wrong quantity', { quantity: '141.9999' }],
        ['missing/extra variant', { productVariantId: 'pv-other' }],
        ['wrong location', { fromLocationId: 'other-warehouse' }],
        ['missing location', { fromLocationId: null }],
        ['wrong direction', { type: MovementType.IN }],
        ['unexpected destination', { toLocationId: 'loc-2' }],
        ['zero quantity', { quantity: 0 }],
        ['negative quantity', { quantity: -142 }],
        ['nonfinite quantity', { quantity: 'Infinity' }],
        ['NaN quantity', { quantity: 'NaN' }],
        ['receipt-linked movement', { goodsReceiptId: 'receipt' }],
        ['production-linked movement', { productionOrderId: 'production' }],
    ])('rejects %s in the source set before stock changes', async (_label, change) => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord() as never);
        vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([makeMovement(change)] as never);
        await expect(reverseDeliveryShipment('do-1', 'user-1', 'Invalid source'))
            .rejects.toThrow(/mutasi.*pengiriman/i);
        expect(InventoryCoreService.incrementStock).not.toHaveBeenCalled();
        expect(prisma.stockMovement.create).not.toHaveBeenCalled();
        expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
    });

    it('rejects an extra variant even when every expected variant is present', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord() as never);
        vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
            makeMovement(), makeMovement({ id: 'mov-extra', productVariantId: 'pv-extra', quantity: 1 }),
        ] as never);
        await expect(reverseDeliveryShipment('do-1', 'user-1', 'Extra source'))
            .rejects.toThrow(/mutasi.*pengiriman/i);
        expect(InventoryCoreService.incrementStock).not.toHaveBeenCalled();
    });

    it('aggregates repeated DO and movement rows exactly and decrements the SO line once', async () => {
        const original = makeDoRecord();
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord({
            items: [{ productVariantId: 'pv-1', quantity: '0.1' }, { productVariantId: 'pv-1', quantity: '0.2' }],
            salesOrder: { ...original.salesOrder, items: [{ id: 'soi-1', productVariantId: 'pv-1', deliveredQty: '0.3' }] },
        }) as never);
        vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
            makeMovement({ quantity: '0.15' }), makeMovement({ id: 'mov-2', quantity: '0.15' }),
        ] as never);
        expect(await reverseDeliveryShipment('do-1', 'user-1', 'Repeated SKU'))
            .toEqual({ success: true, reversedLines: 2 });
        expect(prisma.salesOrderItem.update).toHaveBeenCalledTimes(1);
        const update = vi.mocked(prisma.salesOrderItem.update).mock.calls[0][0];
        expect(String(update.data.deliveredQty)).toBe('0');
    });

    it('refuses ambiguous repeated SO lines rather than guessing attribution', async () => {
        const original = makeDoRecord();
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord({
            salesOrder: { ...original.salesOrder, items: [
                ...original.salesOrder.items,
                { id: 'soi-2', productVariantId: 'pv-1', deliveredQty: 0 },
            ] },
        }) as never);
        await expect(reverseDeliveryShipment('do-1', 'user-1', 'Ambiguous SO attribution'))
            .rejects.toThrow(/atribusi|ambigu/i);
        expect(InventoryCoreService.incrementStock).not.toHaveBeenCalled();
    });

    it.each(['-1', 'NaN'])('rejects invalid DO quantity %s before mutation', async quantity => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord({
            items: [{ productVariantId: 'pv-1', quantity }],
        }) as never);
        await expect(reverseDeliveryShipment('do-1', 'user-1', 'Invalid DO quantity'))
            .rejects.toThrow(/mutasi.*pengiriman/i);
        expect(InventoryCoreService.incrementStock).not.toHaveBeenCalled();
    });

    it('ignores a DO row corrected to zero as the shipment producer does', async () => {
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord({
            items: [
                { productVariantId: 'pv-1', quantity: 142 },
                { productVariantId: 'pv-2', quantity: 0 },
            ],
        }) as never);
        expect(await reverseDeliveryShipment('do-1', 'user-1', 'Zero corrected row'))
            .toEqual({ success: true, reversedLines: 1 });
        expect(prisma.salesOrderItem.update).toHaveBeenCalledTimes(1);
    });

    it('rejects an absent SO item before returning stock', async () => {
        const original = makeDoRecord();
        vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(makeDoRecord({
            salesOrder: { ...original.salesOrder, items: [] },
        }) as never);
        await expect(reverseDeliveryShipment('do-1', 'user-1', 'Missing SO row'))
            .rejects.toThrow(/atribusi/i);
        expect(InventoryCoreService.incrementStock).not.toHaveBeenCalled();
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
        vi.mocked(requireOpenJournalPeriod).mockRejectedValue(new Error('Periode CLOSED'));

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
            data: { deliveredQty: new Prisma.Decimal(115) },
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
