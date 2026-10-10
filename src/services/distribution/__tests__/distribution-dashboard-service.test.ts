import {
    DeliveryStatus,
    InvoiceStatus,
    PurchaseInvoiceStatus,
    PurchaseOrderStatus,
    SalesOrderStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    inventory: vi.fn(),
}));

vi.mock('@/services/inventory/warehouse-dashboard-service', () => ({
    readWarehouseInventoryThresholdSnapshot: mocks.inventory,
}));

import {
    collectDistributionDashboard,
    createDistributionDashboardReader,
    readDistributionDashboard,
    type DistributionDashboardProjection,
    type DistributionDashboardReader,
} from '../distribution-dashboard-service';
import {
    buildSalesDashboardActiveOrderWhere,
    buildSalesDashboardReadyOrderWhere,
    buildSalesDashboardReadyWithoutOpenDeliveryWhere,
} from '@/services/sales/sales-dashboard-service';
import { buildPurchasingDashboardWaitingReceiptWhere } from '@/services/purchasing/purchasing-dashboard-query';

const snapshotAt = new Date('2026-10-09T03:00:00.000Z');
const paidAmountField = Symbol('paidAmount');
const db = {
    salesOrder: { count: vi.fn() },
    purchaseOrder: { count: vi.fn() },
    invoice: { count: vi.fn() },
    purchaseInvoice: {
        count: vi.fn(),
        fields: { paidAmount: paidAmountField },
    },
};

const allVisible: DistributionDashboardProjection = {
    salesOrders: '/sales/orders',
    readyWithoutDo: '/sales/deliveries',
    purchasingOrders: '/purchasing/orders',
    inventory: '/warehouse/inventory',
    accountsReceivable: '/sales/invoices',
    accountsPayable: '/purchasing/invoices',
};

function reader(
    overrides: Partial<DistributionDashboardReader> = {},
): DistributionDashboardReader {
    return {
        readSalesOrders: async () => ({ active: 0, readyToShip: 0 }),
        readReadyWithoutDo: async () => ({ count: 0 }),
        readPurchaseOrders: async () => ({
            waitingReceipt: 0,
            sent: 0,
            partialReceived: 0,
        }),
        readInventory: async () => ({ lowStock: 0, reorder: 0 }),
        readAccountsReceivable: async () => ({ overdue: 0 }),
        readAccountsPayable: async () => ({ overdue: 0 }),
        ...overrides,
    };
}

function matchesStatus(
    status: string,
    input: string | { in: readonly string[] },
): boolean {
    return typeof input === 'string'
        ? status === input
        : input.in.includes(status);
}

describe('Distribution dashboard service', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.salesOrder.count.mockResolvedValue(0);
        db.purchaseOrder.count.mockResolvedValue(0);
        db.invoice.count.mockResolvedValue(0);
        db.purchaseInvoice.count.mockResolvedValue(0);
        mocks.inventory.mockResolvedValue({
            lowStockCount: 0,
            reorderCount: 0,
            lowStockDrivers: [],
        });
    });

    it('exports Sales owner predicates that cover every lifecycle status and delivery branch exactly', () => {
        const activeWhere = buildSalesDashboardActiveOrderWhere();
        const readyWhere = buildSalesDashboardReadyOrderWhere();
        const readyWithoutDoWhere =
            buildSalesDashboardReadyWithoutOpenDeliveryWhere();
        const activeStatuses = (activeWhere.status as { in: string[] }).in;

        expect(activeStatuses).toEqual([
            SalesOrderStatus.CONFIRMED,
            SalesOrderStatus.IN_PRODUCTION,
            SalesOrderStatus.READY_TO_SHIP,
            SalesOrderStatus.SHIPPED,
        ]);
        for (const status of Object.values(SalesOrderStatus)) {
            expect((activeStatuses as string[]).includes(status)).toBe(
                (
                    [
                        SalesOrderStatus.CONFIRMED,
                        SalesOrderStatus.IN_PRODUCTION,
                        SalesOrderStatus.READY_TO_SHIP,
                        SalesOrderStatus.SHIPPED,
                    ] as string[]
                ).includes(status),
            );
        }
        expect(readyWhere).toEqual({ status: SalesOrderStatus.READY_TO_SHIP });
        expect(readyWithoutDoWhere).toEqual({
            status: SalesOrderStatus.READY_TO_SHIP,
            deliveryOrders: {
                none: {
                    status: {
                        in: [DeliveryStatus.PENDING, DeliveryStatus.LOADING],
                    },
                },
            },
        });

        const rows = [
            { status: DeliveryStatus.PENDING },
            { status: DeliveryStatus.LOADING },
            { status: DeliveryStatus.SHIPPED },
            { status: DeliveryStatus.DELIVERED },
        ];
        const open = (
            readyWithoutDoWhere.deliveryOrders as {
                none: { status: { in: string[] } };
            }
        ).none.status.in;
        expect(rows.map((row) => !open.includes(row.status))).toEqual([
            false,
            false,
            true,
            true,
        ]);
        expect([].some((row) => open.includes(row))).toBe(false);
        const readyRows = [
            {
                status: SalesOrderStatus.READY_TO_SHIP,
                deliveries: [DeliveryStatus.PENDING],
            },
            {
                status: SalesOrderStatus.READY_TO_SHIP,
                deliveries: [DeliveryStatus.LOADING],
            },
            {
                status: SalesOrderStatus.READY_TO_SHIP,
                deliveries: [DeliveryStatus.SHIPPED],
            },
            {
                status: SalesOrderStatus.READY_TO_SHIP,
                deliveries: [],
            },
            {
                status: SalesOrderStatus.CONFIRMED,
                deliveries: [],
            },
        ];
        expect(
            readyRows.filter(
                (row) =>
                    row.status === readyWithoutDoWhere.status &&
                    row.deliveries.every(
                        (delivery) => !open.includes(delivery),
                    ),
            ),
        ).toEqual([readyRows[2], readyRows[3]]);
    });

    it('exports the Purchasing owner predicate with SENT/PARTIAL and excludes every terminal or draft status', () => {
        const where = buildPurchasingDashboardWaitingReceiptWhere();
        const statuses = (where.status as { in: PurchaseOrderStatus[] }).in;

        expect(statuses).toEqual([
            PurchaseOrderStatus.SENT,
            PurchaseOrderStatus.PARTIAL_RECEIVED,
        ]);
        for (const status of Object.values(PurchaseOrderStatus)) {
            expect(matchesStatus(status, where.status as never)).toBe(
                (
                    [
                        PurchaseOrderStatus.SENT,
                        PurchaseOrderStatus.PARTIAL_RECEIVED,
                    ] as string[]
                ).includes(status),
            );
        }
        expect(buildPurchasingDashboardWaitingReceiptWhere('SENT')).toEqual({
            status: PurchaseOrderStatus.SENT,
        });
    });

    it('uses only owner builders, exact counts, one canonical inventory read, and the same server instant', async () => {
        db.salesOrder.count
            .mockResolvedValueOnce(8)
            .mockResolvedValueOnce(3)
            .mockResolvedValueOnce(2);
        db.purchaseOrder.count
            .mockResolvedValueOnce(5)
            .mockResolvedValueOnce(4)
            .mockResolvedValueOnce(1);
        db.invoice.count.mockResolvedValue(6);
        db.purchaseInvoice.count.mockResolvedValue(7);
        mocks.inventory.mockResolvedValue({
            lowStockCount: 9,
            reorderCount: 10,
            lowStockDrivers: [{ id: 'must-not-leak' }],
        });

        const result = await readDistributionDashboard(
            db as never,
            allVisible,
            { snapshotAt },
        );

        expect(result.generatedAt).toBe(snapshotAt.toISOString());
        expect(result.snapshotAt).toBe(snapshotAt.toISOString());
        expect(result.businessDate).toBe('2026-10-09');
        expect(result.health.salesOrders).toEqual({
            state: 'AVAILABLE',
            data: { active: 8, readyToShip: 3 },
            href: '/sales/orders',
        });
        expect(result.attention.readyWithoutDo).toEqual({
            state: 'AVAILABLE',
            data: { count: 2 },
            href: '/sales/deliveries',
        });
        expect(result.health.purchaseOrders).toEqual({
            state: 'AVAILABLE',
            data: { waitingReceipt: 5, sent: 4, partialReceived: 1 },
            href: '/purchasing/orders',
        });
        expect(result.health.inventory).toEqual({
            state: 'AVAILABLE',
            data: { lowStock: 9, reorder: 10 },
            href: '/warehouse/inventory',
        });
        expect(mocks.inventory).toHaveBeenCalledTimes(1);
        expect(db.salesOrder.count).toHaveBeenNthCalledWith(1, {
            where: buildSalesDashboardActiveOrderWhere(),
        });
        expect(db.salesOrder.count).toHaveBeenNthCalledWith(2, {
            where: buildSalesDashboardReadyOrderWhere(),
        });
        expect(db.salesOrder.count).toHaveBeenNthCalledWith(3, {
            where: buildSalesDashboardReadyWithoutOpenDeliveryWhere(),
        });
        expect(db.purchaseOrder.count).toHaveBeenNthCalledWith(1, {
            where: buildPurchasingDashboardWaitingReceiptWhere(),
        });
    });

    it('uses canonical positive AR statuses, operational exclusions, and the WIB day cutoff', async () => {
        await createDistributionDashboardReader(
            db as never,
        ).readAccountsReceivable(snapshotAt);

        expect(db.invoice.count).toHaveBeenCalledWith({
            where: {
                AND: [
                    {
                        status: {
                            in: [
                                InvoiceStatus.UNPAID,
                                InvoiceStatus.PARTIAL,
                                InvoiceStatus.OVERDUE,
                            ],
                        },
                        remainingAmount: { gt: 0 },
                    },
                ],
                dueDate: { lt: new Date('2026-10-08T17:00:00.000Z') },
                salesOrder: {
                    customerId: { not: null },
                    AND: expect.arrayContaining([
                            { NOT: { orderNumber: { startsWith: 'SO-OPEN-' } } },
                            { NOT: { orderNumber: { startsWith: 'OB-AR-' } } },
                            {
                                OR: expect.arrayContaining([
                                    { notes: null },
                                    {
                                        NOT: {
                                            notes: {
                                                startsWith: 'Opening Balance Entry',
                                            },
                                        },
                                    },
                                ]),
                            },
                            {
                                OR: expect.arrayContaining([
                                    { notes: null },
                                    {
                                        NOT: {
                                            notes: {
                                                startsWith: 'Sheet Penjualan Jun:',
                                            },
                                        },
                                    },
                                ]),
                            },
                        ]),
                },
            },
        });
    });

    it('uses the exact AP owner field-ref/status/cutoff predicate', async () => {
        await createDistributionDashboardReader(
            db as never,
        ).readAccountsPayable(snapshotAt);

        expect(db.purchaseInvoice.count).toHaveBeenCalledWith({
            where: {
                status: {
                    in: [
                        PurchaseInvoiceStatus.UNPAID,
                        PurchaseInvoiceStatus.PARTIAL,
                        PurchaseInvoiceStatus.OVERDUE,
                    ],
                },
                dueDate: { lt: new Date('2026-10-08T17:00:00.000Z') },
                totalAmount: { gt: paidAmountField },
            },
        });
    });

    it.each([
        'readSalesOrders',
        'readReadyWithoutDo',
        'readPurchaseOrders',
        'readInventory',
        'readAccountsReceivable',
        'readAccountsPayable',
    ] as const)(
        'settles %s independently while valid zero peers remain AVAILABLE',
        async (method) => {
            const result = await collectDistributionDashboard(
                reader({
                    [method]: async () => {
                        throw new Error('unavailable');
                    },
                }),
                allVisible,
                { snapshotAt },
            );
            const sections = [
                result.health.salesOrders,
                result.attention.readyWithoutDo,
                result.health.purchaseOrders,
                result.health.inventory,
                result.health.accountsReceivable,
                result.health.accountsPayable,
            ];
            expect(
                sections.filter((section) => section.state === 'UNAVAILABLE'),
            ).toHaveLength(1);
            expect(
                sections.filter((section) => section.state === 'AVAILABLE'),
            ).toHaveLength(5);
            expect(result.drivers.state).toBe('NOT_CONFIGURED');
        },
    );

    it('does not call denied readers and returns HIDDEN rather than zero', async () => {
        const hiddenReader = reader({
            readSalesOrders: vi.fn(),
            readReadyWithoutDo: vi.fn(),
            readPurchaseOrders: vi.fn(),
            readInventory: vi.fn(),
            readAccountsReceivable: vi.fn(),
            readAccountsPayable: vi.fn(),
        });
        const result = await collectDistributionDashboard(
            hiddenReader,
            {
                salesOrders: null,
                readyWithoutDo: null,
                purchasingOrders: null,
                inventory: null,
                accountsReceivable: null,
                accountsPayable: null,
            },
            { snapshotAt },
        );

        expect(result.health.salesOrders).toEqual({
            state: 'HIDDEN',
            data: null,
            href: null,
        });
        expect(result.attention.readyWithoutDo.state).toBe('HIDDEN');
        for (const read of Object.values(hiddenReader)) {
            expect(read).not.toHaveBeenCalled();
        }
    });

    it('returns only non-nominal aggregate DTO fields and bounded query shapes', async () => {
        const result = await readDistributionDashboard(
            db as never,
            allVisible,
            { snapshotAt },
        );
        const serialized = JSON.stringify(result).toLowerCase();
        const queryProjection = JSON.stringify([
            ...db.salesOrder.count.mock.calls,
            ...db.purchaseOrder.count.mock.calls,
            ...db.invoice.count.mock.calls,
            ...db.purchaseInvoice.count.mock.calls,
        ]).toLowerCase();

        for (const forbidden of [
            'customername',
            'suppliername',
            'ordernumber',
            'invoicenumber',
            'salesorderid',
            'purchaseorderid',
            'amount',
            'price',
            'cost',
            'spend',
            'revenue',
            'margin',
            'credit',
            'lowstockdrivers',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
        expect(queryProjection).not.toContain('findmany');
        expect(queryProjection).not.toContain('_sum');
    });
});
