'use server';

import { ProductionStatus } from '@prisma/client';
import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { hasWorkspaceEntitlement } from '@/lib/auth/access-policy';
import { canSeeNavHref } from '@/lib/auth/permission-match';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';
import {
    parseProductionAlertThresholds,
    PRODUCTION_ALERT_THRESHOLDS_KEY,
} from '@/lib/production/alert-thresholds';
import {
    PRODUCTION_ATTENTION_SAMPLE_LIMIT,
    PRODUCTION_DASHBOARD_SAMPLE_LIMIT,
    PRODUCTION_OUTPUT_ROW_LIMIT,
    PRODUCTION_SCRAP_ROW_LIMIT,
    composeLateProcessDriver,
    composeProductionAttention,
    composeProductionDowntime,
    composeProductionLiveOrders,
    composeProductionOutputHealth,
    resolveFreshProductionDashboardAccess,
    type ProductionActiveOrderRow,
    type ProductionAttentionData,
    type ProductionDashboardLinks,
    type ProductionDowntimeData,
    type ProductionDashboardSectionState,
    type ProductionDriversData,
    type ProductionDowntimeRow,
    type ProductionExecutionRow,
    type ProductionIssueRow,
    type ProductionLiveOrdersData,
    type ProductionOutputHealthData,
    type ProductionScrapExecutionRow,
    type ProductionShiftFact,
    type ProductionWaitingMaterialRow,
} from '@/services/production/production-dashboard-health-service';

const ACTIVE_ORDER_COMPOSITION_LIMIT = 500;

function unavailableOutput(): ProductionOutputHealthData {
    return {
        state: 'UNAVAILABLE',
        totalGroups: 0,
        returned: 0,
        truncated: false,
        processTotals: [],
        items: [],
    };
}

function unavailableLiveOrders(
    total: number | null = null,
    lateTotal: number | null = null,
): ProductionLiveOrdersData & {
    total: number | null;
    lateTotal: number | null;
} {
    return {
        state: 'UNAVAILABLE',
        total,
        lateTotal,
        returned: 0,
        items: [],
    };
}

function unavailableDowntime(): ProductionDowntimeData {
    return {
        state: 'UNAVAILABLE',
        total: 0,
        thresholdMinutes: null,
        longest: null,
    };
}

function unavailableAttention(): ProductionAttentionData & {
    total: number | null;
} {
    return {
        state: 'UNAVAILABLE',
        total: null,
        returned: 0,
        items: [],
    };
}

function unavailableDrivers(): ProductionDriversData {
    return {
        state: 'UNAVAILABLE',
        longestDowntime: null,
        lateProcess: null,
    };
}

export const getProductionLiveOverview = withTenant(
    async function getProductionLiveOverview() {
        return safeAction(async () => {
            const session = await requireAuth();
            const generatedAt = new Date();

            if (!hasWorkspaceEntitlement('production')) {
                return serializeData({
                    generatedAt: generatedAt.toISOString(),
                    state: 'HIDDEN' as const,
                    permissions: null,
                    health: null,
                    liveOrders: null,
                    attention: null,
                    drivers: null,
                });
            }

            // Fresh tenant DB role/resource state wins over stale JWT claims.
            // This is intentionally the only query before every business read.
            const access = await resolveFreshProductionDashboardAccess(
                session.user.id,
            );
            const canOpen = (href: string, moduleRoot = '/production') =>
                canSeeNavHref(href, access.resources, moduleRoot);
            const links: ProductionDashboardLinks = {
                outputReport: canOpen('/production/output-report')
                    ? '/production/output-report'
                    : null,
                daily: canOpen('/production/daily')
                    ? '/production/daily'
                    : null,
                orders: canOpen('/production/orders')
                    ? '/production/orders'
                    : null,
                warehouseMaterials: canOpen(
                    '/warehouse/materials',
                    '/warehouse',
                )
                    ? '/warehouse/materials'
                    : null,
                kiosk: canOpen('/kiosk', '/kiosk') ? '/kiosk' : null,
            };
            const orderHref = (orderId: string) =>
                canOpen(`/production/orders/${orderId}`)
                    ? `/production/orders/${orderId}`
                    : null;
            const machineHref = (machineId: string) =>
                canOpen(`/production/machines/${machineId}`)
                    ? `/production/machines/${machineId}`
                    : null;

            const today = getWibDayBounds(toBusinessDateString(generatedAt));
            const recentExecutionStart = new Date(
                generatedAt.getTime() - 24 * 60 * 60 * 1000,
            );

            const outputRead = prisma.productionExecution.findMany({
                where: {
                    status: { not: 'VOIDED' },
                    startTime: {
                        gte: today.startOfDay,
                        lte: today.endOfDay,
                    },
                },
                orderBy: { id: 'asc' },
                take: PRODUCTION_OUTPUT_ROW_LIMIT + 1,
                select: {
                    quantityProduced: true,
                    productionOrder: {
                        select: {
                            id: true,
                            bom: {
                                select: {
                                    category: true,
                                    productVariant: {
                                        select: {
                                            id: true,
                                            name: true,
                                            skuCode: true,
                                            primaryUnit: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });
            const activeRead = Promise.all([
                prisma.productionOrder.count({
                    where: { status: ProductionStatus.IN_PROGRESS },
                }),
                prisma.productionOrder.count({
                    where: {
                        status: ProductionStatus.IN_PROGRESS,
                        plannedEndDate: { lt: generatedAt },
                    },
                }),
                prisma.productionOrder.findMany({
                    where: { status: ProductionStatus.IN_PROGRESS },
                    orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
                    take: ACTIVE_ORDER_COMPOSITION_LIMIT + 1,
                    select: {
                        id: true,
                        orderNumber: true,
                        plannedQuantity: true,
                        actualQuantity: true,
                        plannedEndDate: true,
                        actualStartDate: true,
                        createdAt: true,
                        bom: {
                            select: {
                                category: true,
                                productVariant: {
                                    select: {
                                        name: true,
                                        primaryUnit: true,
                                    },
                                },
                            },
                        },
                        machine: { select: { code: true } },
                        _count: {
                            select: {
                                shifts: {
                                    where: {
                                        startTime: { lte: generatedAt },
                                        endTime: { gte: generatedAt },
                                    },
                                },
                            },
                        },
                        shifts: {
                            where: {
                                startTime: { lte: generatedAt },
                                endTime: { gte: generatedAt },
                            },
                            orderBy: [
                                {
                                    operatorId: {
                                        sort: 'asc',
                                        nulls: 'last',
                                    },
                                },
                                { startTime: 'asc' },
                                { id: 'asc' },
                            ],
                            take: 1,
                            select: {
                                operatorId: true,
                                startTime: true,
                                endTime: true,
                                operator: { select: { name: true } },
                            },
                        },
                        executions: {
                            where: {
                                status: { not: 'VOIDED' },
                                startTime: { gte: recentExecutionStart },
                            },
                            orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
                            take: 1,
                            select: { startTime: true },
                        },
                    },
                }),
            ]);
            const scrapAttentionRead = prisma.productionExecution.findMany({
                where: {
                    status: { not: 'VOIDED' },
                    productionOrder: {
                        status: ProductionStatus.IN_PROGRESS,
                    },
                },
                orderBy: { id: 'asc' },
                take: PRODUCTION_SCRAP_ROW_LIMIT + 1,
                select: {
                    productionOrderId: true,
                    quantityProduced: true,
                    scrapQuantity: true,
                    scrapProngkolQty: true,
                    scrapDaunQty: true,
                },
            });
            const thresholdRead = prisma.appSetting.findUnique({
                where: { key: PRODUCTION_ALERT_THRESHOLDS_KEY },
                select: { value: true },
            });
            const downtimeRead = Promise.all([
                prisma.machineDowntime.count({ where: { endTime: null } }),
                prisma.machineDowntime.findMany({
                    where: { endTime: null },
                    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
                    take: PRODUCTION_ATTENTION_SAMPLE_LIMIT,
                    select: {
                        id: true,
                        machineId: true,
                        startTime: true,
                        reason: true,
                        machine: { select: { code: true, type: true } },
                    },
                }),
            ]);
            const issueRead = Promise.all([
                prisma.productionIssue.count({ where: { status: 'OPEN' } }),
                prisma.productionIssue.findMany({
                    where: { status: 'OPEN' },
                    orderBy: [{ reportedAt: 'asc' }, { id: 'asc' }],
                    take: PRODUCTION_ATTENTION_SAMPLE_LIMIT,
                    select: {
                        id: true,
                        productionOrderId: true,
                        description: true,
                        reportedAt: true,
                        productionOrder: {
                            select: {
                                orderNumber: true,
                                bom: { select: { category: true } },
                            },
                        },
                    },
                }),
            ]);
            const waitingRead = Promise.all([
                prisma.productionOrder.count({
                    where: { status: ProductionStatus.WAITING_MATERIAL },
                }),
                prisma.productionOrder.findMany({
                    where: { status: ProductionStatus.WAITING_MATERIAL },
                    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                    take: PRODUCTION_ATTENTION_SAMPLE_LIMIT,
                    select: {
                        id: true,
                        orderNumber: true,
                        createdAt: true,
                        bom: { select: { category: true } },
                    },
                }),
            ]);

            const [
                output,
                active,
                scrapAttention,
                threshold,
                downtime,
                issues,
                waiting,
            ] = await Promise.allSettled([
                outputRead,
                activeRead,
                scrapAttentionRead,
                thresholdRead,
                downtimeRead,
                issueRead,
                waitingRead,
            ]);

            let outputHealth = unavailableOutput();
            if (output.status === 'fulfilled') {
                const truncated =
                    output.value.length > PRODUCTION_OUTPUT_ROW_LIMIT;
                const boundedRows = output.value.slice(
                    0,
                    PRODUCTION_OUTPUT_ROW_LIMIT,
                ) as ProductionExecutionRow[];
                outputHealth = composeProductionOutputHealth(
                    boundedRows,
                    truncated,
                );
                if (truncated) outputHealth.state = 'UNAVAILABLE';
            }

            let liveOrders = unavailableLiveOrders();
            let activeRows: ProductionActiveOrderRow[] = [];
            let activeComplete = false;
            if (active.status === 'fulfilled') {
                const [activeTotal, lateTotal, rows] = active.value;
                activeComplete = rows.length <= ACTIVE_ORDER_COMPOSITION_LIMIT;
                if (activeComplete) {
                    activeRows = rows as ProductionActiveOrderRow[];
                    liveOrders = composeProductionLiveOrders(
                        activeRows,
                        generatedAt,
                    );
                    liveOrders.total = activeTotal;
                    liveOrders.lateTotal = lateTotal;
                    liveOrders.returned = Math.min(
                        liveOrders.items.length,
                        PRODUCTION_DASHBOARD_SAMPLE_LIMIT,
                    );
                } else {
                    liveOrders = unavailableLiveOrders(activeTotal, lateTotal);
                }
            }

            const activeOrderIds = activeRows.map((order) => order.id);
            // One fixed batched fact read (two statements), never per SPK.
            // It runs after bounded active IDs are known and preserves all-time
            // shift existence/latest truth outside the current-window sample.
            const shiftFactsResult = activeComplete
                ? await Promise.allSettled([
                      prisma.productionShift.groupBy({
                          by: ['productionOrderId'],
                          where: {
                              productionOrderId: { in: activeOrderIds },
                          },
                          _count: { _all: true },
                      }),
                      prisma.productionShift.findMany({
                          where: {
                              productionOrderId: { in: activeOrderIds },
                          },
                          orderBy: [
                              { productionOrderId: 'asc' },
                              { startTime: 'desc' },
                              { id: 'asc' },
                          ],
                          distinct: ['productionOrderId'],
                          select: {
                              productionOrderId: true,
                              startTime: true,
                              endTime: true,
                          },
                      }),
                  ])
                : [];
            const shiftFacts = new Map<string, ProductionShiftFact>();
            const shiftCountRows = shiftFactsResult[0];
            const latestShiftRows = shiftFactsResult[1];
            if (
                shiftCountRows?.status === 'fulfilled' &&
                latestShiftRows?.status === 'fulfilled'
            ) {
                const latestByOrder = new Map(
                    latestShiftRows.value.map((row) => [
                        row.productionOrderId,
                        row,
                    ]),
                );
                for (const row of shiftCountRows.value) {
                    const latest = latestByOrder.get(row.productionOrderId);
                    shiftFacts.set(row.productionOrderId, {
                        count: row._count._all,
                        latestStartTime: latest?.startTime ?? null,
                        latestEndTime: latest?.endTime ?? null,
                    });
                }
                for (const order of activeRows) {
                    if (!shiftFacts.has(order.id)) {
                        shiftFacts.set(order.id, {
                            count: 0,
                            latestStartTime: null,
                            latestEndTime: null,
                        });
                    }
                }
            }
            const shiftFactsAvailable =
                !activeComplete ||
                (shiftCountRows?.status === 'fulfilled' &&
                    latestShiftRows?.status === 'fulfilled');

            let downtimeHealth = unavailableDowntime();
            let downtimeRows: ProductionDowntimeRow[] = [];
            let thresholds: ReturnType<
                typeof parseProductionAlertThresholds
            > | null = null;
            let downtimeTotal: number | null = null;
            if (threshold.status === 'fulfilled') {
                thresholds = parseProductionAlertThresholds(
                    threshold.value?.value,
                );
            }
            if (downtime.status === 'fulfilled') {
                const [total, rows] = downtime.value;
                downtimeRows = rows;
                downtimeTotal = total;
                if (thresholds) {
                    downtimeHealth = composeProductionDowntime(
                        rows,
                        generatedAt,
                        thresholds,
                        machineHref,
                    );
                    downtimeHealth.total = total;
                } else {
                    downtimeHealth.total = total;
                }
            }

            const issueRows: ProductionIssueRow[] =
                issues.status === 'fulfilled' ? issues.value[1] : [];
            const waitingRows: ProductionWaitingMaterialRow[] =
                waiting.status === 'fulfilled' ? waiting.value[1] : [];
            let attention = unavailableAttention();
            const attentionHasAllReaders =
                activeComplete &&
                downtime.status === 'fulfilled' &&
                issues.status === 'fulfilled' &&
                waiting.status === 'fulfilled' &&
                scrapAttention.status === 'fulfilled' &&
                scrapAttention.value.length <= PRODUCTION_SCRAP_ROW_LIMIT &&
                thresholds != null &&
                shiftFactsAvailable;
            const scrapRows: ProductionScrapExecutionRow[] =
                scrapAttention.status === 'fulfilled' &&
                scrapAttention.value.length <= PRODUCTION_SCRAP_ROW_LIMIT
                    ? scrapAttention.value
                    : [];
            const composedAttention = composeProductionAttention({
                now: generatedAt,
                activeOrders: activeRows,
                downtimes: downtimeRows,
                issues: issueRows,
                waitingMaterials: waitingRows,
                scrapExecutions: scrapRows,
                thresholds,
                shiftFacts: shiftFactsAvailable ? shiftFacts : null,
                orderHref,
                machineHref,
                warehouseMaterialsHref: links.warehouseMaterials,
            });
            if (attentionHasAllReaders) {
                const activeAttentionCount = composeProductionAttention({
                    now: generatedAt,
                    activeOrders: activeRows,
                    downtimes: [],
                    issues: [],
                    waitingMaterials: [],
                    scrapExecutions: scrapRows,
                    thresholds,
                    shiftFacts,
                    orderHref,
                    machineHref,
                    warehouseMaterialsHref: links.warehouseMaterials,
                }).total;
                composedAttention.total =
                    (activeAttentionCount ?? 0) +
                    (downtimeTotal ?? 0) +
                    issues.value[0] +
                    waiting.value[0];
                attention = composedAttention;
            } else {
                attention = {
                    ...composedAttention,
                    state: 'UNAVAILABLE',
                    total: null,
                };
            }

            const drivers: ProductionDriversData = {
                state:
                    activeComplete &&
                    downtime.status === 'fulfilled' &&
                    threshold.status === 'fulfilled' &&
                    thresholds != null
                        ? 'AVAILABLE'
                        : 'UNAVAILABLE',
                longestDowntime: downtimeHealth.longest,
                lateProcess: activeComplete
                    ? composeLateProcessDriver(activeRows, generatedAt)
                    : null,
            };

            return serializeData({
                generatedAt: generatedAt.toISOString(),
                state: 'AVAILABLE' as const,
                permissions: { links },
                health: {
                    output: outputHealth,
                    activeSpk: {
                        state:
                            active.status === 'fulfilled'
                                ? ('AVAILABLE' as const)
                                : ('UNAVAILABLE' as const),
                        total:
                            active.status === 'fulfilled'
                                ? active.value[0]
                                : null,
                        lateTotal:
                            active.status === 'fulfilled'
                                ? active.value[1]
                                : null,
                    },
                    downtime: downtimeHealth,
                } satisfies {
                    output: ProductionOutputHealthData;
                    activeSpk: {
                        state: ProductionDashboardSectionState;
                        total: number | null;
                        lateTotal: number | null;
                    };
                    downtime: ProductionDowntimeData;
                },
                liveOrders,
                attention,
                drivers:
                    drivers.state === 'AVAILABLE'
                        ? drivers
                        : {
                              ...unavailableDrivers(),
                              longestDowntime: downtimeHealth.longest,
                              lateProcess: drivers.lateProcess,
                          },
            });
        });
    },
);
