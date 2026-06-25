"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { logger } from "@/lib/config/logger";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { requirePlanningRole } from "@/lib/tools/auth-checks";
import { serializeData } from "@/lib/utils/utils";
import { revalidatePath } from "next/cache";
import { createProductionOrderWithGeneratedNumber } from "@/services/production/order-number-service";

export const createChildProductionOrder = withTenant(
  async function createChildProductionOrder(
    parentOrderId: string,
    productVariantId: string,
    quantity: number,
  ) {
    return safeAction(async () => {
      try {
        await requirePlanningRole();

        const result = await prisma.$transaction(async (tx) => {
          const parentOrder = await tx.productionOrder.findUnique({
            where: { id: parentOrderId },
            select: { salesOrderId: true, locationId: true, status: true },
          });

          if (!parentOrder) throw new Error("Parent order not found");

          const bom = await tx.bom.findFirst({
            where: { productVariantId, isDefault: true },
          });

          if (!bom)
            throw new Error(
              "No default BOM found for this item. Please set a Primary Default Recipe first.",
            );

          const po = await createProductionOrderWithGeneratedNumber(
            tx,
            {
              salesOrder: parentOrder.salesOrderId
                ? { connect: { id: parentOrder.salesOrderId } }
                : undefined,
              bom: { connect: { id: bom.id } },
              plannedQuantity: quantity,
              status: "DRAFT",
              plannedStartDate: new Date(),
              location: { connect: { id: parentOrder.locationId } },
              parentOrder: { connect: { id: parentOrderId } },
              notes: `Sub-order for ${parentOrder.status} parent`,
            },
            {
              prefix: "SWO",
              productVariantId,
            },
          );

          const bomItems = await tx.bomItem.findMany({
            where: { bomId: bom.id },
          });

          const outputRatio = quantity / Number(bom.outputQuantity);

          await tx.productionMaterial.createMany({
            data: bomItems.map((bi) => ({
              productionOrderId: po.id,
              productVariantId: bi.productVariantId,
              quantity: Number(bi.quantity) * outputRatio,
            })),
          });

          return po;
        });

        revalidatePath(`/production/orders/${parentOrderId}`);
        revalidatePath("/production");
        return serializeData(result);
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to create child PO", {
          parentOrderId,
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError(
          "Failed to create sub-order. Please try again.",
        );
      }
    });
  },
);
