"use server";

import { withTenant } from "@/lib/core/tenant";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { serializeData } from "@/lib/utils/utils";
import {
  listFgDemandBoard,
  FgDemandFilters,
} from "@/services/production/fg-demand-service";
import { ProductionOrderService } from "@/services/production/order-service";
import { prisma } from "@/lib/core/prisma";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  requireProductionLeaderRole,
} from "@/lib/tools/auth-checks";

export const getFgDemandBoard = withTenant(
  async function getFgDemandBoard(filters?: FgDemandFilters) {
    return safeAction(async () => {
      await requireAuth();
      const rows = await listFgDemandBoard(filters);
      return serializeData(rows);
    });
  },
);

export const createSpkFromDemand = withTenant(
  async function createSpkFromDemand(data: {
    productVariantId: string;
    plannedQuantity: number;
    machineId?: string;
    locationId: string;
    priority?: "URGENT" | "NORMAL" | "LOW";
    notes?: string;
  }) {
    return safeAction(async () => {
      // PLANNING / PRODUCTION / ADMIN — same surface as floor leaders
      const session = await requireProductionLeaderRole();

      const {
        productVariantId,
        plannedQuantity,
        machineId,
        locationId,
        priority,
        notes,
      } = data;

      if (!productVariantId || plannedQuantity <= 0 || !locationId) {
        throw new BusinessRuleError(
          "Product variant, quantity > 0, and location are required.",
        );
      }

      // Find default BOM for this variant
      const bom = await prisma.bom.findFirst({
        where: {
          productVariantId,
          isDefault: true,
          isActive: true,
        },
        select: { id: true },
      });

      if (!bom) {
        throw new BusinessRuleError(
          "Tidak ada BOM default aktif untuk produk ini. Buat BOM terlebih dahulu.",
          { productVariantId },
          "MISSING_DEFAULT_BOM",
        );
      }

      const order = await ProductionOrderService.createOrder({
        bomId: bom.id,
        plannedQuantity,
        plannedStartDate: new Date(),
        locationId,
        machineId: machineId || undefined,
        priority: priority || "NORMAL",
        notes: notes || "Dari Papan Permintaan FG",
        isMaklon: false,
        estimatedConversionCost: 0,
        userId: session.user.id,
      });

      // Auto-release if created as DRAFT
      if (order.status === "DRAFT") {
        await prisma.productionOrder.update({
          where: { id: order.id },
          data: { status: "RELEASED" },
        });
      }

      revalidatePath("/production/requests");
      revalidatePath("/production/orders");

      return serializeData(order);
    });
  },
);
