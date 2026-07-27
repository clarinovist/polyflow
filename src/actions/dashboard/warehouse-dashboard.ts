'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import {
    ProductionStatus,
    PurchaseOrderStatus,
    DeliveryStatus,
} from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';
import { getWarehouseTodayKPIs } from '@/actions/dashboard/warehouse-kpi';
import {
    getWibDayBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';

export interface WarehouseShiftBoard {
    counts: {
        receivablePOs: number;
        openLoadOrders: number;
        materialQueue: number;
        lowStock: number;
        suggestedReorder: number;
    };
    today: {
        goodsReceipts: number;
        deliveriesShipped: number;
        materialIssues: number;
    };
    attention: {
        loadingUnverified: Array<{
            id: string;
            number: string;
            customerName?: string;
        }>;
        partialPOs: Array<{
            id: string;
            orderNumber: string;
            supplierName: string;
        }>;
        waitingMaterial: Array<{ id: string; orderNumber: string }>;
    };
}

export const getWarehouseShiftBoard = withTenant(
    async function getWarehouseShiftBoard() {
        return safeAction(async () => {
            await requireAuth();

            // Canonical today KPIs (WIB business day, event timestamps)
            const todayKPIs = await getWarehouseTodayKPIs();

            const [
                receivablePOs,
                openLoadOrders,
                materialQueue,
                lowStockCount,
                suggestedReorderCount,
                todayMaterialIssues,
                loadingUnverified,
                partialPOs,
                waitingMaterial,
            ] = await Promise.all([
                // Receivable POs: SENT | PARTIAL_RECEIVED
                prisma.purchaseOrder.count({
                    where: {
                        status: {
                            in: [
                                PurchaseOrderStatus.SENT,
                                PurchaseOrderStatus.PARTIAL_RECEIVED,
                            ],
                        },
                    },
                }),

                // Open load orders: DO PENDING | LOADING
                prisma.deliveryOrder.count({
                    where: {
                        status: {
                            in: [
                                DeliveryStatus.PENDING,
                                DeliveryStatus.LOADING,
                            ],
                        },
                    },
                }),

                // Material queue: production RELEASED | IN_PROGRESS | WAITING_MATERIAL
                prisma.productionOrder.count({
                    where: {
                        status: {
                            in: [
                                ProductionStatus.RELEASED,
                                ProductionStatus.IN_PROGRESS,
                                ProductionStatus.WAITING_MATERIAL,
                            ],
                        },
                    },
                }),

                // Low stock count
                computeLowStockCount(),

                // Suggested reorder count
                computeSuggestedReorderCount(),

                // Today material issues (best-effort: movements with productionOrderId OUT type)
                (async () => {
                    const { startOfDay, endOfDay } = getWibDayBounds(
                        toBusinessDateString(new Date()),
                    );
                    return prisma.stockMovement.count({
                        where: {
                            type: 'OUT',
                            productionOrderId: { not: null },
                            createdAt: { gte: startOfDay, lte: endOfDay },
                        },
                    });
                })(),

                // Attention: LOADING but not verified
                prisma.deliveryOrder.findMany({
                    where: {
                        status: DeliveryStatus.LOADING,
                        loadVerifiedAt: null,
                    },
                    select: {
                        id: true,
                        orderNumber: true,
                        salesOrder: {
                            select: { customer: { select: { name: true } } },
                        },
                    },
                    take: 5,
                    orderBy: { deliveryDate: 'asc' },
                }),

                // Attention: Partial POs awaiting remaining
                prisma.purchaseOrder.findMany({
                    where: { status: PurchaseOrderStatus.PARTIAL_RECEIVED },
                    select: {
                        id: true,
                        orderNumber: true,
                        supplier: { select: { name: true } },
                    },
                    take: 5,
                    orderBy: { expectedDate: 'asc' },
                }),

                // Attention: SPK waiting material
                prisma.productionOrder.findMany({
                    where: { status: ProductionStatus.WAITING_MATERIAL },
                    select: {
                        id: true,
                        orderNumber: true,
                    },
                    take: 5,
                    orderBy: { createdAt: 'asc' },
                }),
            ]);

            return {
                counts: {
                    receivablePOs,
                    openLoadOrders,
                    materialQueue,
                    lowStock: lowStockCount,
                    suggestedReorder: suggestedReorderCount,
                },
                today: {
                    goodsReceipts: todayKPIs.receivedToday,
                    deliveriesShipped: todayKPIs.shippedToday,
                    materialIssues: todayMaterialIssues,
                },
                attention: {
                    loadingUnverified: loadingUnverified.map((d) => ({
                        id: d.id,
                        number: d.orderNumber,
                        customerName: d.salesOrder?.customer?.name ?? undefined,
                    })),
                    partialPOs: partialPOs.map((p) => ({
                        id: p.id,
                        orderNumber: p.orderNumber,
                        supplierName: p.supplier.name,
                    })),
                    waitingMaterial: waitingMaterial.map((p) => ({
                        id: p.id,
                        orderNumber: p.orderNumber,
                    })),
                },
            };
        });
    },
);

async function computeLowStockCount(): Promise<number> {
    const lowStockVariants = await prisma.productVariant.findMany({
        where: { minStockAlert: { not: null } },
        select: {
            id: true,
            minStockAlert: true,
            inventories: {
                select: {
                    quantity: true,
                    location: {
                        select: {
                            locationPurpose: true,
                            locationType: true,
                        },
                    },
                },
            },
        },
    });

    return lowStockVariants.filter((variant) => {
        const total = variant.inventories
            .filter(
                (inv) =>
                    !inv.location ||
                    (inv.location.locationPurpose !== 'SCRAP' &&
                        (inv.location.locationType as string) !== 'CUSTOMER_OWNED'),
            )
            .reduce((sum, inv) => sum + inv.quantity.toNumber(), 0);
        const threshold = variant.minStockAlert?.toNumber() || 0;
        return total < threshold;
    }).length;
}

async function computeSuggestedReorderCount(): Promise<number> {
    const reorderVariants = await prisma.productVariant.findMany({
        where: { reorderPoint: { not: null } },
        select: {
            id: true,
            reorderPoint: true,
            inventories: { select: { quantity: true } },
        },
    });

    return reorderVariants.filter((variant) => {
        const total = variant.inventories.reduce(
            (sum, inv) => sum + inv.quantity.toNumber(),
            0,
        );
        const reorderPoint = variant.reorderPoint?.toNumber() || 0;
        return total < reorderPoint;
    }).length;
}
