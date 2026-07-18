"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma as db } from "@/lib/core/prisma";
import { AssetFormValues, assetSchema } from "@/lib/schemas/finance";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/config/logger";
import {
  safeAction,
  BusinessRuleError,
  ValidationError,
} from "@/lib/errors/errors";
import { requireAuth } from "@/lib/tools/auth-checks";
import { FixedAssetService } from "@/services/finance/fixed-asset-service";

export const getAssets = withTenant(async function getAssets() {
  return safeAction(async () => {
    await requireAuth();
    try {
      const assets = await db.fixedAsset.findMany({
        include: {
          assetAccount: true,
          accumDepreciationAccount: true,
          depreciationExpenseAccount: true,
          location: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Resolve source PO/GR numbers in a single batched lookup each.
      // FixedAsset stores purchaseOrderId/goodsReceiptId as scalars (no relation),
      // so we map ids -> human-readable numbers here for display/traceability.
      const poIds = [
        ...new Set(assets.map((a) => a.purchaseOrderId).filter(Boolean) as string[]),
      ];
      const grIds = [
        ...new Set(assets.map((a) => a.goodsReceiptId).filter(Boolean) as string[]),
      ];

      const [pos, grs] = await Promise.all([
        poIds.length
          ? db.purchaseOrder.findMany({
              where: { id: { in: poIds } },
              select: { id: true, orderNumber: true },
            })
          : Promise.resolve([]),
        grIds.length
          ? db.goodsReceipt.findMany({
              where: { id: { in: grIds } },
              select: { id: true, receiptNumber: true },
            })
          : Promise.resolve([]),
      ]);

      const poMap = new Map(pos.map((p) => [p.id, p.orderNumber]));
      const grMap = new Map(grs.map((g) => [g.id, g.receiptNumber]));

      return assets.map((a) => ({
        ...a,
        purchaseValue: Number(a.purchaseValue),
        scrapValue: Number(a.scrapValue),
        purchaseOrderNumber: a.purchaseOrderId
          ? poMap.get(a.purchaseOrderId) ?? null
          : null,
        goodsReceiptNumber: a.goodsReceiptId
          ? grMap.get(a.goodsReceiptId) ?? null
          : null,
        locationName: a.location?.name ?? null,
      }));
    } catch (error) {
      logger.error("Failed to fetch assets", { error, module: "AssetActions" });
      throw new BusinessRuleError(
        "Failed to fetch assets. Please try again later.",
      );
    }
  });
});

export const createAsset = withTenant(async function createAsset(
  data: AssetFormValues,
) {
  return safeAction(async () => {
    await requireAuth();
    try {
      const result = assetSchema.safeParse(data);
      if (!result.success) {
        throw new ValidationError(result.error.issues[0].message);
      }

      await db.fixedAsset.create({
        data: {
          ...result.data,
          status: "ACTIVE",
        },
      });

      revalidatePath("/finance/assets");
    } catch (error) {
      // Re-throw known errors
      if (error instanceof ValidationError) throw error;

      logger.error("Failed to create asset", { error, module: "AssetActions" });
      throw new BusinessRuleError(
        "Failed to create asset. Please verify details.",
      );
    }
  });
});

export const updateAsset = withTenant(async function updateAsset(
  id: string,
  data: Partial<AssetFormValues>,
) {
  return safeAction(async () => {
    await requireAuth();
    try {
      await db.fixedAsset.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      revalidatePath("/finance/assets");
    } catch (error) {
      logger.error("Failed to update asset", {
        error,
        assetId: id,
        module: "AssetActions",
      });
      throw new BusinessRuleError(
        "Failed to update asset. Please check input.",
      );
    }
  });
});

export const deleteAsset = withTenant(async function deleteAsset(id: string) {
  return safeAction(async () => {
    await requireAuth();
    try {
      await db.fixedAsset.delete({
        where: { id },
      });

      revalidatePath("/finance/assets");
    } catch (error) {
      logger.error("Failed to delete asset", {
        error,
        assetId: id,
        module: "AssetActions",
      });
      throw new BusinessRuleError("Failed to delete asset.");
    }
  });
});

export const runDepreciation = withTenant(async function runDepreciation() {
  return safeAction(async () => {
    const session = await requireAuth();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const results = await FixedAssetService.runDepreciation(
      year,
      month,
      session.user.id,
    );
    revalidatePath("/finance/assets");
    return {
      count: results.length,
      message: `Berhasil memproses depresiasi untuk ${results.length} aset.`,
    };
  });
});
