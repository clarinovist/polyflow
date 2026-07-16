'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { ProductionStatus, InspectionResult } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';
import { getWibDayBounds, toBusinessDateString, BUSINESS_TIMEZONE, formatWIB } from '@/lib/utils/timezone';
import { serializeData } from '@/lib/utils/utils';


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

      // --- 1. Today's Executions & Yesterday's Executions ---
      const [executionsToday, executionsYesterday] = await Promise.all([
        prisma.productionExecution.findMany({
          where: {
            status: { not: 'VOIDED' },
            startTime: { gte: todayStart, lte: todayEnd }
          },
          include: {
            operator: { select: { name: true } },
            machine: { select: { code: true } }
          }
        }),
        prisma.productionExecution.findMany({
          where: {
            status: { not: 'VOIDED' },
            startTime: { gte: yesterdayStart, lte: yesterdayEnd }
          }
        })
      ]);

      const outputToday = executionsToday.reduce((sum, e) => sum + Number(e.quantityProduced || 0), 0);
      const outputYesterday = executionsYesterday.reduce((sum, e) => sum + Number(e.quantityProduced || 0), 0);
      const scrapToday = executionsToday.reduce((sum, e) => sum + Number(e.scrapQuantity || 0), 0);

      // --- 2. Production Orders for Today (Target) ---
      // ponytail: V1 counts full plannedQty of any overlapping order. Add when need daily target allocation: split qty pro-rata or use separate DailyTarget table / manual input.
      const targetOrders = await prisma.productionOrder.findMany({
        where: {
          status: { notIn: [ProductionStatus.DRAFT] },
          plannedStartDate: { lte: todayEnd },
          OR: [
            { plannedEndDate: null },
            { plannedEndDate: { gte: todayStart } }
          ]
        },
        select: {
          plannedQuantity: true
        }
      });
      const targetToday = targetOrders.reduce((sum, o) => sum + Number(o.plannedQuantity || 0), 0);

      // --- 3. Run Rate Last 60m ---
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const runRateExecs = await prisma.productionExecution.findMany({
        where: {
          status: { not: 'VOIDED' },
          startTime: { gte: oneHourAgo }
        },
        select: {
          quantityProduced: true
        }
      });
      const runRateLastHour = runRateExecs.reduce((sum, e) => sum + Number(e.quantityProduced || 0), 0);

      // --- 4. Order Counts by Status ---
      const [activeJobs, released, waiting] = await Promise.all([
        prisma.productionOrder.count({ where: { status: 'IN_PROGRESS' } }),
        prisma.productionOrder.count({ where: { status: 'RELEASED' } }),
        prisma.productionOrder.count({ where: { status: 'WAITING_MATERIAL' } })
      ]);

      // --- 5. Yield Today ---
      const targetOrdersToday = await prisma.productionOrder.findMany({
        where: {
          OR: [
            { status: 'IN_PROGRESS' },
            {
              status: 'COMPLETED',
              updatedAt: { gte: todayStart, lte: todayEnd }
            }
          ]
        },
        select: {
          plannedQuantity: true,
          executions: {
            where: { status: { not: 'VOIDED' } },
            select: { quantityProduced: true }
          }
        }
      });

      let totalPlannedToday = 0;
      let totalActualToday = 0;
      for (const order of targetOrdersToday) {
        totalPlannedToday += Number(order.plannedQuantity || 0);
        totalActualToday += order.executions.reduce((sum, e) => sum + Number(e.quantityProduced || 0), 0);
      }
      const yieldToday = totalPlannedToday > 0 ? (totalActualToday / totalPlannedToday) * 100 : 0;

      // --- 6. QC Pass Rate Today ---
      const inspectionsToday = await prisma.qualityInspection.findMany({
        where: { inspectedAt: { gte: todayStart, lte: todayEnd } },
        select: { result: true }
      });
      const passCount = inspectionsToday.filter(i => i.result === InspectionResult.PASS).length;
      const totalInspections = inspectionsToday.length;
      const qcPassRateToday = totalInspections > 0 ? (passCount / totalInspections) * 100 : 100;

      // --- 7. Downtime Open Count ---
      const downtimeOpenCount = await prisma.machineDowntime.count({
        where: { endTime: null }
      });

      // --- 8. Hourly Chart Data ---
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        today: 0,
        avg7d: 0
      }));

      // Helper to get WIB hour
      const getWibHour = (d: Date) => {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: BUSINESS_TIMEZONE,
          hour: 'numeric',
          hour12: false
        }).formatToParts(d);
        const hourVal = parts.find(p => p.type === 'hour')?.value;
        return hourVal ? parseInt(hourVal, 10) % 24 : d.getUTCHours();
      };

      // Aggregate today hourly
      for (const exec of executionsToday) {
        const hr = getWibHour(exec.startTime);
        hourlyData[hr].today += Number(exec.quantityProduced || 0);
      }

      // Aggregate average 7d
      const { startOfDay: sevenDaysAgoStart } = getWibDayBounds(
        toBusinessDateString(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
      );
      const executions7d = await prisma.productionExecution.findMany({
        where: {
          status: { not: 'VOIDED' },
          startTime: { gte: sevenDaysAgoStart, lte: yesterdayEnd }
        },
        select: {
          startTime: true,
          quantityProduced: true
        }
      });
      for (const exec of executions7d) {
        const hr = getWibHour(exec.startTime);
        hourlyData[hr].avg7d += Number(exec.quantityProduced || 0) / 7;
      }

      // --- 9. Floor Live Mini (Machines) — batched to avoid N+1 ---
      const machinesRaw = await prisma.machine.findMany({
        include: {
          location: { select: { name: true } },
          executions: {
            where: { status: 'IN_PROGRESS' },
            include: {
              productionOrder: {
                include: {
                  bom: { include: { productVariant: { select: { name: true } } } },
                  shifts: {
                    include: {
                      operator: { select: { name: true } }
                    }
                  }
                }
              },
              operator: { select: { name: true } }
            },
            orderBy: { startTime: 'desc' },
            take: 1
          }
        },
        orderBy: { code: 'asc' }
      });

      const machineIds = machinesRaw.map((m) => m.id);

      // Batch: last hour output per machine + assigned IN_PROGRESS orders + last completed exec endTime
      const [machineLastHourExecs, assignedOrdersAll, lastExecsAll] = await Promise.all([
        prisma.productionExecution.findMany({
          where: { status: { not: 'VOIDED' }, startTime: { gte: oneHourAgo } },
          select: { machineId: true, quantityProduced: true }
        }),
        prisma.productionOrder.findMany({
          where: { machineId: { in: machineIds }, status: 'IN_PROGRESS' },
          include: {
            bom: { include: { productVariant: { select: { name: true } } } },
            shifts: { include: { operator: { select: { name: true } } } }
          }
        }),
        prisma.productionExecution.findMany({
          where: { machineId: { in: machineIds }, status: 'COMPLETED', endTime: { not: null } },
          select: { machineId: true, endTime: true },
          orderBy: { endTime: 'desc' }
        })
      ]);

      // Map assigned order by machineId (first)
      const assignedByMachine = new Map<string, (typeof assignedOrdersAll)[number]>();
      for (const o of assignedOrdersAll) {
        if (!assignedByMachine.has(o.machineId!)) assignedByMachine.set(o.machineId!, o);
      }

      // Map output this hour by machineId
      const outputHourByMachine = new Map<string, number>();
      for (const e of machineLastHourExecs) {
        if (!e.machineId) continue;
        outputHourByMachine.set(e.machineId, (outputHourByMachine.get(e.machineId) || 0) + Number(e.quantityProduced || 0));
      }

      // Map last completed endTime by machineId (first = latest due to desc)
      const lastEndByMachine = new Map<string, Date>();
      for (const e of lastExecsAll) {
        if (!e.machineId) continue;
        if (!lastEndByMachine.has(e.machineId) && e.endTime) lastEndByMachine.set(e.machineId, e.endTime);
      }

      const machines = machinesRaw.map((m) => {
        const activeExec = m.executions[0];
        const activeOrder = activeExec?.productionOrder;
        const live = m.status === 'ACTIVE' && !!activeExec;

        let productName: string | undefined = activeOrder?.bom.productVariant.name;
        let operatorName: string | undefined = activeExec?.operator?.name || activeOrder?.shifts?.[0]?.operator?.name;

        if (!live) {
          const assignedOrder = assignedByMachine.get(m.id);
          if (assignedOrder) {
            productName = assignedOrder.bom.productVariant.name;
            operatorName = assignedOrder.shifts?.[0]?.operator?.name;
          }
        }

        const outputThisHour = outputHourByMachine.get(m.id) || 0;

        let idleMinutes = 0;
        if (!live) {
          const lastEnd = lastEndByMachine.get(m.id);
          if (lastEnd) {
            idleMinutes = Math.max(0, Math.floor((now.getTime() - lastEnd.getTime()) / 60000));
          } else {
            idleMinutes = Math.max(0, Math.floor((now.getTime() - m.createdAt.getTime()) / 60000));
          }
        }

        return {
          id: m.id,
          code: m.code,
          status: m.status,
          locationName: m.location.name,
          live,
          productName,
          operatorName,
          outputThisHour,
          idleMinutes
        };
      });

      // --- 10. Running Orders (SPK Berjalan) ---
      const runningOrdersRaw = await prisma.productionOrder.findMany({
        where: { status: 'IN_PROGRESS' },
        include: {
          bom: { include: { productVariant: { select: { name: true } } } },
          machine: { select: { code: true } },
          shifts: {
            include: { operator: { select: { name: true } } }
          },
          executions: {
            where: { status: { not: 'VOIDED' } },
            select: { quantityProduced: true, scrapQuantity: true, startTime: true }
          }
        }
      });

      const runningOrders = runningOrdersRaw.map((o) => {
        const plannedQty = Number(o.plannedQuantity || 0);
        const actualQty = o.executions.reduce((sum, e) => sum + Number(e.quantityProduced || 0), 0);
        const progress = plannedQty > 0 ? (actualQty / plannedQty) * 100 : 0;
        const isLate = o.plannedEndDate ? o.plannedEndDate < now : false;

        // Calculate startedAt
        const startTimes = o.executions.map(e => e.startTime.getTime());
        const startedAt = o.actualStartDate || (startTimes.length > 0 ? new Date(Math.min(...startTimes)) : o.createdAt);

        // Estimate completion
        let estimatedDoneAt: Date | null = null;
        if (actualQty > 0) {
          const elapsedMs = now.getTime() - startedAt.getTime();
          if (elapsedMs > 0) {
            const qtyPerMs = actualQty / elapsedMs;
            const remainingQty = Math.max(0, plannedQty - actualQty);
            if (qtyPerMs > 0) {
              const remainingMs = remainingQty / qtyPerMs;
              estimatedDoneAt = new Date(now.getTime() + remainingMs);
            }
          }
        }
        if (!estimatedDoneAt) {
          estimatedDoneAt = o.plannedEndDate;
        }

        const operatorName = o.shifts?.[0]?.operator?.name || 'Unassigned';

        return {
          id: o.id,
          orderNumber: o.orderNumber,
          productName: o.bom.productVariant.name,
          machineCode: o.machine?.code || 'N/A',
          operatorName,
          plannedQty,
          actualQty,
          progress,
          isLate,
          startedAt,
          estimatedDoneAt
        };
      });

      // Sort: Late/At-risk top
      runningOrders.sort((a, b) => {
        if (a.isLate && !b.isLate) return -1;
        if (!a.isLate && b.isLate) return 1;
        return b.progress - a.progress; // higher progress first if same late status
      });

      // --- 11. Attention Feed ---
      interface AttentionItem {
        type: 'downtime' | 'waiting_material' | 'issue' | 'no_operator' | 'late' | 'high_scrap';
        severity: 'red' | 'amber';
        title: string;
        subtitle: string;
        orderId?: string;
        machineId?: string;
        ageMinutes: number;
      }

      const attentions: AttentionItem[] = [];

      // A: Machine Downtime — show all, red if >30m, amber if 0-30m
      const openDowntimes = await prisma.machineDowntime.findMany({
        where: { endTime: null },
        include: { machine: { select: { code: true } } }
      });
      for (const d of openDowntimes) {
        const age = Math.floor((now.getTime() - d.startTime.getTime()) / 60000);
        attentions.push({
          type: 'downtime',
          severity: age > 30 ? 'red' : 'amber',
          title: `Mesin ${d.machine.code} Downtime`,
          subtitle: `${d.reason} (Sejak ${formatWIB(d.startTime, 'HH:mm')})`,
          machineId: d.machineId,
          ageMinutes: age
        });
      }

      // B: Production Issues (status = OPEN)
      const openIssues = await prisma.productionIssue.findMany({
        where: { status: 'OPEN' },
        include: { productionOrder: { select: { orderNumber: true } } }
      });
      for (const iss of openIssues) {
        const age = Math.floor((now.getTime() - iss.reportedAt.getTime()) / 60000);
        attentions.push({
          type: 'issue',
          severity: 'red',
          title: `Isu SPK #${iss.productionOrder.orderNumber}`,
          subtitle: `${iss.description}`,
          orderId: iss.productionOrderId,
          ageMinutes: age
        });
      }

      // C: High Scrap (>5%)
      for (const order of runningOrdersRaw) {
        const totalProduced = order.executions.reduce((sum, e) => sum + Number(e.quantityProduced || 0), 0);
        const totalScrap = order.executions.reduce((sum, e) => sum + Number(e.scrapQuantity || 0), 0);
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
              ageMinutes: 0
            });
          }
        }
      }

      // D: Production Order status WAITING_MATERIAL
      const waitingMaterialOrders = await prisma.productionOrder.findMany({
        where: { status: 'WAITING_MATERIAL' },
        select: { id: true, orderNumber: true, createdAt: true }
      });
      for (const wo of waitingMaterialOrders) {
        const age = Math.floor((now.getTime() - wo.createdAt.getTime()) / 60000);
        attentions.push({
          type: 'waiting_material',
          severity: 'amber',
          title: `SPK #${wo.orderNumber} Tunggu Material`,
          subtitle: 'Menunggu rilis bahan baku ke lini produksi',
          orderId: wo.id,
          ageMinutes: age
        });
      }

      // E: Running order without operator
      for (const order of runningOrdersRaw) {
        const activeShift = order.shifts?.[0];
        if (!activeShift || !activeShift.operatorId) {
          const age = Math.floor((now.getTime() - order.createdAt.getTime()) / 60000);
          attentions.push({
            type: 'no_operator',
            severity: 'amber',
            title: `SPK #${order.orderNumber} Tanpa Operator`,
            subtitle: 'Shift berjalan aktif tetapi belum ditugaskan operator',
            orderId: order.id,
            ageMinutes: age
          });
        }
      }

      // F: Late SPK
      for (const o of runningOrders) {
        if (o.isLate) {
          const age = Math.floor((now.getTime() - (o.estimatedDoneAt?.getTime() || now.getTime())) / 60000);
          attentions.push({
            type: 'late',
            severity: 'amber',
            title: `SPK #${o.orderNumber} Terlambat`,
            subtitle: `Target selesai terlewati. Est: ${o.estimatedDoneAt ? formatWIB(o.estimatedDoneAt, 'dd MMM HH:mm') : '-'}`,
            orderId: o.id,
            ageMinutes: Math.max(0, age)
          });
        }
      }

      // Sort: red first, then amber, then highest age/severity
      attentions.sort((a, b) => {
        if (a.severity === 'red' && b.severity === 'amber') return -1;
        if (a.severity === 'amber' && b.severity === 'red') return 1;
        return b.ageMinutes - a.ageMinutes;
      });

      // --- 12. Shift Performance Today ---
      // Fetch DB WorkShift configuration
      const workShiftsDb = await prisma.workShift.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { startTime: 'asc' }
      });

      // Define default shifts if DB doesn't have active ones
      const shiftConfig = workShiftsDb.length > 0 ? workShiftsDb.map(s => ({
        name: s.name,
        startTime: s.startTime, // "07:00"
        endTime: s.endTime       // "15:00"
      })) : [
        { name: 'Pagi', startTime: '07:00', endTime: '15:00' },
        { name: 'Siang', startTime: '15:00', endTime: '23:00' },
        { name: 'Malam', startTime: '23:00', endTime: '07:00' }
      ];

      // Group executions into today's shifts
      // Helper function to check if a specific Date falls into a shift's time window today
      const shiftsToday = shiftConfig.map((sc) => {
        const filteredExecs = executionsToday.filter((exec) => {
          // Parse shift times in context of today
          const execTimeStr = formatWIB(exec.startTime, 'HH:mm');
          const [hStart, mStart] = sc.startTime.split(':').map(Number);
          const [hEnd, mEnd] = sc.endTime.split(':').map(Number);
          const [hExec, mExec] = execTimeStr.split(':').map(Number);

          const startMinutes = hStart * 60 + mStart;
          const endMinutes = hEnd * 60 + mEnd;
          const execMinutes = hExec * 60 + mExec;

          if (startMinutes < endMinutes) {
            // Normal shift e.g. 07:00 - 15:00
            return execMinutes >= startMinutes && execMinutes < endMinutes;
          } else {
            // Overnight shift e.g. 23:00 - 07:00
            return execMinutes >= startMinutes || execMinutes < endMinutes;
          }
        });

        const output = filteredExecs.reduce((sum, e) => sum + Number(e.quantityProduced || 0), 0);
        const scrap = filteredExecs.reduce((sum, e) => sum + Number(e.scrapQuantity || 0), 0);
        const uniqueOperators = Array.from(new Set(filteredExecs.map(e => e.operator?.name).filter(Boolean)));

        return {
          name: sc.name,
          output,
          operators: uniqueOperators.length,
          scrap
        };
      });


      return serializeData({
        pulse: {
          outputToday,
          outputYesterday,
          targetToday,
          runRateLastHour,
          activeJobs,
          released,
          waiting,
          yieldToday,
          scrapToday,
          qcPassRateToday,
          downtimeOpenCount
        },
        hourly: hourlyData,
        machines,
        attentions: attentions.slice(0, 8),
        runningOrders,
        shiftsToday
      });
    });
  }
);
