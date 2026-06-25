"use server";

import { withTenant } from "@/lib/core/tenant";
import { logger } from "@/lib/config/logger";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { requireAuth } from "@/lib/tools/auth-checks";
import {
  materialIssueSchema,
  MaterialIssueValues,
  scrapRecordSchema,
  ScrapRecordValues,
  batchMaterialIssueSchema,
  BatchMaterialIssueValues,
} from "@/lib/schemas/production";
import { revalidatePath } from "next/cache";
import { ProductionService } from "@/services/production/production-service";

export const batchIssueMaterials = withTenant(
  async function batchIssueMaterials(data: BatchMaterialIssueValues) {
    return safeAction(async () => {
      const result = batchMaterialIssueSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      try {
        const session = await requireAuth();

        await ProductionService.batchIssueMaterials({
          ...result.data,
          userId: session?.user?.id,
        });

        revalidatePath(`/production/orders/${result.data.productionOrderId}`);
        return null;
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to batch issue materials", {
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError(
          "Failed to issue materials. Please try again.",
        );
      }
    });
  },
);

export const recordMaterialIssue = withTenant(
  async function recordMaterialIssue(data: MaterialIssueValues) {
    return safeAction(async () => {
      const result = materialIssueSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      try {
        const session = await requireAuth();

        await ProductionService.recordMaterialIssue({
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

export const deleteMaterialIssue = withTenant(
  async function deleteMaterialIssue(
    issueId: string,
    productionOrderId: string,
  ) {
    return safeAction(async () => {
      try {
        const session = await requireAuth();

        await ProductionService.deleteMaterialIssue(issueId, productionOrderId);

        revalidatePath(`/production/orders/${productionOrderId}`);
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

export const recordScrap = withTenant(async function recordScrap(
  data: ScrapRecordValues,
) {
  return safeAction(async () => {
    const result = scrapRecordSchema.safeParse(data);
    if (!result.success) {
      throw new BusinessRuleError(result.error.issues[0].message);
    }

    try {
      const session = await requireAuth();

      await ProductionService.recordScrap({
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
});

export const deleteScrap = withTenant(async function deleteScrap(
  scrapId: string,
  productionOrderId: string,
) {
  return safeAction(async () => {
    const session = await requireAuth();

    try {
      await ProductionService.deleteScrap(scrapId, productionOrderId);

      revalidatePath(`/production/orders/${productionOrderId}`);
      return null;
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      throw new BusinessRuleError(
        error instanceof Error ? error.message : "An unknown error occurred",
      );
    }
  });
});
