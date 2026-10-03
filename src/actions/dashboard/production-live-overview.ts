'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { ProductionStatus } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';
import {
    getWibDayBounds,
    toBusinessDateString,
    formatWIB,
} from '@/lib/utils/timezone';
import { serializeData } from '@/lib/utils/utils';
import {
    processKeyFromCategory,
    type ProcessKey,
} from '@/lib/production/process-keys';
import { executionScrapTotal } from '@/lib/production/execution-scrap';
import { aggregateTodayOutputItems } from '@/lib/production/live-overview';
import {
    assessMissingShift,
    missingShiftMessage,
} from '@/lib/production/shift-coverage';

export const getProductionLiveOverview = withTenant(
    async function getProductionLiveOverview() {
        return safeAction(async () => {
            await requireAuth();

            const now = new Date();
            const todayStr = toBusinessDateString(now);
            const { startOfDay: todayStart, endOfDay: todayEnd } =
                getWibDayBounds(todayStr);

            const execTodayInclude = {
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
            } as const;

            const [
                executionsToday,
                activeOrders,
                openDowntimes,
                openIssues,
                waitingMaterialOrders,
            ] = await Promise.all([
                prisma.productionExecution.findMany({
                    where: {
                        status: { not: 'VOIDED' },
                        startTime: { gte: todayStart, lte: todayEnd },
                    },
                    include: execTodayInclude,
                }),
                prisma.productionOrder.findMany({
                    where: { status: ProductionStatus.IN_PROGRESS },
                    include: {
                        bom: {
                            include: {
                                productVariant: { select: { name: true } },
                            },
                        },
                        machine: { select: { code: true } },
                        shifts: {
                            include: { operator: { select: { name: true } } },
                        },
                        executions: {
                            where: { status: { not: 'VOIDED' } },
                            select: {
                                quantityProduced: true,
                                scrapQuantity: true,
                                scrapProngkolQty: true,
                                scrapDaunQty: true,
                                startTime: true,
                            },
                        },
                    },
                }),
                prisma.machineDowntime.findMany({
                    where: { endTime: null },
                    include: {
                        machine: { select: { code: true, type: true } },
                    },
                }),
                prisma.productionIssue.findMany({
                    where: { status: 'OPEN' },
                    include: {
                        productionOrder: {
                            select: {
                                id: true,
                                orderNumber: true,
                                bom: { select: { category: true } },
                            },
                        },
                    },
                }),
                prisma.productionOrder.findMany({
                    where: { status: 'WAITING_MATERIAL' },
                    select: {
                        id: true,
                        orderNumber: true,
                        createdAt: true,
                        bom: { select: { category: true } },
                    },
                }),
            ]);

            // Running list per process
            type RunningOrder = {
                id: string;
                orderNumber: string;
                productName: string;
                machineCode: string;
                operatorName: string;
                plannedQty: number;
                actualQty: number;
                progress: number;
                isLate: boolean;
                processKey: ProcessKey;
                unit: string | null;
                startedAt: Date;
                estimatedDoneAt: Date | null;
            };

            const runningOrders: RunningOrder[] = [];

            for (const o of activeOrders) {
                const processKey = processKeyFromCategory(o.bom?.category);
                if (o.status !== 'IN_PROGRESS') continue;

                const plannedQty = Number(o.plannedQuantity || 0);
                const actualQty = o.executions.reduce(
                    (sum, e) => sum + Number(e.quantityProduced || 0),
                    0,
                );
                const progress =
                    plannedQty > 0 ? (actualQty / plannedQty) * 100 : 0;
                const isLate = o.plannedEndDate
                    ? o.plannedEndDate < now
                    : false;
                const startTimes = o.executions.map((e) =>
                    e.startTime.getTime(),
                );
                const startedAt =
                    o.actualStartDate ||
                    (startTimes.length > 0
                        ? new Date(Math.min(...startTimes))
                        : o.createdAt);

                let estimatedDoneAt: Date | null = null;
                if (actualQty > 0) {
                    const elapsedMs = now.getTime() - startedAt.getTime();
                    if (elapsedMs > 0) {
                        const qtyPerMs = actualQty / elapsedMs;
                        const remainingQty = Math.max(
                            0,
                            plannedQty - actualQty,
                        );
                        if (qtyPerMs > 0) {
                            estimatedDoneAt = new Date(
                                now.getTime() + remainingQty / qtyPerMs,
                            );
                        }
                    }
                }
                if (!estimatedDoneAt) estimatedDoneAt = o.plannedEndDate;

                runningOrders.push({
                    id: o.id,
                    orderNumber: o.orderNumber,
                    productName: o.bom.productVariant.name,
                    machineCode: o.machine?.code || 'N/A',
                    operatorName: o.shifts?.[0]?.operator?.name || 'Unassigned',
                    plannedQty,
                    actualQty,
                    progress,
                    isLate,
                    processKey,
                    unit: null,
                    startedAt,
                    estimatedDoneAt,
                });
            }

            runningOrders.sort((a, b) => {
                if (a.isLate && !b.isLate) return -1;
                if (!a.isLate && b.isLate) return 1;
                return b.progress - a.progress;
            });

            // --- Attentions (with processKey when known) ---
            type AttentionItem = {
                type:
                    | 'downtime'
                    | 'waiting_material'
                    | 'issue'
                    | 'no_operator'
                    | 'no_shift'
                    | 'late'
                    | 'high_scrap';
                severity: 'red' | 'amber';
                title: string;
                subtitle: string;
                orderId?: string;
                machineId?: string;
                ageMinutes: number;
                processKey: ProcessKey | 'ALL';
                secondaryHref?: string;
                secondaryLabel?: string;
            };

            const attentions: AttentionItem[] = [];

            // Map machine type → rough process (best effort for downtime)
            const machineTypeToProcess = (
                type: string | null | undefined,
            ): ProcessKey | 'ALL' => {
                const t = (type || '').toUpperCase();
                if (t === 'MIXER') return 'MIXING';
                if (t === 'EXTRUDER' || t === 'REWINDER') return 'EXTRUSION';
                if (t === 'PACKER' || t === 'GRANULATOR') return 'PACKING';
                return 'ALL';
            };

            for (const d of openDowntimes) {
                const age = Math.floor(
                    (now.getTime() - d.startTime.getTime()) / 60000,
                );
                attentions.push({
                    type: 'downtime',
                    severity: age > 30 ? 'red' : 'amber',
                    title: `Mesin ${d.machine.code} Downtime`,
                    subtitle: `${d.reason} (Sejak ${formatWIB(d.startTime, 'HH:mm')})`,
                    machineId: d.machineId,
                    ageMinutes: age,
                    processKey: machineTypeToProcess(d.machine.type),
                });
            }

            for (const iss of openIssues) {
                const age = Math.floor(
                    (now.getTime() - iss.reportedAt.getTime()) / 60000,
                );
                attentions.push({
                    type: 'issue',
                    severity: 'red',
                    title: `Isu SPK #${iss.productionOrder.orderNumber}`,
                    subtitle: `${iss.description}`,
                    orderId: iss.productionOrderId,
                    ageMinutes: age,
                    processKey: processKeyFromCategory(
                        iss.productionOrder.bom?.category,
                    ),
                });
            }

            for (const order of activeOrders.filter(
                (o) => o.status === 'IN_PROGRESS',
            )) {
                const processKey = processKeyFromCategory(order.bom?.category);
                const totalProduced = order.executions.reduce(
                    (sum, e) => sum + Number(e.quantityProduced || 0),
                    0,
                );
                const totalScrap = order.executions.reduce(
                    (sum, e) => sum + executionScrapTotal(e),
                    0,
                );
                const totalPlusScrap = totalProduced + totalScrap;
                if (totalPlusScrap > 0) {
                    const scrapRatio = (totalScrap / totalPlusScrap) * 100;
                    if (scrapRatio > 5.0) {
                        attentions.push({
                            type: 'high_scrap',
                            severity: 'red',
                            title: `Scrap Tinggi SPK #${order.orderNumber}`,
                            subtitle: `Scrap ratio ${scrapRatio.toFixed(1)}% (${totalScrap.toFixed(0)} unit)`,
                            orderId: order.id,
                            ageMinutes: 0,
                            processKey,
                        });
                    }
                }

                const activeShift = order.shifts?.[0];
                if (!activeShift || !activeShift.operatorId) {
                    const age = Math.floor(
                        (now.getTime() - order.createdAt.getTime()) / 60000,
                    );
                    attentions.push({
                        type: 'no_operator',
                        severity: 'amber',
                        title: `SPK #${order.orderNumber} Tanpa Operator`,
                        subtitle:
                            'Shift berjalan aktif tetapi belum ditugaskan operator',
                        orderId: order.id,
                        ageMinutes: age,
                        processKey,
                    });
                }

                // Disiplin admin: SPK jalan tanpa shift yang mencakup saat ini.
                // Kiosk akan jatuh ke shift basi dan guard 24 jam menolak
                // backdate → hasil shift malam salah bucket (plan 2026-09-02).
                const missingShift = assessMissingShift({
                    shifts: order.shifts ?? [],
                    executions: order.executions,
                    createdAt: order.createdAt,
                    now,
                });
                if (missingShift.alert) {
                    attentions.push({
                        type: 'no_shift',
                        severity: missingShift.severity,
                        title: `SPK #${order.orderNumber} Tanpa Shift Aktif`,
                        subtitle: missingShiftMessage(order.shifts ?? [], now),
                        orderId: order.id,
                        ageMinutes: missingShift.ageMinutes,
                        processKey,
                        secondaryHref: `/production/orders/${order.id}`,
                        secondaryLabel: 'Tambah Shift',
                    });
                }
            }

            for (const wo of waitingMaterialOrders) {
                const age = Math.floor(
                    (now.getTime() - wo.createdAt.getTime()) / 60000,
                );
                attentions.push({
                    type: 'waiting_material',
                    severity: 'amber',
                    title: `SPK #${wo.orderNumber} Tunggu Material`,
                    subtitle: 'Menunggu rilis bahan baku ke lini produksi',
                    orderId: wo.id,
                    ageMinutes: age,
                    processKey: processKeyFromCategory(wo.bom?.category),
                    secondaryHref: '/warehouse/materials',
                    secondaryLabel: 'Bahan di Gudang',
                });
            }

            for (const o of runningOrders) {
                if (!o.isLate) continue;
                const age = Math.floor(
                    (now.getTime() -
                        (o.estimatedDoneAt?.getTime() || now.getTime())) /
                        60000,
                );
                attentions.push({
                    type: 'late',
                    severity: 'amber',
                    title: `SPK #${o.orderNumber} Terlambat`,
                    subtitle: `Target selesai terlewati. Est: ${
                        o.estimatedDoneAt
                            ? formatWIB(o.estimatedDoneAt, 'dd MMM HH:mm')
                            : '-'
                    }`,
                    orderId: o.id,
                    ageMinutes: Math.max(0, age),
                    processKey: o.processKey,
                });
            }

            attentions.sort((a, b) => {
                if (a.severity === 'red' && b.severity === 'amber') return -1;
                if (a.severity === 'amber' && b.severity === 'red') return 1;
                return b.ageMinutes - a.ageMinutes;
            });

            const todayOutputItems =
                aggregateTodayOutputItems(executionsToday);

            return serializeData({
                todayOutputItems,
                runningOrders,
                attentions: attentions.slice(0, 12),
            });
        });
    },
);
