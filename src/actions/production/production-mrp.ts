"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { logger } from "@/lib/config/logger";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { requireAuth, requirePlanningRole } from "@/lib/tools/auth-checks";
import { serializeData } from "@/lib/utils/utils";
import { revalidatePath } from "next/cache";
import { ProductionService } from "@/services/production/production-service";
import { MrpService } from "@/services/production/mrp-service";
import {
  SalesOrderStatus,
  ReservationStatus,
  ReservationType,
} from "@prisma/client";

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

export const cancelOrderFromPlanning = withTenant(
  async function cancelOrderFromPlanning(salesOrderId: string) {
    return safeAction(async () => {
      try {
        await requirePlanningRole();

        // Verify order exists and is cancellable
        const order = await prisma.salesOrder.findUnique({
          where: { id: salesOrderId },
          include: { productionOrders: true },
        });

        if (!order) {
          throw new BusinessRuleError("Order tidak ditemukan");
        }

        if (order.productionOrders.length > 0) {
          throw new BusinessRuleError(
            "Cannot cancel order with existing production orders",
          );
        }

        if (
          order.status !== SalesOrderStatus.CONFIRMED &&
          order.status !== SalesOrderStatus.IN_PRODUCTION
        ) {
          throw new BusinessRuleError("Order tidak dalam status yang dapat dibatalkan");
        }

        // Cancel stock reservations and update status
        await prisma.$transaction(async (tx) => {
          await tx.stockReservation.updateMany({
            where: {
              referenceId: order.id,
              reservedFor: ReservationType.SALES_ORDER,
              status: ReservationStatus.ACTIVE,
            },
            data: { status: ReservationStatus.CANCELLED },
          });

          await tx.salesOrder.update({
            where: { id: salesOrderId },
            data: { status: SalesOrderStatus.CANCELLED },
          });
        });

        revalidatePath("/production/requests");
        revalidatePath("/sales");
        return true;
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to cancel order from planning", {
          salesOrderId,
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError("Gagal membatalkan order. Coba lagi.");
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
