"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import {
  Inventory,
  CostHistory,
  ProductVariant,
  ProductType,
  Unit,
  Prisma,
} from "@prisma/client";
import { serializeData } from "@/lib/utils/utils";
import { requireAuth } from "@/lib/tools/auth-checks";
import { safeAction } from "@/lib/errors/errors";
import {
  getCurrentUnitCost,
  getVariantCostDiagnostics,
  type VariantCostDiagnostics,
} from "@/lib/utils/current-cost";

export type ProductWithVariantsAndStock = {
  id: string;
  name: string;
  productType: ProductType;
  createdAt: Date;
  updatedAt: Date;
  variants: {
    id: string;
    name: string;
    skuCode: string;
    primaryUnit: Unit;
    salesUnit: Unit | null;
    conversionFactor: Prisma.Decimal;
    price: Prisma.Decimal | null;
    standardCost: Prisma.Decimal | null;
    buyPrice: Prisma.Decimal | null;
    minStockAlert: Prisma.Decimal | null;
    currentCost?: number;
    currentStockValue?: number;
    _count: {
      inventories: number;
    };
    stock?: number;
  }[];
  totalStock?: number;
};

type InventoryWithLocation = Inventory & {
  location: { name: string };
};

type CostDiagnosticsSnapshot = VariantCostDiagnostics & {
  inventoryCount: number;
};

type CostHistoryWithCreatedBy = CostHistory & {
  createdBy: { name: string };
};

type ProductVariantWithRelations = ProductVariant & {
  inventories: InventoryWithLocation[];
  costHistory: CostHistoryWithCreatedBy[];
};

function buildCostDiagnosticsSnapshot(
  variant: {
    inventories?: Array<{ quantity?: unknown; averageCost?: unknown }>;
  } & Record<string, unknown>,
): CostDiagnosticsSnapshot {
  const diagnostics = getVariantCostDiagnostics(variant);

  return {
    ...diagnostics,
    inventoryCount: (variant.inventories || []).length,
  };
}

export const getProducts = withTenant(async function getProducts(options?: {
  type?: ProductType;
}) {
  return safeAction(async () => {
    await requireAuth();
    const where: Prisma.ProductWhereInput = {};

    if (options?.type) {
      where.productType = options.type;
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        variants: {
          include: {
            _count: {
              select: {
                inventories: true,
              },
            },
            inventories: {
              select: {
                quantity: true,
                averageCost: true,
              },
            },
          },
          orderBy: {
            name: "asc",
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return products.map((product) => {
      let productTotalStock = 0;

      const variantsArray = product.variants || [];

      const cleanedVariants = variantsArray.map((variant) => {
        const invs = variant.inventories || [];
        const variantStock = invs.reduce((vSum, inv) => {
          return (
            vSum +
            (inv.quantity?.toNumber
              ? inv.quantity.toNumber()
              : Number(inv.quantity || 0))
          );
        }, 0);
        const variantStockValue = invs.reduce((vSum, inv) => {
          const quantity = inv.quantity?.toNumber
            ? inv.quantity.toNumber()
            : Number(inv.quantity || 0);
          const averageCost = inv.averageCost?.toNumber
            ? inv.averageCost.toNumber()
            : Number(inv.averageCost || 0);
          return vSum + quantity * averageCost;
        }, 0);
        const currentCost = getCurrentUnitCost(variant);

        productTotalStock += variantStock;

        const { inventories: _, ...variantData } = variant;

        return {
          ...variantData,
          stock: variantStock,
          currentCost,
          currentStockValue: variantStock > 0 ? variantStockValue : 0,
        };
      });

      return {
        ...product,
        variants: cleanedVariants,
        totalStock: productTotalStock,
      };
    });
  });
});

export const getProductById = withTenant(async function getProductById(
  id: string,
) {
  return safeAction(async () => {
    await requireAuth();
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            inventories: {
              select: {
                quantity: true,
                averageCost: true,
                location: {
                  select: { name: true },
                },
              },
            },
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - costHistory is not directly on ProductVariant type, but we are including it.
            costHistory: {
              take: 10,
              orderBy: { createdAt: "desc" },
              include: {
                createdBy: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: {
            name: "asc",
          },
        },
      },
    });

    if (!product) {
      return null;
    }

    const enrichedVariants = (
      product.variants || ([] as ProductVariantWithRelations[])
    ).map((variant) => {
      const invs = variant.inventories || [];
      const stock = invs.reduce(
        (sum: number, inv) => sum + Number(inv.quantity),
        0,
      );
      const stockValue = invs.reduce(
        (sum: number, inv) =>
          sum + Number(inv.quantity) * Number(inv.averageCost || 0),
        0,
      );
      const costDiagnostics = buildCostDiagnosticsSnapshot(variant);
      return {
        ...variant,
        stock,
        currentCost: getCurrentUnitCost(variant),
        currentStockValue: stock > 0 ? stockValue : 0,
        costDiagnostics,
      };
    });

    return serializeData({
      ...product,
      variants: enrichedVariants,
    });
  });
});

export const getUnits = withTenant(async function getUnits(): Promise<{
  success: boolean;
  data?: Unit[];
  error?: string;
}> {
  return safeAction(async () => {
    await requireAuth();
    return Object.values(Unit);
  });
});

export const getProductTypes = withTenant(
  async function getProductTypes(): Promise<{
    success: boolean;
    data?: ProductType[];
    error?: string;
  }> {
    return safeAction(async () => {
      await requireAuth();
      return Object.values(ProductType);
    });
  },
);

export const getVariants = withTenant(async function getVariants() {
  return safeAction(async () => {
    await requireAuth();
    const variants = await prisma.productVariant.findMany({
      include: {
        product: true,
      },
      orderBy: {
        skuCode: "asc",
      },
    });
    return serializeData(variants);
  });
});

export const getNextSKU = withTenant(async function getNextSKU(
  productType: ProductType,
  productName: string,
  currentSkus: string[] = [],
): Promise<{ success: boolean; data?: string; error?: string }> {
  return safeAction(async () => {
    await requireAuth();
    const prefixes: Record<string, string> = {
      [ProductType.RAW_MATERIAL]: "RM",
      [ProductType.INTERMEDIATE]: "IN",
      [ProductType.PACKAGING]: "PK",
      [ProductType.WIP]: "WP",
      [ProductType.FINISHED_GOOD]: "FG",
      [ProductType.SCRAP]: "SC",
    };

    const prefix = prefixes[productType] || "XX";

    const namePart = productName.replace(/[^A-Z]/gi, "").toUpperCase();

    let category = namePart.substring(0, 3);
    while (category.length < 3) {
      category += "X";
    }

    const skuPrefix = `${prefix}${category}`;

    const existingVariants = await prisma.productVariant.findMany({
      where: {
        skuCode: {
          startsWith: skuPrefix,
        },
      },
      select: {
        skuCode: true,
      },
      orderBy: {
        skuCode: "desc",
      },
    });

    const sequences = new Set<number>();

    for (const variant of existingVariants) {
      const seqPart = variant.skuCode.substring(5);
      const seq = parseInt(seqPart, 10);
      if (!isNaN(seq)) {
        sequences.add(seq);
      }
    }

    for (const sku of currentSkus) {
      if (sku && sku.startsWith(skuPrefix)) {
        const seqPart = sku.substring(5);
        const seq = parseInt(seqPart, 10);
        if (!isNaN(seq)) {
          sequences.add(seq);
        }
      }
    }

    let nextSeq = 1;
    if (sequences.size > 0) {
      nextSeq = Math.max(...Array.from(sequences)) + 1;
    }

    return `${skuPrefix}${nextSeq.toString().padStart(3, "0")}`;
  });
});
