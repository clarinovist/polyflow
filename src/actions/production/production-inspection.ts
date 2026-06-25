"use server";

import { withTenant } from "@/lib/core/tenant";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { requireAuth } from "@/lib/tools/auth-checks";
import {
  qualityInspectionSchema,
  QualityInspectionValues,
} from "@/lib/schemas/production";
import { revalidatePath } from "next/cache";
import { ProductionService } from "@/services/production/production-service";

export const recordQualityInspection = withTenant(
  async function recordQualityInspection(data: QualityInspectionValues) {
    return safeAction(async () => {
      const result = qualityInspectionSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      try {
        const session = await requireAuth();

        await ProductionService.recordQualityInspection({
          ...result.data,
          userId: session?.user?.id,
        });
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
