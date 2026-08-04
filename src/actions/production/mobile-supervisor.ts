'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

export type TargetUnitMode = 'MIXED' | 'SINGLE' | 'NONE';

export interface MobileSupervisorOverview {
    generatedAt: string;
    highlights: {
        activeOrdersCount: number;
        outputToday: number;
        /** Sum of plannedQuantity for non-cancelled SPKs planned today; null when unavailable. */
        targetToday: number | null;
        /** Unit comparability of the daily target aggregate. */
        targetUnitMode: TargetUnitMode;
        /** Output unit when all planned SPKs share one unit, else null. */
        targetUnit: string | null;
        downtimeMinutesToday: number;
        scrapToday: number;
        qcPendingCount: number;
    };
    recentOrders: Array<{
        id: string;
        spkNumber: string;
        productName: string;
        status: string;
        progressPercent: number;
    }>;
    downtimeAlerts: Array<{
        id: string;
        machineName: string;
        reason: string;
        durationMinutes: number;
        startTime: string;
    }>;
}

export const getProductionSupervisorOverview = withTenant(
    async function getProductionSupervisorOverview() {
        return safeAction(async () => {
            await requireAuth();

            const todayStr = toBusinessDateString(new Date());
            const { startOfDay, endOfDay } = getWibDayBounds(todayStr);

            const [orders, executions, downtimes, qcPending, targetOrders] =
                await Promise.all([
                    prisma.productionOrder
                        ? prisma.productionOrder.findMany({
                              where: {
                                  status: {
                                      in: ['IN_PROGRESS', 'RELEASED', 'DRAFT'],
                                  },
                              },
                              take: 10,
                              orderBy: { updatedAt: 'desc' },
                              include: {
                                  bom: { select: { name: true } },
                              },
                          }).catch(() => [])
                        : Promise.resolve([]),
                    prisma.productionExecution
                        ? prisma.productionExecution.aggregate({
                              where: { createdAt: { gte: startOfDay } },
                              _sum: {
                                  quantityProduced: true,
                                  scrapQuantity: true,
                              },
                          }).catch(() => ({
                              _sum: {
                                  quantityProduced: null,
                                  scrapQuantity: null,
                              },
                          }))
                        : Promise.resolve({
                              _sum: {
                                  quantityProduced: null,
                                  scrapQuantity: null,
                              },
                          }),
                    prisma.machineDowntime
                        ? prisma.machineDowntime.findMany({
                              where: { createdAt: { gte: startOfDay } },
                              take: 5,
                              orderBy: { createdAt: 'desc' },
                              include: { machine: { select: { name: true } } },
                          }).catch(() => [])
                        : Promise.resolve([]),
                    prisma.qualityInspection
                        ? prisma.qualityInspection.count({
                              where: { result: 'QUARANTINE' },
                          }).catch(() => 0)
                        : Promise.resolve(0),
                    // Daily target aggregate — separate from the recent-order
                    // list so take:10 never truncates the planned-day total.
                    prisma.productionOrder
                        ? prisma.productionOrder
                              .findMany({
                                  where: {
                                      status: { not: 'CANCELLED' },
                                      plannedStartDate: {
                                          gte: startOfDay,
                                          lte: endOfDay,
                                      },
                                  },
                                  select: {
                                      plannedQuantity: true,
                                      bom: {
                                          select: {
                                              productVariant: {
                                                  select: {
                                                      primaryUnit: true,
                                                  },
                                              },
                                          },
                                      },
                                  },
                              })
                              .catch(() => null)
                        : Promise.resolve([]),
                ]);

            const activeOrdersCount = orders.filter((o) => o.status === 'IN_PROGRESS').length;
            const outputToday = Number(executions._sum?.quantityProduced ?? 0);
            const scrapToday = Number(executions._sum?.scrapQuantity ?? 0);

            let targetToday: number | null = null;
            let targetUnitMode: TargetUnitMode = 'NONE';
            let targetUnit: string | null = null;
            if (targetOrders) {
                const units = new Set<string>(
                    targetOrders
                        .map((o) => o.bom?.productVariant?.primaryUnit)
                        .filter((u): u is NonNullable<typeof u> => u != null)
                        .map(String),
                );
                targetToday = targetOrders.reduce(
                    (sum, o) => sum + Number(o.plannedQuantity),
                    0,
                );
                if (units.size > 1) {
                    targetUnitMode = 'MIXED';
                } else if (units.size === 1) {
                    targetUnitMode = 'SINGLE';
                    targetUnit = units.values().next().value ?? null;
                }
            }

            const getDowntimeMinutes = (d: { startTime: Date; endTime: Date | null }) => {
                if (!d.endTime) return 15;
                return Math.max(
                    1,
                    Math.round(
                        (new Date(d.endTime).getTime() -
                            new Date(d.startTime).getTime()) /
                            60000,
                    ),
                );
            };

            const totalDowntimeMinutes = downtimes.reduce(
                (sum, d) => sum + getDowntimeMinutes(d),
                0,
            );

            const recentOrders = orders.map((o) => {
                const target = Number(o.plannedQuantity ?? 1);
                const actual = Number(o.actualQuantity ?? 0);
                const progress =
                    target > 0
                        ? Math.min(100, Math.round((actual / target) * 100))
                        : 0;
                return {
                    id: o.id,
                    spkNumber: o.orderNumber || o.id.substring(0, 8),
                    productName: o.bom?.name ?? 'Formulasi BOM',
                    status: o.status,
                    progressPercent: progress,
                };
            });

            const downtimeAlerts = downtimes.map((d) => ({
                id: d.id,
                machineName: d.machine?.name ?? 'Mesin',
                reason: d.reason || 'Downtime',
                durationMinutes: getDowntimeMinutes(d),
                startTime: d.startTime
                    ? new Date(d.startTime).toISOString()
                    : new Date(d.createdAt).toISOString(),
            }));

            const overview: MobileSupervisorOverview = {
                generatedAt: new Date().toISOString(),
                highlights: {
                    activeOrdersCount,
                    outputToday,
                    targetToday,
                    targetUnitMode,
                    targetUnit,
                    downtimeMinutesToday: totalDowntimeMinutes,
                    scrapToday,
                    qcPendingCount: qcPending,
                },
                recentOrders,
                downtimeAlerts,
            };

            return serializeData(overview);
        });
    },
);
