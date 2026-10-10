import type { PrismaClient } from '@prisma/client';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';
import { buildOverduePurchaseInvoiceWhere } from '@/services/finance/purchase-payable-query';
import { positiveSalesReceivableWhere } from '@/services/finance/sales-receivable-query';
import { readWarehouseInventoryThresholdSnapshot } from '@/services/inventory/warehouse-dashboard-service';
import { buildPurchasingDashboardWaitingReceiptWhere } from '@/services/purchasing/purchasing-dashboard-query';
import {
    buildSalesDashboardActiveOrderWhere,
    buildSalesDashboardReadyOrderWhere,
    buildSalesDashboardReadyWithoutOpenDeliveryWhere,
} from '@/services/sales/sales-dashboard-service';

export type DistributionDashboardState = 'AVAILABLE' | 'UNAVAILABLE' | 'HIDDEN';

export type DistributionDashboardSection<T> =
    | { state: 'AVAILABLE'; data: T; href: string | null }
    | { state: 'UNAVAILABLE'; data: null; href: string | null }
    | { state: 'HIDDEN'; data: null; href: null };

export type DistributionDashboardNotConfigured = {
    state: 'NOT_CONFIGURED';
    data: null;
};

export interface DistributionDashboardProjection {
    salesOrders: string | null;
    readyWithoutDo: string | null;
    purchasingOrders: string | null;
    inventory: string | null;
    accountsReceivable: string | null;
    accountsPayable: string | null;
}

export interface DistributionDashboardAggregate {
    generatedAt: string;
    snapshotAt: string;
    businessDate: string;
    health: {
        salesOrders: DistributionDashboardSection<{
            active: number;
            readyToShip: number;
        }>;
        purchaseOrders: DistributionDashboardSection<{
            waitingReceipt: number;
            sent: number;
            partialReceived: number;
        }>;
        inventory: DistributionDashboardSection<{
            lowStock: number;
            reorder: number;
        }>;
        accountsReceivable: DistributionDashboardSection<{
            overdue: number;
        }>;
        accountsPayable: DistributionDashboardSection<{
            overdue: number;
        }>;
    };
    attention: {
        readyWithoutDo: DistributionDashboardSection<{ count: number }>;
    };
    drivers: DistributionDashboardNotConfigured;
    withheld: {
        operations: DistributionDashboardNotConfigured;
        financials: DistributionDashboardNotConfigured;
    };
}

export interface DistributionDashboardReader {
    readSalesOrders(): Promise<{ active: number; readyToShip: number }>;
    readReadyWithoutDo(): Promise<{ count: number }>;
    readPurchaseOrders(): Promise<{
        waitingReceipt: number;
        sent: number;
        partialReceived: number;
    }>;
    readInventory(): Promise<{ lowStock: number; reorder: number }>;
    readAccountsReceivable(snapshotAt: Date): Promise<{ overdue: number }>;
    readAccountsPayable(snapshotAt: Date): Promise<{ overdue: number }>;
}

function available<T>(data: T, href: string): DistributionDashboardSection<T> {
    return { state: 'AVAILABLE', data, href };
}

function unavailable<T>(href: string): DistributionDashboardSection<T> {
    return { state: 'UNAVAILABLE', data: null, href };
}

function hidden<T>(): DistributionDashboardSection<T> {
    return { state: 'HIDDEN', data: null, href: null };
}

function notConfigured(): DistributionDashboardNotConfigured {
    return { state: 'NOT_CONFIGURED', data: null };
}

async function settleProjected<T>(
    href: string | null,
    read: () => Promise<T>,
): Promise<DistributionDashboardSection<T>> {
    if (!href) return hidden();
    try {
        return available(await read(), href);
    } catch {
        return unavailable(href);
    }
}

export function createDistributionDashboardReader(
    db: PrismaClient,
): DistributionDashboardReader {
    return {
        async readSalesOrders() {
            const [active, readyToShip] = await Promise.all([
                db.salesOrder.count({
                    where: buildSalesDashboardActiveOrderWhere(),
                }),
                db.salesOrder.count({
                    where: buildSalesDashboardReadyOrderWhere(),
                }),
            ]);
            return { active, readyToShip };
        },
        async readReadyWithoutDo() {
            return {
                count: await db.salesOrder.count({
                    where: buildSalesDashboardReadyWithoutOpenDeliveryWhere(),
                }),
            };
        },
        async readPurchaseOrders() {
            const [waitingReceipt, sent, partialReceived] = await Promise.all([
                db.purchaseOrder.count({
                    where: buildPurchasingDashboardWaitingReceiptWhere(),
                }),
                db.purchaseOrder.count({
                    where: buildPurchasingDashboardWaitingReceiptWhere('SENT'),
                }),
                db.purchaseOrder.count({
                    where: buildPurchasingDashboardWaitingReceiptWhere(
                        'PARTIAL_RECEIVED',
                    ),
                }),
            ]);
            return { waitingReceipt, sent, partialReceived };
        },
        async readInventory() {
            const snapshot = await readWarehouseInventoryThresholdSnapshot();
            return {
                lowStock: snapshot.lowStockCount,
                reorder: snapshot.reorderCount,
            };
        },
        async readAccountsReceivable(snapshotAt) {
            const cutoff = getWibDayBounds(
                toBusinessDateString(snapshotAt),
            ).startOfDay;
            return {
                overdue: await db.invoice.count({
                    where: {
                        AND: [positiveSalesReceivableWhere()],
                        dueDate: { lt: cutoff },
                        salesOrder: buildOperationalSalesReceivableOrderWhere(),
                    },
                }),
            };
        },
        async readAccountsPayable(snapshotAt) {
            return {
                overdue: await db.purchaseInvoice.count({
                    where: buildOverduePurchaseInvoiceWhere(db, snapshotAt),
                }),
            };
        },
    };
}

export async function collectDistributionDashboard(
    reader: DistributionDashboardReader,
    projection: DistributionDashboardProjection,
    options: { snapshotAt?: Date } = {},
): Promise<DistributionDashboardAggregate> {
    const snapshotAt = options.snapshotAt ?? new Date();
    const snapshotIso = snapshotAt.toISOString();
    const [
        salesOrders,
        readyWithoutDo,
        purchaseOrders,
        inventory,
        accountsReceivable,
        accountsPayable,
    ] = await Promise.all([
        settleProjected(projection.salesOrders, () => reader.readSalesOrders()),
        settleProjected(projection.readyWithoutDo, () =>
            reader.readReadyWithoutDo(),
        ),
        settleProjected(projection.purchasingOrders, () =>
            reader.readPurchaseOrders(),
        ),
        settleProjected(projection.inventory, () => reader.readInventory()),
        settleProjected(projection.accountsReceivable, () =>
            reader.readAccountsReceivable(snapshotAt),
        ),
        settleProjected(projection.accountsPayable, () =>
            reader.readAccountsPayable(snapshotAt),
        ),
    ]);

    return {
        generatedAt: snapshotIso,
        snapshotAt: snapshotIso,
        businessDate: toBusinessDateString(snapshotAt),
        health: {
            salesOrders,
            purchaseOrders,
            inventory,
            accountsReceivable,
            accountsPayable,
        },
        attention: { readyWithoutDo },
        drivers: notConfigured(),
        withheld: {
            operations: notConfigured(),
            financials: notConfigured(),
        },
    };
}

export async function readDistributionDashboard(
    db: PrismaClient,
    projection: DistributionDashboardProjection,
    options: { snapshotAt?: Date } = {},
): Promise<DistributionDashboardAggregate> {
    return collectDistributionDashboard(
        createDistributionDashboardReader(db),
        projection,
        options,
    );
}
