"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { auth } from "@/auth";
import { logger } from "@/lib/config/logger";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import {
  requireAuth,
  requireProductionLeaderRole,
} from "@/lib/tools/auth-checks";
import {
  startExecutionSchema,
  StartExecutionValues,
  stopExecutionSchema,
  StopExecutionValues,
  logRunningOutputSchema,
  LogRunningOutputValues,
  productionOutputSchema,
  ProductionOutputValues,
} from "@/lib/schemas/production";
import { serializeData } from "@/lib/utils/utils";
import { revalidatePath } from "next/cache";
import { ProductionService } from "@/services/production/production-service";
import { findActiveShift } from "@/services/production/shift-service";

export const startExecution = withTenant(async function startExecution(
  data: StartExecutionValues,
) {
  return safeAction(async () => {
    const result = startExecutionSchema.safeParse(data);
    if (!result.success) {
      throw new BusinessRuleError(result.error.issues[0].message);
    }

    try {
      // Try to get user session, but allow kiosk mode without auth
      try {
        await requireAuth();
      } catch {
        // Kiosk mode: no session required if operatorId is provided
        if (!result.data.operatorId) {
          throw new BusinessRuleError("Autentikasi diperlukan atau ID operator harus diisi");
        }
      }

      // Auto-detect active shift if not explicitly provided
      let shiftId = result.data.shiftId;
      let effectiveOperatorId = result.data.operatorId;
      if (!shiftId) {
        const activeShift = await findActiveShift({
          productionOrderId: result.data.productionOrderId,
          operatorId: result.data.operatorId,
        });
        if (activeShift) {
          shiftId = activeShift.id;
          if (activeShift.operatorId) {
            effectiveOperatorId = activeShift.operatorId;
          }
        }
      }

      const execution = await ProductionService.startExecution({
        ...result.data,
        operatorId: effectiveOperatorId,
        shiftId,
      });

      revalidatePath("/production");
      revalidatePath("/production/kiosk");
      revalidatePath("/kiosk", "layout");
      revalidatePath(`/kiosk/jobs/${result.data.productionOrderId}`);
      return serializeData(execution);
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      logger.error("Failed to start execution", {
        error,
        module: "ProductionActions",
      });
      throw new BusinessRuleError(
        "Failed to start execution. Please ensure the machine is available.",
      );
    }
  });
});

export const stopExecution = withTenant(async function stopExecution(
  data: StopExecutionValues,
) {
  return safeAction(async () => {
    const result = stopExecutionSchema.safeParse(data);
    if (!result.success) {
      throw new BusinessRuleError(result.error.issues[0].message);
    }

    try {
      // Try to get user session, but allow kiosk mode without auth
      let userId: string | undefined;
      try {
        const session = await requireAuth();
        userId = session.user.id;
      } catch {
        // Kiosk mode: no session required if operatorId is provided
        if (!result.data.operatorId) {
          throw new BusinessRuleError("Autentikasi diperlukan atau ID operator harus diisi");
        }
      }

      const execution = await ProductionService.stopExecution({
        ...result.data,
        userId,
      });

      revalidatePath("/production");
      revalidatePath("/production/kiosk");
      revalidatePath("/kiosk", "layout");
      return serializeData(execution);
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      logger.error("Failed to stop execution", {
        error,
        module: "ProductionActions",
      });
      throw new BusinessRuleError(
        "Failed to stop execution. Please try again.",
      );
    }
  });
});

export const addProductionOutput = withTenant(
  async function addProductionOutput(data: ProductionOutputValues) {
    return safeAction(async () => {
      const result = productionOutputSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      try {
        const session = await requireAuth();

        await ProductionService.addProductionOutput({
          ...result.data,
          userId: session?.user?.id,
        });
        revalidatePath("/production");
        revalidatePath(`/production/orders/${result.data.productionOrderId}`);
        return null;
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;

        // Catch Prisma foreign key constraint violation (P2003)
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2003"
        ) {
          const errMsg = "message" in error ? String(error.message) : "";
          if (errMsg.includes("ProductionExecution_shiftId_fkey")) {
            throw new BusinessRuleError(
              "Gagal menyimpan: Shift yang Anda pilih tidak valid untuk SPK ini. Harap pastikan Anda telah membuat/menambahkan Shift tersebut di dalam detail Surat Perintah Kerja (SPK) terlebih dahulu.",
            );
          }
          if (errMsg.includes("ProductionExecution_productionOrderId_fkey")) {
            throw new BusinessRuleError(
              "Gagal menyimpan: Surat Perintah Kerja (SPK) tidak ditemukan. Mungkin telah dihapus.",
            );
          }
          if (errMsg.includes("ProductionExecution_operatorId_fkey")) {
            throw new BusinessRuleError(
              "Gagal menyimpan: Operator yang dipilih tidak ditemukan atau sudah tidak aktif.",
            );
          }
          if (errMsg.includes("ProductionExecution_machineId_fkey")) {
            throw new BusinessRuleError(
              "Gagal menyimpan: Mesin yang dipilih tidak terdaftar atau sudah dinonaktifkan.",
            );
          }
        }

        throw new BusinessRuleError(
          error instanceof Error ? error.message : "An unknown error occurred",
        );
      }
    });
  },
);

export const logRunningOutput = withTenant(async function logRunningOutput(
  data: LogRunningOutputValues,
) {
  return safeAction(async () => {
    const result = logRunningOutputSchema.safeParse(data);
    if (!result.success) {
      throw new BusinessRuleError(result.error.issues[0].message);
    }

    try {
      // Try to get user session, but allow kiosk mode without auth
      let userId: string | undefined;
      try {
        const session = await requireAuth();
        userId = session.user.id;
      } catch {
        // Kiosk mode: no session required if operatorId is provided
        if (!result.data.operatorId) {
          throw new BusinessRuleError("Autentikasi diperlukan atau ID operator harus diisi");
        }
      }

      await ProductionService.logRunningOutput({
        ...result.data,
        userId,
      });

      revalidatePath("/production");
      revalidatePath("/production/kiosk");
      revalidatePath("/kiosk", "layout");
      return null;
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      logger.error("Failed to log production output", {
        error,
        module: "ProductionActions",
      });
      throw new BusinessRuleError(
        "Failed to log production output. Please verify input.",
      );
    }
  });
});

export const getActiveExecutions = withTenant(
  async function getActiveExecutions() {
    return safeAction(async () => {
      try {
        // Kiosk semi-public: allow tenant-scoped read without NextAuth session
        const executions = await ProductionService.getActiveExecutions();
        return serializeData(executions);
      } catch (error) {
        logger.error("Failed to get active executions", {
          error,
          module: "ProductionActions",
        });
        return [];
      }
    });
  },
);

export type ProductionHistoryFilter = {
  from?: string;           // YYYY-MM-DD (WIB business day start)
  to?: string;             // YYYY-MM-DD (WIB business day end)
  q?: string;              // orderNumber / product name / notes
  machineId?: string;      // filter by machine
  operatorId?: string;     // filter by operator (Employee id)
  shiftId?: string;        // filter by shift
  productVariantId?: string; // filter by product variant
  hasScrap?: boolean;      // only groups with scrap > 0
  missingPhoto?: boolean;  // only groups where photoCount === 0
  includeVoided?: boolean; // default false
  limit?: number;          // default 200, max 500
};

export type ProductionHistoryExecution = {
  id: string;
  quantityProduced: number;
  scrapQuantity: number;
  scrapDaunQty: number;
  scrapProngkolQty: number;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  photoUrl: string | null;
  status: string;
  enteredQuantity: number | null;
  enteredUnit: string | null;
  bruto: number | null;
  bobin: number | null;
  cekGram: string | null;
  operator: { name: string } | null;
  machine: { code: string } | null;
  shift: { shiftName: string; operator: { name: string } | null } | null;
  helpers: { name: string }[];
};

export type ProductionHistoryGroup = {
  productionOrder: {
    id: string;
    orderNumber: string;
    bom: {
      name: string;
      productVariant: { name: string; primaryUnit: string };
    };
  };
  executions: ProductionHistoryExecution[];
  totalQuantity: number;
  totalScrap: number;
  latestEndTime: Date | null;
  earliestEndTime: Date | null;
  machineCodes: string[];
  operatorNames: string[];
  shiftNames: string[];
  photoCount: number;
};

export type ProductionHistorySummary = {
  totalGood: number;
  totalScrap: number;
  executionCount: number;
  orderCount: number;
  missingPhotoCount: number;
  limit: number;
  isTruncated: boolean;
};

function getDefaultWibRange(): { start: Date; end: Date } {
  const todayStr = wibDateStringFromDate(new Date());
  const [yy, mm, dd] = todayStr.split('-').map(Number);
  const startMs = Date.UTC(yy, mm - 1, dd, 0, 0, 0, 0) - 7 * 60 * 60 * 1000;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { start: new Date(startMs), end: new Date(endMs) };
}

function wibDateStringFromDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function getWibDayBoundsFromStr(dateStr: string): { start: Date; end: Date } {
  let y: number, m: number, d: number;

  // Handle keywords "today", "yesterday"
  if (dateStr === 'today') {
    const todayStr = wibDateStringFromDate(new Date());
    [y, m, d] = todayStr.split('-').map(Number);
  } else if (dateStr === 'yesterday') {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = wibDateStringFromDate(yesterday);
    [y, m, d] = yesterdayStr.split('-').map(Number);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // YYYY-MM-DD directly = WIB date
    [y, m, d] = dateStr.split('-').map(Number);
  } else {
    // ISO string or other — convert to WIB date first
    try {
      const dt = new Date(dateStr);
      if (!isNaN(dt.getTime())) {
        const wibStr = wibDateStringFromDate(dt);
        [y, m, d] = wibStr.split('-').map(Number);
      } else {
        // fallback: slice first 10 chars
        const fallback = dateStr.slice(0, 10);
        [y, m, d] = fallback.split('-').map(Number);
      }
    } catch {
      const fallback = dateStr.slice(0, 10);
      [y, m, d] = fallback.split('-').map(Number);
    }
  }

  // Guard against NaN
  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    // fallback to today
    const todayStr = wibDateStringFromDate(new Date());
    [y, m, d] = todayStr.split('-').map(Number);
  }

  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 7 * 60 * 60 * 1000;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { start: new Date(startMs), end: new Date(endMs) };
}

export const getProductionHistory = withTenant(
  async function getProductionHistory(filter?: ProductionHistoryFilter) {
    return safeAction(async () => {
      const session = await auth();
      if (!session?.user) return { groups: [], summary: { totalGood: 0, totalScrap: 0, executionCount: 0, orderCount: 0, missingPhotoCount: 0 } };

      // Determine time bounds
      let timeFilter: { gte: Date; lte: Date };
      if (filter?.from || filter?.to) {
        const startBound = filter.from ? getWibDayBoundsFromStr(filter.from).start : getWibDayBoundsFromStr('2020-01-01').start;
        const endBound = filter.to ? getWibDayBoundsFromStr(filter.to).end : new Date();
        timeFilter = { gte: startBound, lte: endBound };
      } else {
        // Default: hari ini WIB
        const { start, end } = getDefaultWibRange();
        timeFilter = { gte: start, lte: end };
      }

      const limit = Math.min(filter?.limit ?? 200, 500);

      // Build where clause
      const where: Record<string, unknown> = {
        endTime: { not: null, gte: timeFilter.gte, lte: timeFilter.lte },
      };

      if (!filter?.includeVoided) {
        where.status = { not: 'VOIDED' };
      }

      if (filter?.hasScrap) {
        where.scrapQuantity = { gt: 0 };
      }

      if (filter?.missingPhoto) {
        where.OR = [
          { photoUrl: null },
          { photoUrl: '' },
        ];
      }

      // Phase B: relation-based filters
      if (filter?.machineId) {
        where.machineId = filter.machineId;
      }
      if (filter?.operatorId) {
        where.operatorId = filter.operatorId;
      }
      if (filter?.shiftId) {
        where.shiftId = filter.shiftId;
      }
      if (filter?.productVariantId) {
        where.productionOrder = {
          bom: {
            productVariantId: filter.productVariantId,
          },
        };
      }

      const completions = await prisma.productionExecution.findMany({
        where,
        include: {
          productionOrder: {
            include: {
              bom: {
                include: { productVariant: true },
              },
            },
          },
          operator: true,
          machine: true,
          shift: { include: { operator: true } },
          helpers: true,
        },
        orderBy: { endTime: "desc" },
        take: limit,
      });

      // Text search filter (post-query, since it spans relations)
      let filtered = completions;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        filtered = completions.filter(exec => {
          const orderNum = exec.productionOrder.orderNumber.toLowerCase();
          const prodName = exec.productionOrder.bom.productVariant.name.toLowerCase();
          const bomName = exec.productionOrder.bom.name.toLowerCase();
          const notes = exec.notes?.toLowerCase() || '';
          return orderNum.includes(q) || prodName.includes(q) || bomName.includes(q) || notes.includes(q);
        });
      }

      // Group executions by productionOrderId
      const groupedMap = new Map<string, ProductionHistoryGroup>();

      for (const exec of filtered) {
        const orderId = exec.productionOrderId;
        if (!groupedMap.has(orderId)) {
          groupedMap.set(orderId, {
            productionOrder: exec.productionOrder,
            executions: [],
            totalQuantity: 0,
            totalScrap: 0,
            latestEndTime: null,
            earliestEndTime: null,
            machineCodes: [],
            operatorNames: [],
            shiftNames: [],
            photoCount: 0,
          });
        }
        const group = groupedMap.get(orderId)!;
        group.executions.push({
          id: exec.id,
          quantityProduced: Number(exec.quantityProduced || 0),
          scrapQuantity: Number(exec.scrapQuantity || 0),
          scrapDaunQty: Number(exec.scrapDaunQty || 0),
          scrapProngkolQty: Number(exec.scrapProngkolQty || 0),
          startTime: exec.startTime?.toISOString() || null,
          endTime: exec.endTime?.toISOString() || null,
          notes: exec.notes,
          photoUrl: exec.photoUrl,
          status: exec.status,
          enteredQuantity: exec.enteredQuantity ? Number(exec.enteredQuantity) : null,
          enteredUnit: exec.enteredUnit || null,
          bruto: exec.bruto ? Number(exec.bruto) : null,
          bobin: exec.bobin ? Number(exec.bobin) : null,
          cekGram: exec.cekGram || null,
          operator: exec.operator ? { name: exec.operator.name } : null,
          machine: exec.machine ? { code: exec.machine.code } : null,
          shift: exec.shift ? { shiftName: exec.shift.shiftName, operator: exec.shift.operator ? { name: exec.shift.operator.name } : null } : null,
          helpers: exec.helpers.map(h => ({ name: h.name })),
        });
        group.totalQuantity += Number(exec.quantityProduced || 0);
        group.totalScrap += Number(exec.scrapQuantity || 0);

        if (exec.endTime) {
          if (!group.latestEndTime || exec.endTime > group.latestEndTime) {
            group.latestEndTime = exec.endTime;
          }
          if (!group.earliestEndTime || exec.endTime < group.earliestEndTime) {
            group.earliestEndTime = exec.endTime;
          }
        }

        if (exec.machine?.code && !group.machineCodes.includes(exec.machine.code)) {
          group.machineCodes.push(exec.machine.code);
        }
        const execOperatorName = exec.shift?.operator?.name || exec.operator?.name;
        if (execOperatorName && !group.operatorNames.includes(execOperatorName)) {
          group.operatorNames.push(execOperatorName);
        }
        if (exec.shift?.shiftName && !group.shiftNames.includes(exec.shift.shiftName)) {
          group.shiftNames.push(exec.shift.shiftName);
        }
        if (exec.photoUrl) {
          group.photoCount++;
        }
      }

      // Sort by latest endTime desc
      const groups = Array.from(groupedMap.values()).sort((a, b) => {
        if (!a.latestEndTime) return 1;
        if (!b.latestEndTime) return -1;
        return b.latestEndTime.getTime() - a.latestEndTime.getTime();
      });

      // Compute summary from result set
      const summary: ProductionHistorySummary = {
        totalGood: groups.reduce((sum, g) => sum + g.totalQuantity, 0),
        totalScrap: groups.reduce((sum, g) => sum + g.totalScrap, 0),
        executionCount: groups.reduce((sum, g) => sum + g.executions.length, 0),
        orderCount: groups.length,
        missingPhotoCount: groups.filter(g => g.photoCount === 0).length,
        limit,
        isTruncated: completions.length >= limit,
      };

      return serializeData({ groups, summary });
    });
  },
);

export const getProductionHistoryFilterOptions = withTenant(
  async function getProductionHistoryFilterOptions() {
    return safeAction(async () => {
      const session = await auth();
      if (!session?.user) return { machines: [], operators: [], shifts: [], products: [] };

      const [machines, operators, shifts, products] = await Promise.all([
        prisma.machine.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, code: true, name: true },
          orderBy: { code: 'asc' },
        }),
        prisma.employee.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        prisma.productionShift.findMany({
          select: { id: true, shiftName: true },
          orderBy: { shiftName: 'asc' },
        }),
        prisma.productVariant.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);

      return serializeData({ machines, operators, shifts, products });
    });
  },
);

export const voidProductionOutput = withTenant(
  async function voidProductionOutput(
    executionId: string,
    productionOrderId: string,
  ) {
    return safeAction(async () => {
      try {
        const session = await requireProductionLeaderRole();

        await ProductionService.voidExecution(executionId, session.user.id);

        revalidatePath(`/production/orders/${productionOrderId}`);
        revalidatePath("/production/history");
        revalidatePath("/dashboard");
        return null;
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to void production output", {
          executionId,
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError(
          "Failed to void production output. Please ensure you have sufficient permissions.",
        );
      }
    });
  },
);
