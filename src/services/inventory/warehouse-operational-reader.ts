import {
    DeliveryStatus,
    ProductionStatus,
    PurchaseOrderStatus,
    type PrismaClient,
} from '@prisma/client';

export type WarehouseOperationalReaderDb = Pick<
    PrismaClient,
    | 'deliveryOrder'
    | 'goodsReceipt'
    | 'productionOrder'
    | 'purchaseOrder'
    | 'stockMovement'
>;

export interface WarehouseOpenLoadCounts {
    openLoadOrders: number;
    loadingOrders: number;
    pendingOrders: number;
}

export interface WarehouseOperationalSnapshot extends WarehouseOpenLoadCounts {
    receivablePOs: number;
    materialQueue: number;
}

export interface WarehouseDesktopOperationalSnapshot {
    receivablePOs: number;
    openLoadOrders: number;
    materialQueue: number;
}

export interface WarehouseTodayActivity {
    goodsReceipts: number;
    deliveriesShipped: number;
    materialIssues: number;
}

export interface WarehouseDayBounds {
    startOfDay: Date;
    endOfDay: Date;
}

export interface WarehouseLoadingAttention {
    total: number;
    returned: number;
    items: Array<{
        id: string;
        number: string;
        customerName?: string;
        deliveryDate: string;
        href?: string;
    }>;
}

/** One statement owns the PENDING/LOADING split, so live transitions cannot make it incoherent. */
export async function readWarehouseOpenLoadCounts(
    db: WarehouseOperationalReaderDb,
): Promise<WarehouseOpenLoadCounts> {
    const groups = await db.deliveryOrder.groupBy({
        by: ['status'],
        where: {
            status: {
                in: [DeliveryStatus.PENDING, DeliveryStatus.LOADING],
            },
        },
        _count: { _all: true },
    });

    let pendingOrders = 0;
    let loadingOrders = 0;
    for (const group of groups) {
        if (group.status === DeliveryStatus.PENDING) {
            pendingOrders = group._count._all;
        }
        if (group.status === DeliveryStatus.LOADING) {
            loadingOrders = group._count._all;
        }
    }

    return {
        openLoadOrders: pendingOrders + loadingOrders,
        pendingOrders,
        loadingOrders,
    };
}

export async function readWarehouseReceivablePOs(
    db: WarehouseOperationalReaderDb,
): Promise<number> {
    return db.purchaseOrder.count({
        where: {
            status: {
                in: [
                    PurchaseOrderStatus.SENT,
                    PurchaseOrderStatus.PARTIAL_RECEIVED,
                ],
            },
        },
    });
}

export async function readWarehouseMaterialQueue(
    db: WarehouseOperationalReaderDb,
): Promise<number> {
    return db.productionOrder.count({
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
}

/** Canonical desktop R4E operational read. */
export async function readWarehouseDesktopOperational(
    db: WarehouseOperationalReaderDb,
): Promise<WarehouseDesktopOperationalSnapshot> {
    const [loads, receivablePOs, materialQueue] = await Promise.all([
        readWarehouseOpenLoadCounts(db),
        readWarehouseReceivablePOs(db),
        readWarehouseMaterialQueue(db),
    ]);

    return {
        receivablePOs,
        openLoadOrders: loads.openLoadOrders,
        materialQueue,
    };
}

/** Canonical operational queues with the mobile status split. */
export async function readWarehouseOperationalSnapshot(
    db: WarehouseOperationalReaderDb,
): Promise<WarehouseOperationalSnapshot> {
    const [loads, receivablePOs, materialQueue] = await Promise.all([
        readWarehouseOpenLoadCounts(db),
        readWarehouseReceivablePOs(db),
        readWarehouseMaterialQueue(db),
    ]);

    return { ...loads, receivablePOs, materialQueue };
}

export async function readWarehouseTodayShipped(
    db: Pick<WarehouseOperationalReaderDb, 'deliveryOrder'>,
    bounds: WarehouseDayBounds,
): Promise<number> {
    return db.deliveryOrder.count({
        where: {
            stockCommittedAt: {
                gte: bounds.startOfDay,
                lte: bounds.endOfDay,
            },
        },
    });
}

export async function readWarehouseTodayReceived(
    db: Pick<WarehouseOperationalReaderDb, 'goodsReceipt'>,
    bounds: WarehouseDayBounds,
): Promise<number> {
    return db.goodsReceipt.count({
        where: {
            isMaklon: false,
            receivedDate: {
                gte: bounds.startOfDay,
                lte: bounds.endOfDay,
            },
        },
    });
}

export async function readWarehouseTodayMaterialIssues(
    db: Pick<WarehouseOperationalReaderDb, 'stockMovement'>,
    bounds: WarehouseDayBounds,
): Promise<number> {
    return db.stockMovement.count({
        where: {
            type: 'OUT',
            productionOrderId: { not: null },
            createdAt: {
                gte: bounds.startOfDay,
                lte: bounds.endOfDay,
            },
        },
    });
}

/** Canonical received/shipped R4E facts for callers that do not need issues. */
export async function readWarehouseTodayKPIs(
    db: Pick<WarehouseOperationalReaderDb, 'deliveryOrder' | 'goodsReceipt'>,
    bounds: WarehouseDayBounds,
): Promise<Omit<WarehouseTodayActivity, 'materialIssues'>> {
    const [deliveriesShipped, goodsReceipts] = await Promise.all([
        readWarehouseTodayShipped(db, bounds),
        readWarehouseTodayReceived(db, bounds),
    ]);
    return { goodsReceipts, deliveriesShipped };
}

/** Canonical R4E today facts within caller-captured WIB day bounds. */
export async function readWarehouseTodayActivity(
    db: WarehouseOperationalReaderDb,
    bounds: WarehouseDayBounds,
): Promise<WarehouseTodayActivity> {
    const [todayKPIs, materialIssues] = await Promise.all([
        readWarehouseTodayKPIs(db, bounds),
        readWarehouseTodayMaterialIssues(db, bounds),
    ]);
    return { ...todayKPIs, materialIssues };
}

/** Canonical R4E loading-unverified total and deterministic bounded sample. */
export async function readWarehouseLoadingAttention(
    db: WarehouseOperationalReaderDb,
    sampleLimit: number,
    hrefForId?: (id: string) => string | null,
): Promise<WarehouseLoadingAttention> {
    const where = {
        status: DeliveryStatus.LOADING,
        loadVerifiedAt: null,
    };
    const [total, rows] = await Promise.all([
        db.deliveryOrder.count({ where }),
        db.deliveryOrder.findMany({
            where,
            select: {
                id: true,
                orderNumber: true,
                deliveryDate: true,
                salesOrder: {
                    select: { customer: { select: { name: true } } },
                },
            },
            orderBy: [{ deliveryDate: 'asc' }, { id: 'asc' }],
            take: sampleLimit,
        }),
    ]);

    const items = rows.map((delivery) => ({
        id: delivery.id,
        number: delivery.orderNumber,
        customerName: delivery.salesOrder?.customer?.name ?? undefined,
        deliveryDate: delivery.deliveryDate.toISOString(),
        ...(hrefForId ? { href: hrefForId(delivery.id) ?? undefined } : {}),
    }));

    return { total, returned: items.length, items };
}
