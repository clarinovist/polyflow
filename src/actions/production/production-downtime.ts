"use server";

import { withTenant } from "@/lib/core/tenant";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { requireAuth } from "@/lib/tools/auth-checks";
import {
  logMachineDowntimeSchema,
  LogMachineDowntimeValues,
} from "@/lib/schemas/production";
import { revalidatePath } from "next/cache";
import { ProductionService } from "@/services/production/production-service";

export const logMachineDowntime = withTenant(async function logMachineDowntime(
  data: LogMachineDowntimeValues,
) {
  return safeAction(async () => {
    const result = logMachineDowntimeSchema.safeParse(data);
    if (!result.success) {
      throw new BusinessRuleError(result.error.issues[0].message);
    }

    try {
      const session = await requireAuth();

      await ProductionService.recordDowntime(result.data);
      revalidatePath("/production");
      return null;
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      throw new BusinessRuleError(
        error instanceof Error ? error.message : "An unknown error occurred",
      );
    }
  });
});
