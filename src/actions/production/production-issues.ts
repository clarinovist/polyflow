"use server";

import { withTenant } from "@/lib/core/tenant";
import { logger } from "@/lib/config/logger";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { requireAuth } from "@/lib/tools/auth-checks";
import { serializeData } from "@/lib/utils/utils";
import { revalidatePath } from "next/cache";
import { ProductionService } from "@/services/production/production-service";

export const createProductionIssue = withTenant(
  async function createProductionIssue(data: {
    productionOrderId: string;
    category:
      | "MACHINE_BREAKDOWN"
      | "MATERIAL_DEFECT"
      | "QUALITY_ISSUE"
      | "OPERATOR_ERROR"
      | "OTHER";
    description: string;
  }) {
    return safeAction(async () => {
      try {
        const session = await requireAuth();

        const issue = await ProductionService.createIssue({
          ...data,
          reportedById: session.user.id,
        });

        revalidatePath(`/production/orders/${data.productionOrderId}`);
        return serializeData(issue);
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to create production issue", {
          productionOrderId: data.productionOrderId,
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError("Gagal membuat masalah produksi.");
      }
    });
  },
);

export const updateProductionIssueStatus = withTenant(
  async function updateProductionIssueStatus(
    issueId: string,
    status: "OPEN" | "IN_PROGRESS" | "RESOLVED",
    resolvedNotes?: string,
    productionOrderId?: string,
  ) {
    return safeAction(async () => {
      try {
        await requireAuth();

        const issue = await ProductionService.updateIssueStatus(
          issueId,
          status,
          resolvedNotes,
        );

        if (productionOrderId) {
          revalidatePath(`/production/orders/${productionOrderId}`);
        }

        return serializeData(issue);
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to update production issue status", {
          issueId,
          status,
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError("Gagal memperbarui status masalah.");
      }
    });
  },
);

export const deleteProductionIssue = withTenant(
  async function deleteProductionIssue(
    issueId: string,
    productionOrderId: string,
  ) {
    return safeAction(async () => {
      try {
        await requireAuth();

        await ProductionService.deleteIssue(issueId);

        revalidatePath(`/production/orders/${productionOrderId}`);
        return null;
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to delete production issue", {
          issueId,
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError("Gagal menghapus masalah.");
      }
    });
  },
);
