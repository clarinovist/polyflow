import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    context: vi.fn(),
    transaction: vi.fn(),
    requestCount: vi.fn(),
    requestList: vi.fn(),
    requestDetail: vi.fn(),
    orderCount: vi.fn(),
    orderList: vi.fn(),
    orderDetail: vi.fn(),
    invoiceCount: vi.fn(),
    invoiceAggregate: vi.fn(),
    reorderList: vi.fn(),
}));

const db = {
    $transaction: m.transaction,
    purchaseRequest: {
        count: m.requestCount,
        findMany: m.requestList,
        findFirst: m.requestDetail,
    },
    purchaseOrder: {
        count: m.orderCount,
        findMany: m.orderList,
        findFirst: m.orderDetail,
    },
    purchaseInvoice: {
        count: m.invoiceCount,
        aggregate: m.invoiceAggregate,
        fields: { paidAmount: Symbol('paidAmount') },
    },
    productVariant: { findMany: m.reorderList },
};

vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: m.context }));

import {
    PURCHASING_MOBILE_SAMPLE_LIMIT,
    readPurchasingMobileDetail,
    readPurchasingMobileOverview,
} from '../mobile-purchasing-service';

const now = new Date('2026-10-07T03:00:00.000Z');
const d = (value: number) => new Prisma.Decimal(value);

beforeEach(() => {
    vi.resetAllMocks();
    m.context.mockReturnValue(db);
    m.transaction.mockImplementation(
        async (fn: (client: typeof db) => unknown) => fn(db),
    );
    m.requestCount.mockResolvedValue(1);
    m.orderCount.mockImplementation(async (args?: {
        where?: { status?: string | { in?: string[] }; expectedDate?: unknown };
    }) => {
        const status = args?.where?.status;
        if (status === 'DRAFT') return 1;
        if (args?.where?.expectedDate) return 1;
        if (typeof status === 'object' && status.in) return 2;
        return 0;
    });
    m.invoiceCount.mockResolvedValue(3);
    m.invoiceAggregate.mockResolvedValue({
        _sum: { totalAmount: d(1000), paidAmount: d(250) },
    });
    m.requestList.mockResolvedValue([
        {
            id: 'pr-1',
            requestNumber: 'PR-1',
            status: 'OPEN',
            priority: 'HIGH',
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
            createdBy: { name: 'Planner Synthetic' },
        },
    ]);
    m.orderList.mockImplementation(
        async (args?: { where?: { status?: string } }) => {
            if (args?.where?.status === 'DRAFT') {
                return [
                    {
                        id: 'po-draft',
                        orderNumber: 'PO-DRAFT',
                        status: 'DRAFT',
                        createdAt: new Date('2026-10-02T00:00:00.000Z'),
                        supplier: { name: 'Supplier A' },
                    },
                ];
            }
            if (args?.where?.status === 'SENT') {
                return [
                    {
                        id: 'po-late',
                        orderNumber: 'PO-LATE',
                        status: 'SENT',
                        expectedDate: new Date('2026-10-01T00:00:00.000Z'),
                        updatedAt: new Date('2026-10-03T00:00:00.000Z'),
                        supplier: { name: 'Supplier B' },
                    },
                ];
            }
            return [];
        },
    );
    m.reorderList.mockResolvedValue([
        {
            id: 'variant-1',
            name: 'Bahan A',
            skuCode: 'RM-A',
            primaryUnit: 'KG',
            reorderPoint: d(20),
            reorderQuantity: d(50),
            preferredSupplier: { name: 'Supplier C' },
            inventories: [
                {
                    quantity: d(5),
                    location: {
                        locationType: 'INTERNAL',
                        locationPurpose: 'RAW_MATERIAL',
                    },
                },
                {
                    quantity: d(100),
                    location: {
                        locationType: 'CUSTOMER_OWNED',
                        locationPurpose: 'RAW_MATERIAL',
                    },
                },
            ],
        },
    ]);
});

describe('Purchasing Mobile read service', () => {
    it('builds a deterministic exception queue with full totals', async () => {
        const result = await readPurchasingMobileOverview({
            filter: 'ALL',
            canViewAmounts: false,
            now,
        });

        expect(m.invoiceCount.mock.calls[0][0].where).toEqual({
            status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
            dueDate: { lt: new Date('2026-10-06T17:00:00.000Z') },
            totalAmount: { gt: db.purchaseInvoice.fields.paidAmount },
        });
        expect(result.highlights).toMatchObject({
            pendingRequestCount: 1,
            draftPoCount: 1,
            waitingReceiptCount: 2,
            etaExceptionCount: 1,
            suggestedReorderCount: 1,
            overdueApCount: 3,
        });
        expect(result.queue).toMatchObject({ total: 5, returned: 4 });
        expect(result.queue.items.map((item) => item.kind)).toEqual([
            'RECEIPT',
            'REQUEST',
            'REORDER',
            'DRAFT_PO',
        ]);
        expect(
            result.queue.items.filter((item) => item.id === 'po-late'),
        ).toHaveLength(1);
        expect(result.queue.items[0]).toMatchObject({
            status: 'ETA_TERLEWAT',
            href: '/purchasing/mobile/receipts/po-late',
        });
        expect(m.orderList).toHaveBeenCalledWith(
            expect.objectContaining({ where: { status: 'PARTIAL_RECEIVED' } }),
        );
        expect(m.orderList).toHaveBeenCalledWith(
            expect.objectContaining({ where: { status: 'SENT' } }),
        );
        expect(m.transaction).toHaveBeenCalledWith(expect.any(Function), {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        });
    });

    it('scopes PLANNING purchase requests to the actor on count, list, and detail', async () => {
        await readPurchasingMobileOverview({
            filter: 'REQUESTS',
            prOwnerId: 'planning-1',
            canViewAmounts: false,
            now,
        });
        expect(m.requestCount.mock.calls[0][0].where.createdById).toBe(
            'planning-1',
        );
        expect(m.requestList.mock.calls[0][0].where.createdById).toBe(
            'planning-1',
        );
        expect(m.reorderList).not.toHaveBeenCalled();

        m.requestDetail.mockResolvedValue({
            id: 'pr-1',
            requestNumber: 'PR-1',
            status: 'OPEN',
            priority: 'NORMAL',
            requestDate: now,
            createdById: 'planning-1',
            createdBy: { name: 'Planner' },
            reviewedBy: null,
            items: [],
        });
        await readPurchasingMobileDetail({
            kind: 'REQUEST',
            id: 'pr-1',
            prOwnerId: 'planning-1',
            canViewAmounts: false,
        });
        expect(m.requestDetail.mock.calls[0][0].where).toMatchObject({
            id: 'pr-1',
            createdById: 'planning-1',
        });
    });

    it('preserves domain urgency when sorting purchase requests', async () => {
        m.requestList.mockResolvedValue([
            {
                id: 'pr-normal',
                requestNumber: 'PR-NORMAL',
                status: 'OPEN',
                priority: 'NORMAL',
                createdAt: new Date('2026-10-01T00:00:00.000Z'),
                createdBy: { name: 'Planner' },
            },
            {
                id: 'pr-urgent',
                requestNumber: 'PR-URGENT',
                status: 'APPROVED',
                priority: 'URGENT',
                createdAt: new Date('2026-10-02T00:00:00.000Z'),
                createdBy: { name: 'Planner' },
            },
        ]);
        const result = await readPurchasingMobileOverview({
            filter: 'REQUESTS',
            canViewAmounts: false,
            now,
        });
        expect(result.queue.items.map((item) => item.title)).toEqual([
            'PR-URGENT',
            'PR-NORMAL',
        ]);
        expect(result.queue.items[0].priority).toBe('URGENT');
        expect(m.requestList.mock.calls[0][0].orderBy[0]).toEqual({
            priority: 'desc',
        });
    });

    it('uses WIB day start for ETA overdue classification', async () => {
        m.orderList.mockReset();
        m.orderList.mockResolvedValue([]);
        await readPurchasingMobileOverview({
            filter: 'ETA',
            canViewAmounts: false,
            now,
        });
        const etaWhere = m.orderCount.mock.calls.find(
            ([args]) => args.where.expectedDate,
        )?.[0].where.expectedDate;
        expect(etaWhere.lt.toISOString()).toBe('2026-10-06T17:00:00.000Z');
    });

    it('omits amount fields and amount-bearing queries without price permission', async () => {
        const result = await readPurchasingMobileOverview({
            filter: 'ALL',
            canViewAmounts: false,
            now,
        });
        expect('overdueApAmount' in result.highlights).toBe(false);
        expect(m.invoiceAggregate).not.toHaveBeenCalled();

        m.orderDetail.mockResolvedValue({
            id: 'po-draft',
            orderNumber: 'PO-DRAFT',
            status: 'DRAFT',
            orderDate: now,
            expectedDate: null,
            supplier: { name: 'Supplier A' },
            items: [],
            goodsReceipts: [],
            _count: { goodsReceipts: 0 },
        });
        const detail = await readPurchasingMobileDetail({
            kind: 'ORDER',
            id: 'po-draft',
            canViewAmounts: false,
        });
        expect('totalAmount' in detail).toBe(false);
        expect(m.orderDetail.mock.calls[0][0].select).not.toHaveProperty(
            'totalAmount',
        );
    });

    it('includes AP and PO amounts only with canonical price permission', async () => {
        const overview = await readPurchasingMobileOverview({
            filter: 'ALL',
            canViewAmounts: true,
            now,
        });
        expect(overview.highlights.overdueApAmount).toBe(750);
        expect(m.invoiceAggregate).toHaveBeenCalledOnce();

        m.orderDetail.mockResolvedValue({
            id: 'po-draft',
            orderNumber: 'PO-DRAFT',
            status: 'DRAFT',
            orderDate: now,
            expectedDate: null,
            totalAmount: d(500),
            supplier: { name: 'Supplier A' },
            items: [
                {
                    id: 'line-1',
                    quantity: d(2),
                    receivedQty: d(0),
                    unitPrice: d(250),
                    subtotal: d(500),
                    productVariant: {
                        name: 'Bahan',
                        skuCode: 'RM',
                        primaryUnit: 'KG',
                    },
                },
            ],
            goodsReceipts: [],
            _count: { goodsReceipts: 0 },
        });
        const detail = await readPurchasingMobileDetail({
            kind: 'ORDER',
            id: 'po-draft',
            canViewAmounts: true,
        });
        expect(detail).toMatchObject({
            kind: 'ORDER',
            totalAmount: 500,
            items: [{ unitPrice: 250, subtotal: 500 }],
        });
    });

    it('derives reorder only from eligible internal stock', async () => {
        const result = await readPurchasingMobileOverview({
            filter: 'REORDER',
            canViewAmounts: false,
            now,
        });
        expect(result.suggestedReorder.items[0]).toMatchObject({
            totalStock: 5,
            reorderPoint: 20,
            reorderQuantity: 50,
        });
        expect(result.queue.items[0].href).toBeNull();
    });

    it('caps returned tasks at ten while preserving the full filter total', async () => {
        m.requestCount.mockResolvedValue(20);
        m.requestList.mockResolvedValue(
            Array.from({ length: PURCHASING_MOBILE_SAMPLE_LIMIT }, (_, index) => ({
                id: `pr-${index}`,
                requestNumber: `PR-${index}`,
                status: 'OPEN',
                priority: 'NORMAL',
                createdAt: new Date(2026, 9, index + 1),
                createdBy: { name: 'Planner' },
            })),
        );
        const result = await readPurchasingMobileOverview({
            filter: 'REQUESTS',
            canViewAmounts: false,
            now,
        });
        expect(result.queue).toMatchObject({
            total: 20,
            returned: PURCHASING_MOBILE_SAMPLE_LIMIT,
        });
    });

    it('returns mobile-safe receipt progress and rejects the wrong detail status', async () => {
        m.orderDetail.mockResolvedValueOnce({
            id: 'po-1',
            orderNumber: 'PO-1',
            status: 'PARTIAL_RECEIVED',
            orderDate: now,
            expectedDate: new Date('2026-10-06T00:00:00.000Z'),
            supplier: { name: 'Supplier' },
            items: [{
                id: 'line-1', quantity: d(10), receivedQty: d(4),
                productVariant: { name: 'Bahan', skuCode: 'RM', primaryUnit: 'KG' },
            }],
            goodsReceipts: [{ receivedDate: now }],
            _count: { goodsReceipts: 1 },
        });
        await expect(readPurchasingMobileDetail({
            kind: 'RECEIPT', id: 'po-1', canViewAmounts: false,
        })).resolves.toMatchObject({
            kind: 'RECEIPT',
            receiptCount: 1,
            items: [{ orderedQuantity: 10, receivedQuantity: 4, remainingQuantity: 6 }],
        });
        expect(m.orderDetail.mock.calls[0][0].where.status).toEqual({
            in: ['SENT', 'PARTIAL_RECEIVED'],
        });

        m.orderDetail.mockResolvedValueOnce(null);
        await expect(readPurchasingMobileDetail({
            kind: 'ORDER', id: 'sent-po', canViewAmounts: false,
        })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(m.orderDetail.mock.calls[1][0].where.status).toBe('DRAFT');
    });

    it('treats unavailable and out-of-scope detail statuses as not found', async () => {
        m.requestDetail.mockResolvedValue(null);
        await expect(readPurchasingMobileDetail({
            kind: 'REQUEST', id: 'converted-pr', prOwnerId: 'planning-1',
            canViewAmounts: false,
        })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(m.requestDetail.mock.calls[0][0].where).toMatchObject({
            id: 'converted-pr',
            status: { in: ['OPEN', 'APPROVED'] },
            createdById: 'planning-1',
        });

        m.orderDetail.mockResolvedValue(null);
        await expect(readPurchasingMobileDetail({
            kind: 'RECEIPT', id: 'received-po', canViewAmounts: false,
        })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(m.orderDetail.mock.calls[0][0].where).toMatchObject({
            id: 'received-po',
            status: { in: ['SENT', 'PARTIAL_RECEIVED'] },
        });
    });

    it('fails closed before queries without tenant context', async () => {
        m.context.mockReturnValue(undefined);
        await expect(
            readPurchasingMobileOverview({
                filter: 'ALL',
                canViewAmounts: false,
                now,
            }),
        ).rejects.toThrow('Konteks tenant');
        expect(m.transaction).not.toHaveBeenCalled();

        await expect(readPurchasingMobileDetail({
            kind: 'ORDER', id: 'po-1', canViewAmounts: false,
        })).rejects.toThrow('Konteks tenant');
        expect(m.orderDetail).not.toHaveBeenCalled();
    });
});
