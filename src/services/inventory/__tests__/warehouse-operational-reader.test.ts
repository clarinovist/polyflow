import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DeliveryStatus,
    ProductionStatus,
    PurchaseOrderStatus,
} from '@prisma/client';
import {
    readWarehouseDesktopOperational,
    readWarehouseLoadingAttention,
    readWarehouseOperationalSnapshot,
    readWarehouseTodayActivity,
    readWarehouseTodayKPIs,
} from '../warehouse-operational-reader';

const db = {
    purchaseOrder: { count: vi.fn() },
    deliveryOrder: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    productionOrder: { count: vi.fn() },
    goodsReceipt: { count: vi.fn() },
    stockMovement: { count: vi.fn() },
};

describe('canonical Warehouse operational readers', () => {
    beforeEach(() => vi.resetAllMocks());

    it('uses the exact R4E operational predicates and derives the mobile pending split', async () => {
        db.purchaseOrder.count.mockResolvedValue(7);
        db.deliveryOrder.groupBy.mockResolvedValue([
            { status: DeliveryStatus.PENDING, _count: { _all: 7 } },
            { status: DeliveryStatus.LOADING, _count: { _all: 4 } },
        ]);
        db.productionOrder.count.mockResolvedValue(3);

        const result = await readWarehouseOperationalSnapshot(db as never);

        expect(result).toEqual({
            receivablePOs: 7,
            openLoadOrders: 11,
            loadingOrders: 4,
            pendingOrders: 7,
            materialQueue: 3,
        });
        expect(db.purchaseOrder.count).toHaveBeenCalledWith({
            where: {
                status: {
                    in: [
                        PurchaseOrderStatus.SENT,
                        PurchaseOrderStatus.PARTIAL_RECEIVED,
                    ],
                },
            },
        });
        expect(db.deliveryOrder.groupBy).toHaveBeenCalledWith({
            by: ['status'],
            where: {
                status: {
                    in: [DeliveryStatus.PENDING, DeliveryStatus.LOADING],
                },
            },
            _count: { _all: true },
        });
        expect(db.productionOrder.count).toHaveBeenCalledWith({
            where: {
                status: {
                    in: [
                        ProductionStatus.RELEASED,
                        ProductionStatus.IN_PROGRESS,
                        ProductionStatus.WAITING_MATERIAL,
                    ],
                },
            },
        });
    });

    it('preserves the R4E desktop query count while sharing the same predicate owner', async () => {
        db.purchaseOrder.count.mockResolvedValue(7);
        db.deliveryOrder.groupBy.mockResolvedValue([
            { status: DeliveryStatus.PENDING, _count: { _all: 7 } },
            { status: DeliveryStatus.LOADING, _count: { _all: 4 } },
        ]);
        db.productionOrder.count.mockResolvedValue(3);

        await expect(
            readWarehouseDesktopOperational(db as never),
        ).resolves.toEqual({
            receivablePOs: 7,
            openLoadOrders: 11,
            materialQueue: 3,
        });
        expect(db.deliveryOrder.groupBy).toHaveBeenCalledTimes(1);
    });

    it('never derives an impossible negative split from grouped status counts', async () => {
        db.purchaseOrder.count.mockResolvedValue(0);
        db.productionOrder.count.mockResolvedValue(0);
        db.deliveryOrder.groupBy.mockResolvedValue([
            { status: DeliveryStatus.LOADING, _count: { _all: 3 } },
        ]);

        await expect(
            readWarehouseOperationalSnapshot(db as never),
        ).resolves.toMatchObject({
            openLoadOrders: 3,
            loadingOrders: 3,
            pendingOrders: 0,
        });
    });

    it('keeps the safe received/shipped adapter on the same canonical source', async () => {
        const startOfDay = new Date('2026-10-09T17:00:00.000Z');
        const endOfDay = new Date('2026-10-10T16:59:59.999Z');
        db.deliveryOrder.count.mockResolvedValue(2);
        db.goodsReceipt.count.mockResolvedValue(3);

        await expect(
            readWarehouseTodayKPIs(db as never, { startOfDay, endOfDay }),
        ).resolves.toEqual({ deliveriesShipped: 2, goodsReceipts: 3 });
        expect(db.stockMovement.count).not.toHaveBeenCalled();
    });

    it('uses caller-captured WIB bounds for every canonical today fact', async () => {
        const startOfDay = new Date('2026-10-09T17:00:00.000Z');
        const endOfDay = new Date('2026-10-10T16:59:59.999Z');
        db.deliveryOrder.count.mockResolvedValue(2);
        db.goodsReceipt.count.mockResolvedValue(3);
        db.stockMovement.count.mockResolvedValue(4);

        await expect(
            readWarehouseTodayActivity(db as never, {
                startOfDay,
                endOfDay,
            }),
        ).resolves.toEqual({
            deliveriesShipped: 2,
            goodsReceipts: 3,
            materialIssues: 4,
        });
        expect(db.deliveryOrder.count).toHaveBeenCalledWith({
            where: { stockCommittedAt: { gte: startOfDay, lte: endOfDay } },
        });
        expect(db.goodsReceipt.count).toHaveBeenCalledWith({
            where: {
                isMaklon: false,
                receivedDate: { gte: startOfDay, lte: endOfDay },
            },
        });
        expect(db.stockMovement.count).toHaveBeenCalledWith({
            where: {
                type: 'OUT',
                productionOrderId: { not: null },
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
        });
    });

    it('counts the full eligible loading population before taking the stable oldest sample', async () => {
        db.deliveryOrder.count.mockResolvedValue(9);
        db.deliveryOrder.findMany.mockResolvedValue([
            {
                id: 'do-a',
                orderNumber: 'DO-001',
                deliveryDate: new Date('2026-10-09T01:00:00.000Z'),
                salesOrder: { customer: { name: 'Customer A' } },
            },
            {
                id: 'do-b',
                orderNumber: 'DO-002',
                deliveryDate: new Date('2026-10-09T02:00:00.000Z'),
                salesOrder: null,
            },
        ]);

        const result = await readWarehouseLoadingAttention(db as never, 3);

        expect(result).toEqual({
            total: 9,
            returned: 2,
            items: [
                {
                    id: 'do-a',
                    number: 'DO-001',
                    customerName: 'Customer A',
                    deliveryDate: '2026-10-09T01:00:00.000Z',
                },
                {
                    id: 'do-b',
                    number: 'DO-002',
                    customerName: undefined,
                    deliveryDate: '2026-10-09T02:00:00.000Z',
                },
            ],
        });
        const expectedWhere = {
            status: DeliveryStatus.LOADING,
            loadVerifiedAt: null,
        };
        expect(db.deliveryOrder.count).toHaveBeenCalledWith({
            where: expectedWhere,
        });
        expect(db.deliveryOrder.findMany).toHaveBeenCalledWith({
            where: expectedWhere,
            select: {
                id: true,
                orderNumber: true,
                deliveryDate: true,
                salesOrder: {
                    select: { customer: { select: { name: true } } },
                },
            },
            orderBy: [{ deliveryDate: 'asc' }, { id: 'asc' }],
            take: 3,
        });
    });
});
