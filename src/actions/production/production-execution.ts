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
          throw new BusinessRuleError("Authentication required or operator ID must be provided");
        }
      }

      // Auto-detect active shift if not explicitly provided
      let shiftId = result.data.shiftId;
      if (!shiftId && result.data.operatorId) {
        shiftId = await findActiveShift({
          productionOrderId: result.data.productionOrderId,
          operatorId: result.data.operatorId,
        }) ?? undefined;
      }

      const execution = await ProductionService.startExecution({
        ...result.data,
        shiftId,
      });

      revalidatePath("/production");
      revalidatePath("/production/kiosk");
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
          throw new BusinessRuleError("Authentication required or operator ID must be provided");
        }
      }

      const execution = await ProductionService.stopExecution({
        ...result.data,
        userId,
      });

      revalidatePath("/production");
      revalidatePath("/production/kiosk");
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
          throw new BusinessRuleError("Authentication required or operator ID must be provided");
        }
      }

      await ProductionService.logRunningOutput({
        ...result.data,
        userId,
      });

      revalidatePath("/production");
      revalidatePath("/production/kiosk");
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
        const session = await auth();
        if (!session?.user) return [];

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

export const getProductionHistory = withTenant(
  async function getProductionHistory() {
    return safeAction(async () => {
      const session = await auth();
      if (!session?.user) return [];

      // Get all completed executions (not voided), more than before
      const completions = await prisma.productionExecution.findMany({
        where: {
          endTime: { not: null },
          status: { not: 'VOIDED' },
        },
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
          shift: true,
        },
        orderBy: { endTime: "desc" },
        take: 200, // More records since we now have multiple per SPK
      });

      // Group executions by productionOrderId
      const groupedMap = new Map<string, {
        productionOrder: typeof completions[0]['productionOrder'];
        executions: typeof completions;
        totalQuantity: number;
        totalScrap: number;
        latestEndTime: Date | null;
      }>();

      for (const exec of completions) {
        const orderId = exec.productionOrderId;
        if (!groupedMap.has(orderId)) {
          groupedMap.set(orderId, {
            productionOrder: exec.productionOrder,
            executions: [],
            totalQuantity: 0,
            totalScrap: 0,
            latestEndTime: null,
          });
        }
        const group = groupedMap.get(orderId)!;
        group.executions.push(exec);
        group.totalQuantity += Number(exec.quantityProduced || 0);
        group.totalScrap += Number(exec.scrapQuantity || 0);
        // Track latest endTime for sorting
        if (exec.endTime && (!group.latestEndTime || exec.endTime > group.latestEndTime)) {
          group.latestEndTime = exec.endTime;
        }
      }

      // Convert to array and sort by latest endTime
      const grouped = Array.from(groupedMap.values()).sort((a, b) => {
        if (!a.latestEndTime) return 1;
        if (!b.latestEndTime) return -1;
        return b.latestEndTime.getTime() - a.latestEndTime.getTime();
      });

      return serializeData(grouped);
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
