'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { ProductionStatus } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';
import { getWibDayBounds, toBusinessDateString, BUSINESS_TIMEZONE, formatWIB } from '@/lib/utils/timezone';
import { serializeData } from '@/lib/utils/utils';

export type ProcessKey = 'MIXING' | 'EXTRUSION' | 'PACKING' | 'OTHER';

const PROCESS_KEYS: ProcessKey[] = ['MIXING', 'EXTRUSION', 'PACKING', 'OTHER'];

function processKeyFromCategory(category: string | null | undefined): ProcessKey {
  const c = (category || '').toUpperCase();
  if (c === 'MIXING') return 'MIXING';
  if (c === 'EXTRUSION') return 'EXTRUSION';
  if (c === 'PACKING') return 'PACKING';
  return 'OTHER';
}

function emptyHourly() {
  return Array.from({ length: 24 }, (_, i) => ({ hour: i, today: 0, avg7d: 0 }));
}

function emptyProcessPulse() {
  return {
    outputToday: 0,
    outputYesterday: 0,
    scrapToday: 0,
    scrapRate: 0,
    recordedThisHour: 0,
    activeJobs: 0,
    released: 0,
    waiting: 0,
    hourly: emptyHourly(),
  };
}

export const getProductionLiveOverview = withTenant(
  async function getProductionLiveOverview() {
    return safeAction(async () => {
      await requireAuth();

      const now = new Date();
      const todayStr = toBusinessDateString(now);
      const { startOfDay: todayStart, endOfDay: todayEnd } = getWibDayBounds(todayStr);

      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = toBusinessDateString(yesterday);
      const { startOfDay: yesterdayStart, endOfDay: yesterdayEnd } = getWibDayBounds(yesterdayStr);

      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const { startOfDay: sevenDaysAgoStart } = getWibDayBounds(
        toBusinessDateString(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
      );

      const getWibHour = (d: Date) => {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: BUSINESS_TIMEZONE,
          hour: 'numeric',
          hour12: false,
        }).formatToParts(d);
        const hourVal = parts.find((p) => p.type === 'hour')?.value;
        return hourVal ? parseInt(hourVal, 10) % 24 : d.getUTCHours();
      };

      const execInclude = {
        productionOrder: {
          select: {
            id: true,
            bom: { select: { category: true } },
          },
        },
      } as const;

      const [executionsToday, executionsYesterday, executions7d, activeOrders, openDowntimes, openIssues, waitingMaterialOrders] =
        await Promise.all([
          prisma.productionExecution.findMany({
            where: {
              status: { not: 'VOIDED' },
              startTime: { gte: todayStart, lte: todayEnd },
            },
            include: execInclude,
          }),
          prisma.productionExecution.findMany({
            where: {
              status: { not: 'VOIDED' },
              startTime: { gte: yesterdayStart, lte: yesterdayEnd },
            },
            include: execInclude,
          }),
          prisma.productionExecution.findMany({
            where: {
              status: { not: 'VOIDED' },
              startTime: { gte: sevenDaysAgoStart, lte: yesterdayEnd },
            },
            include: execInclude,
          }),
          prisma.productionOrder.findMany({
            where: {
              status: {
                in: [
                  ProductionStatus.IN_PROGRESS,
                  ProductionStatus.RELEASED,
                  ProductionStatus.WAITING_MATERIAL,
                ],
              },
            },
            include: {
              bom: { include: { productVariant: { select: { name: true } } } },
              machine: { select: { code: true } },
              shifts: {
                include: { operator: { select: { name: true } } },
              },
              executions: {
                where: { status: { not: 'VOIDED' } },
                select: {
                  quantityProduced: true,
                  scrapQuantity: true,
                  startTime: true,
                },
              },
            },
          }),
          prisma.machineDowntime.findMany({
            where: { endTime: null },
            include: { machine: { select: { code: true, type: true } } },
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

      // --- Per-process pulse + hourly ---
      const processes: Record<
        ProcessKey,
        ReturnType<typeof emptyProcessPulse>
      > = {
        MIXING: emptyProcessPulse(),
        EXTRUSION: emptyProcessPulse(),
        PACKING: emptyProcessPulse(),
        OTHER: emptyProcessPulse(),
      };

      const addOutput = (
        bucket: 'today' | 'yesterday' | 'hour' | 'avg7d',
        category: string | null | undefined,
        qty: number,
        scrap: number,
        hour?: number
      ) => {
        const key = processKeyFromCategory(category);
        const p = processes[key];
        if (bucket === 'today') {
          p.outputToday += qty;
          p.scrapToday += scrap;
        } else if (bucket === 'yesterday') {
          p.outputYesterday += qty;
        } else if (bucket === 'hour') {
          p.recordedThisHour += qty;
        } else if (bucket === 'avg7d' && hour !== undefined) {
          p.hourly[hour].avg7d += qty / 7;
        }
      };

      for (const exec of executionsToday) {
        const cat = exec.productionOrder?.bom?.category;
        const qty = Number(exec.quantityProduced || 0);
        const scrap = Number(exec.scrapQuantity || 0);
        const hr = getWibHour(exec.startTime);
        addOutput('today', cat, qty, scrap);
        processes[processKeyFromCategory(cat)].hourly[hr].today += qty;
        if (exec.startTime >= oneHourAgo) {
          addOutput('hour', cat, qty, 0);
        }
      }

      for (const exec of executionsYesterday) {
        const cat = exec.productionOrder?.bom?.category;
        addOutput('yesterday', cat, Number(exec.quantityProduced || 0), 0);
      }

      for (const exec of executions7d) {
        const cat = exec.productionOrder?.bom?.category;
        const hr = getWibHour(exec.startTime);
        addOutput('avg7d', cat, Number(exec.quantityProduced || 0), 0, hr);
      }

      for (const key of PROCESS_KEYS) {
        const p = processes[key];
        const denom = p.outputToday + p.scrapToday;
        p.scrapRate = denom > 0 ? (p.scrapToday / denom) * 100 : 0;
      }

      // Order counts + running list per process
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
        if (o.status === 'IN_PROGRESS') processes[processKey].activeJobs += 1;
        if (o.status === 'RELEASED') processes[processKey].released += 1;
        if (o.status === 'WAITING_MATERIAL') processes[processKey].waiting += 1;

        if (o.status !== 'IN_PROGRESS') continue;

        const plannedQty = Number(o.plannedQuantity || 0);
        const actualQty = o.executions.reduce(
          (sum, e) => sum + Number(e.quantityProduced || 0),
          0
        );
        const progress = plannedQty > 0 ? (actualQty / plannedQty) * 100 : 0;
        const isLate = o.plannedEndDate ? o.plannedEndDate < now : false;
        const startTimes = o.executions.map((e) => e.startTime.getTime());
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
            const remainingQty = Math.max(0, plannedQty - actualQty);
            if (qtyPerMs > 0) {
              estimatedDoneAt = new Date(now.getTime() + remainingQty / qtyPerMs);
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
        type: 'downtime' | 'waiting_material' | 'issue' | 'no_operator' | 'late' | 'high_scrap';
        severity: 'red' | 'amber';
        title: string;
        subtitle: string;
        orderId?: string;
        machineId?: string;
        ageMinutes: number;
        processKey: ProcessKey | 'ALL';
      };

      const attentions: AttentionItem[] = [];

      // Map machine type → rough process (best effort for downtime)
      const machineTypeToProcess = (type: string | null | undefined): ProcessKey | 'ALL' => {
        const t = (type || '').toUpperCase();
        if (t === 'MIXER') return 'MIXING';
        if (t === 'EXTRUDER' || t === 'REWINDER') return 'EXTRUSION';
        if (t === 'PACKER' || t === 'GRANULATOR') return 'PACKING';
        return 'ALL';
      };

      for (const d of openDowntimes) {
        const age = Math.floor((now.getTime() - d.startTime.getTime()) / 60000);
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
        const age = Math.floor((now.getTime() - iss.reportedAt.getTime()) / 60000);
        attentions.push({
          type: 'issue',
          severity: 'red',
          title: `Isu SPK #${iss.productionOrder.orderNumber}`,
          subtitle: `${iss.description}`,
          orderId: iss.productionOrderId,
          ageMinutes: age,
          processKey: processKeyFromCategory(iss.productionOrder.bom?.category),
        });
      }

      for (const order of activeOrders.filter((o) => o.status === 'IN_PROGRESS')) {
        const processKey = processKeyFromCategory(order.bom?.category);
        const totalProduced = order.executions.reduce(
          (sum, e) => sum + Number(e.quantityProduced || 0),
          0
        );
        const totalScrap = order.executions.reduce(
          (sum, e) => sum + Number(e.scrapQuantity || 0),
          0
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
          const age = Math.floor((now.getTime() - order.createdAt.getTime()) / 60000);
          attentions.push({
            type: 'no_operator',
            severity: 'amber',
            title: `SPK #${order.orderNumber} Tanpa Operator`,
            subtitle: 'Shift berjalan aktif tetapi belum ditugaskan operator',
            orderId: order.id,
            ageMinutes: age,
            processKey,
          });
        }
      }

      for (const wo of waitingMaterialOrders) {
        const age = Math.floor((now.getTime() - wo.createdAt.getTime()) / 60000);
        attentions.push({
          type: 'waiting_material',
          severity: 'amber',
          title: `SPK #${wo.orderNumber} Tunggu Material`,
          subtitle: 'Menunggu rilis bahan baku ke lini produksi',
          orderId: wo.id,
          ageMinutes: age,
          processKey: processKeyFromCategory(wo.bom?.category),
        });
      }

      for (const o of runningOrders) {
        if (!o.isLate) continue;
        const age = Math.floor(
          (now.getTime() - (o.estimatedDoneAt?.getTime() || now.getTime())) / 60000
        );
        attentions.push({
          type: 'late',
          severity: 'amber',
          title: `SPK #${o.orderNumber} Terlambat`,
          subtitle: `Target selesai terlewati. Est: ${
            o.estimatedDoneAt ? formatWIB(o.estimatedDoneAt, 'dd MMM HH:mm') : '-'
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

      // Stacked series for ALL tab (hours 0-23)
      const stackedHourly = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        MIXING: processes.MIXING.hourly[hour].today,
        EXTRUSION: processes.EXTRUSION.hourly[hour].today,
        PACKING: processes.PACKING.hourly[hour].today,
        OTHER: processes.OTHER.hourly[hour].today,
      }));

      const totals = {
        activeJobs: PROCESS_KEYS.reduce((s, k) => s + processes[k].activeJobs, 0),
        released: PROCESS_KEYS.reduce((s, k) => s + processes[k].released, 0),
        waiting: PROCESS_KEYS.reduce((s, k) => s + processes[k].waiting, 0),
      };

      return serializeData({
        processes,
        stackedHourly,
        runningOrders,
        attentions: attentions.slice(0, 12),
        totals,
      });
    });
  }
);
