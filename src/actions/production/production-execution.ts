"use server";

import { withTenant } from "@/lib/core/tenant";
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

export const startExecution = withTenant(async function startExecution(
  data: StartExecutionValues,
) {
  return safeAction(async () => {
    const result = startExecutionSchema.safeParse(data);
    if (!result.success) {
      throw new BusinessRuleError(result.error.issues[0].message);
    }

    try {
      const session = await requireAuth();

      const execution = await ProductionService.startExecution(result.data);

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
      const session = await requireAuth();

      const execution = await ProductionService.stopExecution({
        ...result.data,
        userId: session.user.id,
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
      const session = await requireAuth();

      await ProductionService.logRunningOutput({
        ...result.data,
        userId: session.user.id,
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
