"use server";

import { withTenant } from "@/lib/core/tenant";
import { auth } from "@/auth";
import { prisma } from "@/lib/core/prisma";
import { logger } from "@/lib/config/logger";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { requirePlanningRole } from "@/lib/tools/auth-checks";
import {
  createProductionOrderSchema,
  CreateProductionOrderValues,
  updateProductionOrderSchema,
  UpdateProductionOrderValues,
  splitProductionOrdersSchema,
  SplitProductionOrdersValues,
} from "@/lib/schemas/production";
import { serializeData } from "@/lib/utils/utils";
import {
  ProductionStatus,
  Prisma,
  ProductType,
  BomCategory,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { ProductionService } from "@/services/production/production-service";

export const getInitData = withTenant(async function getInitData() {
  return safeAction(async () => {
    try {
      const data = await ProductionService.getInitData();
      return serializeData(data);
    } catch (error) {
      logger.error("Failed to get init data", {
        error,
        module: "ProductionActions",
      });
      return {
        boms: [],
        machines: [],
        locations: [],
        operators: [],
        helpers: [],
        workShifts: [],
        rawMaterials: [],
        customers: [],
      };
    }
  });
});

// Alias for backward compatibility
export const getProductionFormData = getInitData;

export const createProductionOrder = withTenant(
  async function createProductionOrder(data: CreateProductionOrderValues) {
    return safeAction(async () => {
      const result = createProductionOrderSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      try {
        const session = await requirePlanningRole();

        const order = await ProductionService.createOrder({
          ...result.data,
          userId: session.user.id,
        });

        revalidatePath("/production");
        revalidatePath("/sales");
        return serializeData(order);
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to create production order", {
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError(
          "Failed to create work order. Please verify input and try again.",
        );
      }
    });
  },
);

export const quickCreateProductionOrder = withTenant(
  async function quickCreateProductionOrder(data: {
    bomId: string;
    plannedQuantity: number;
    machineId: string;
  }) {
    return safeAction(async () => {
      try {
        const session = await requirePlanningRole();

        const { bomId, plannedQuantity, machineId } = data;

        if (!bomId || plannedQuantity <= 0 || !machineId) {
          throw new BusinessRuleError("Produk, jumlah, dan mesin wajib diisi");
        }

        const { WAREHOUSE_SLUGS } = await import("@/lib/constants/locations");

        const bom = await prisma.bom.findUnique({
          where: { id: bomId },
          select: { category: true },
        });

        const outputSlugByCategory: Record<string, string> = {
          MIXING: WAREHOUSE_SLUGS.MIXING,
          EXTRUSION: WAREHOUSE_SLUGS.FINISHING,
          PACKING: WAREHOUSE_SLUGS.PACKING_AREA,
          REWORK: WAREHOUSE_SLUGS.FINISHING,
        };

        const outputSlug =
          outputSlugByCategory[bom?.category || ""] ||
          WAREHOUSE_SLUGS.RAW_MATERIAL;

        let location = await prisma.location.findUnique({
          where: { slug: outputSlug },
          select: { id: true },
        });

        // Fallback for Melindo or databases with different warehouse layouts
        if (!location) {
          location = await prisma.location.findUnique({
            where: { slug: "gudang-utama" },
            select: { id: true },
          });
        }

        // Final fallback to the first available location
        if (!location) {
          location = await prisma.location.findFirst({
            select: { id: true },
          });
        }

        if (!location) {
          throw new BusinessRuleError(
            `Lokasi output (${outputSlug}) tidak ditemukan`,
          );
        }

        const order = await ProductionService.quickCreateOrder({
          bomId,
          plannedQuantity,
          machineId,
          locationId: location.id,
          userId: session.user.id,
        });

        revalidatePath("/production");
        revalidatePath("/production/daily");
        revalidatePath("/production");
        return serializeData(order);
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to quick create production order", {
          error,
          module: "ProductionActions",
        });
        throw new BusinessRuleError(
          "Gagal membuat order produksi. Periksa input dan coba lagi.",
        );
      }
    });
  },
);

export const getProductionOrders = withTenant(
  async function getProductionOrders(filters?: {
    status?: ProductionStatus;
    machineId?: string;
    productTypes?: ProductType[];
    bomCategories?: BomCategory[];
  }) {
    const where: Prisma.ProductionOrderWhereInput = {};
    const bomWhere: Prisma.BomWhereInput = {};

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.machineId) {
      where.machineId = filters.machineId;
    }
    if (filters?.productTypes && filters.productTypes.length > 0) {
      bomWhere.productVariant = {
        product: {
          productType: {
            in: filters.productTypes,
          },
        },
      };
    }

    if (filters?.bomCategories && filters.bomCategories.length > 0) {
      bomWhere.category = {
        in: filters.bomCategories,
      };
    }

    if (Object.keys(bomWhere).length > 0) {
      where.bom = { is: bomWhere };
    }

    const orders = await prisma.productionOrder.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        plannedQuantity: true,
        plannedEnteredQuantity: true,
        plannedEnteredUnit: true,
        plannedConversionFactorSnapshot: true,
        actualQuantity: true,
        plannedStartDate: true,
        plannedEndDate: true,
        actualStartDate: true,
        actualEndDate: true,
        createdAt: true,
        isMaklon: true,
        machineId: true,
        bom: {
          select: {
            id: true,
            name: true,
            category: true,
            productVariant: {
              select: {
                id: true,
                name: true,
                skuCode: true,
                primaryUnit: true,
                salesUnit: true,
                conversionFactor: true,
                product: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        machine: {
          select: { id: true, name: true, code: true, locationId: true, type: true },
        },
        location: {
          select: { id: true, name: true },
        },
        salesOrder: {
          select: {
            id: true,
            orderNumber: true,
            orderType: true,
            customer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        shifts: {
          select: {
            id: true,
            shiftName: true,
            startTime: true,
            endTime: true,
            operator: { select: { id: true, name: true, code: true } },
            helpers: { select: { id: true, name: true, code: true } },
          },
        },
        plannedMaterials: {
          select: {
            id: true,
            productVariantId: true,
            quantity: true,
            productVariant: {
              select: {
                id: true,
                name: true,
                skuCode: true,
                primaryUnit: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        materialIssues: {
          select: {
            id: true,
            productVariantId: true,
            quantity: true,
            status: true,
            productVariant: {
              select: {
                id: true,
                name: true,
                primaryUnit: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return orders.map((order) => ({
      ...order,
      plannedQuantity: order.plannedQuantity.toNumber(),
      plannedEnteredQuantity: order.plannedEnteredQuantity?.toNumber() ?? null,
      plannedConversionFactorSnapshot:
        order.plannedConversionFactorSnapshot?.toNumber() ?? null,
      actualQuantity: order.actualQuantity?.toNumber() ?? null,
    }));
  },
);

export const getProductionOrder = withTenant(async function getProductionOrder(
  id: string,
) {
  if (!id) return null;
  const order = await prisma.productionOrder.findUnique({
    where: { id },
    include: {
      bom: {
        include: {
          productVariant: {
            include: {
              product: { select: { id: true, name: true, productType: true } },
            },
          },
          items: {
            include: {
              productVariant: {
                include: {
                  product: {
                    select: { id: true, name: true, productType: true },
                  },
                },
              },
            },
          },
        },
      },
      machine: true,
      location: true,
      shifts: {
        include: {
          operator: true,
          helpers: true,
        },
        orderBy: { startTime: "asc" },
      },
      materialIssues: {
        include: {
          productVariant: true,
          createdBy: { select: { id: true, name: true } },
        },
      },
      scrapRecords: {
        include: {
          productVariant: true,
          createdBy: { select: { id: true, name: true } },
        },
      },
      inspections: {
        include: {
          inspector: { select: { id: true, name: true } },
        },
      },
      executions: {
        include: {
          operator: true,
          shift: true,
        },
        orderBy: { startTime: "desc" },
      },
      plannedMaterials: {
        include: {
          productVariant: {
            include: {
              product: true,
            },
          },
        },
      },
      childOrders: {
        include: {
          bom: {
            include: {
              productVariant: { select: { id: true, name: true } },
            },
          },
        },
      },
      parentOrder: true,
      issues: {
        include: {
          reportedBy: { select: { id: true, name: true } },
        },
        orderBy: { reportedAt: "desc" },
      },
      maklonCostItems: {
        orderBy: { createdAt: "asc" },
      },
      salesOrder: {
        select: {
          id: true,
          orderNumber: true,
          orderType: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  return serializeData(order);
});

export const updateProductionOrder = withTenant(
  async function updateProductionOrder(data: UpdateProductionOrderValues) {
    return safeAction(async () => {
      const result = updateProductionOrderSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      try {
        await requirePlanningRole();

        await ProductionService.updateOrder(result.data);

        revalidatePath(`/production/orders/${result.data.id}`);
        revalidatePath("/production");
        revalidatePath("/production/schedule");
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

export const deleteProductionOrder = withTenant(
  async function deleteProductionOrder(id: string) {
    return safeAction(async () => {
      if (!id) throw new BusinessRuleError("Order ID is required");

      try {
        await requirePlanningRole();

        await ProductionService.deleteOrder(id);

        revalidatePath("/production");
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

export const getProductionOrderStats = withTenant(
  async function getProductionOrderStats() {
    const session = await auth();
    if (!session?.user) {
      return {
        totalOrders: 0,
        activeCount: 0,
        draftCount: 0,
        lateCount: 0,
      };
    }

    const stats = await prisma.productionOrder.groupBy({
      by: ["status"],
      _count: {
        status: true,
      },
    });

    const totalOrders = stats.reduce(
      (acc, curr) => acc + curr._count.status,
      0,
    );

    const activeCount = stats
      .filter((s) => s.status === "IN_PROGRESS")
      .reduce((acc, curr) => acc + curr._count.status, 0);

    const draftCount = stats
      .filter((s) =>
        ["DRAFT", "RELEASED", "WAITING_MATERIAL"].includes(s.status),
      )
      .reduce((acc, curr) => acc + curr._count.status, 0);

    const lateCount = await prisma.productionOrder.count({
      where: {
        status: { in: ["RELEASED", "IN_PROGRESS"] },
        plannedEndDate: {
          lt: new Date(),
        },
      },
    });

    return {
      totalOrders,
      activeCount,
      draftCount,
      lateCount,
    };
  },
);

export const splitProductionOrders = withTenant(
  async function splitProductionOrders(data: SplitProductionOrdersValues) {
    return safeAction(async () => {
      const result = splitProductionOrdersSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      try {
        await requirePlanningRole();
        const session = await auth();

        const createdOrders = await ProductionService.splitOrdersFromSales({
          ...result.data,
          userId: session?.user?.id,
        });

        revalidatePath("/production");
        revalidatePath(`/sales/orders/${result.data.salesOrderId}`);
        return serializeData(createdOrders);
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error("Failed to split production orders", {
          error,
          salesOrderId: data.salesOrderId,
          module: "ProductionActions",
        });
        throw new BusinessRuleError(
          error instanceof Error ? error.message : "An unknown error occurred",
        );
      }
    });
  },
);
