"use server";

import { withTenant } from "@/lib/core/tenant";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { revalidatePath } from "next/cache";
import { ProductionService } from "@/services/production/production-service";

export const addProductionShift = withTenant(
  async function addProductionShift(data: {
    productionOrderId: string;
    shiftName: string;
    startTime: Date;
    endTime: Date;
    operatorId?: string;
    helperIds?: string[];
    machineId?: string;
  }) {
    return safeAction(async () => {
      try {
        await ProductionService.addShift(data);
        revalidatePath(`/production/orders/${data.productionOrderId}`);
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

export const deleteProductionShift = withTenant(
  async function deleteProductionShift(shiftId: string, orderId: string) {
    return safeAction(async () => {
      try {
        await ProductionService.deleteShift(shiftId);
        revalidatePath(`/production/orders/${orderId}`);
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
