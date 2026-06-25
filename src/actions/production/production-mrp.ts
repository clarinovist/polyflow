"use server";

import { withTenant } from "@/lib/core/tenant";
import { logger } from "@/lib/config/logger";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { requireAuth, requirePlanningRole } from "@/lib/tools/auth-checks";
import { serializeData } from "@/lib/utils/utils";
import { revalidatePath } from "next/cache";
import { ProductionService } from "@/services/production/production-service";
import { MrpService } from "@/services/production/mrp-service";

export const getBomWithInventory = withTenant(
  async function getBomWithInventory(
    bomId: string,
    sourceLocationId: string,
    plannedQuantity: number,
  ) {
    return safeAction(async () => {
      try {
        const result = await ProductionService.getBomWithInventory(
          bomId,
          sourceLocationId,
          plannedQuantity,
        );
        if (!result.ok) {
          throw new BusinessRuleError(result.error.message);
        }
        return result.value;
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to calculate BOM requirements", {
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError(
          "Failed to calculate material requirements. Please try again.",
        );
      }
    });
  },
);

export const createProductionFromSalesOrder = withTenant(
  async function createProductionFromSalesOrder(
    salesOrderId: string,
    productVariantId?: string,
    quantity?: number,
  ) {
    return safeAction(async () => {
      try {
        const session = await requirePlanningRole();

        if (productVariantId && quantity) {
          const result = await ProductionService.createOrderFromSales(
            salesOrderId,
            productVariantId,
            quantity,
          );
          revalidatePath("/production");
          revalidatePath("/sales");
          return serializeData(result);
        }

        const result = await MrpService.convertSoToPo(
          salesOrderId,
          session.user.id,
        );

        revalidatePath("/production");
        revalidatePath("/sales");
        return serializeData(result);
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to create WO from SO", {
          salesOrderId,
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError(
          "Failed to automatically trigger production order from Sales Order.",
        );
      }
    });
  },
);

export const simulateMrp = withTenant(async function simulateMrp(
  salesOrderId: string,
) {
  return safeAction(async () => {
    try {
      await requireAuth();

      const result =
        await MrpService.simulateMaterialRequirements(salesOrderId);
      return serializeData(result);
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      throw new BusinessRuleError(
        error instanceof Error ? error.message : "Failed to simulate MRP",
      );
    }
  });
});
