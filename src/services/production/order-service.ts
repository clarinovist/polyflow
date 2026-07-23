import { prisma } from "@/lib/core/prisma";
import {
  CreateProductionOrderValues,
  UpdateProductionOrderValues,
} from "@/lib/schemas/production";
import {
  ProductionStatus,
  MachineType,
  BomCategory,
  SalesOrderType,
  Prisma,
} from "@prisma/client";

import { WAREHOUSE_SLUGS } from "@/lib/constants/locations";
import {
  BusinessRuleError,
  NotFoundError,
  ProductionRuleViolationError,
  ValidationError,
} from "@/lib/errors/errors";
import { Ok, Err, Result } from "@/lib/utils/result";
import { createProductionOrderWithGeneratedNumber } from "./order-number-service";
import { resolveSourceLocationId, stageFromBomCategory } from "@/lib/locations/resolve-location";

export class ProductionOrderService {
  /**
   * Get Initialization Data for Production Forms
   */
  static async getInitData() {
    // Run in parallel
    const [
      boms,
      machines,
      locations,
      employees,
      workShifts,
      rawMaterials,
      customers,
    ] = await Promise.all([
      prisma.bom.findMany({
        where: { isActive: true },
        include: {
          productVariant: {
            include: { product: true },
          },
        },
      }),
      prisma.machine.findMany({
        where: { status: "ACTIVE" },
      }),
      prisma.location.findMany(),
      prisma.employee.findMany({
        orderBy: { name: "asc" },
      }),
      prisma.workShift.findMany({
        where: { status: "ACTIVE" },
        orderBy: { startTime: "asc" },
      }),
      prisma.productVariant.findMany({
        where: {
          product: {
            productType: { in: ["RAW_MATERIAL", "PACKAGING"] },
          },
        },
        include: {
          product: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.customer.findMany({
        orderBy: { name: "asc" },
      }),
    ]);

    // Filter employees by role
    const operators = employees.filter((e) => e.role === "OPERATOR");
    const helpers = employees.filter(
      (e) => e.role === "HELPER" || e.role === "PACKER",
    );

    return {
      boms,
      machines,
      locations,
      operators,
      helpers,
      workShifts,
      rawMaterials,
      customers,
    };
  }

  /**
   * Calculate BOM Requirements with Stock Check
   */
  static async getBomWithInventory(
    bomId: string,
    sourceLocationId: string,
    plannedQuantity: number,
  ): Promise<
    Result<{
      data: unknown[];
      meta: {
        requestedSourceLocationId: string;
        suggestedSourceLocationId: string | null;
        suggestedSourceLocationName: string | null;
      };
    }>
  > {
    if (!bomId || plannedQuantity <= 0)
      return Err(new Error("Invalid parameters"));

    const bom = await prisma.bom.findUnique({
      where: { id: bomId },
      include: {
        items: {
          include: {
            productVariant: true,
          },
        },
      },
    });

    if (!bom) return Err(new Error("Recipe not found"));

    const variantIds = bom.items.map((i) => i.productVariantId);

    // Fetch inventory rows in bulk
    const sourceInventoryRows = sourceLocationId
      ? await prisma.inventory.findMany({
          where: {
            locationId: sourceLocationId,
            productVariantId: { in: variantIds },
          },
          select: { productVariantId: true, quantity: true },
        })
      : [];

    const sourceStockMap = new Map<string, number>();
    sourceInventoryRows.forEach((r) =>
      sourceStockMap.set(r.productVariantId, r.quantity.toNumber()),
    );

    let suggestedSourceLocation: { id: string; name: string } | null = null;
    if (
      sourceLocationId &&
      !sourceInventoryRows.some((r) => r.quantity.toNumber() > 0)
    ) {
      const rmLocation = await prisma.location.findUnique({
        where: { slug: WAREHOUSE_SLUGS.RAW_MATERIAL },
        select: { id: true, name: true },
      });

      if (rmLocation && rmLocation.id !== sourceLocationId) {
        const rmHasAny = await prisma.inventory.findFirst({
          where: {
            locationId: rmLocation.id,
            productVariantId: { in: variantIds },
            quantity: { gt: 0 },
          },
          select: { id: true },
        });

        if (rmHasAny) suggestedSourceLocation = rmLocation;
      }
    }

    const materialRequirements = bom.items.map((item) => {
      const requiredQty =
        (Number(item.quantity) / Number(bom.outputQuantity)) * plannedQuantity;
      const currentStock = sourceLocationId
        ? sourceStockMap.get(item.productVariantId) || 0
        : 0;

      return {
        productVariantId: item.productVariantId,
        name: item.productVariant.name,
        unit: item.productVariant.primaryUnit,
        stdQty: item.quantity.toNumber(),
        bomOutput: bom.outputQuantity.toNumber(),
        requiredQty,
        currentStock,
      };
    });

    return Ok({
      data: materialRequirements,
      meta: {
        requestedSourceLocationId: sourceLocationId,
        suggestedSourceLocationId: suggestedSourceLocation?.id || null,
        suggestedSourceLocationName: suggestedSourceLocation?.name || null,
      },
    });
  }

  /**
   * Create a new Production Order
   */
  static async createOrder(
    data: CreateProductionOrderValues & { userId?: string },
    tx?: Prisma.TransactionClient,
  ) {
    const {
      bomId,
      plannedQuantity,
      plannedStartDate,
      plannedEndDate,
      locationId,
      orderNumber,
      notes,
      salesOrderId,
      userId,
      machineId,
      priority,
      isMaklon,
      maklonCustomerId,
      estimatedConversionCost,
      plannedEnteredQuantity,
      plannedEnteredUnit,
      plannedConversionFactorSnapshot,
      materialSourceLocationId,
    } = data;

    const execute = async (transaction: Prisma.TransactionClient) => {
      // 0. BOM must exist and be active for new production orders
      const bomForOrder = await transaction.bom.findUnique({
        where: { id: bomId },
        select: { id: true, isActive: true, category: true },
      });
      if (!bomForOrder) {
        throw new NotFoundError("Resep", bomId);
      }
      if (!bomForOrder.isActive) {
        throw new BusinessRuleError(
          "Resep ini sudah nonaktif dan tidak bisa dipakai untuk Production Order baru. Aktifkan kembali atau pilih resep aktif lain.",
          { bomId },
          "BOM_INACTIVE",
        );
      }

      // 1. Validate Machine Type against BOM Category if machineId is provided
      if (machineId) {
        const machine = await transaction.machine.findUnique({
          where: { id: machineId },
          select: { type: true },
        });

        if (machine) {
          const bomCategory = bomForOrder.category;
          const isTypeMatch =
            (bomCategory === BomCategory.MIXING &&
              machine.type === MachineType.MIXER) ||
            (bomCategory === BomCategory.EXTRUSION &&
              (machine.type === MachineType.EXTRUDER ||
                machine.type === MachineType.REWINDER)) ||
            (bomCategory === BomCategory.PACKING &&
              (machine.type === MachineType.PACKER ||
                machine.type === MachineType.GRANULATOR)) ||
            bomCategory === BomCategory.REWORK || // Rework is manual, any machine is OK
            (bomCategory === BomCategory.STANDARD &&
              (machine.type === MachineType.EXTRUDER ||
                machine.type === MachineType.MIXER)); // Standard fallback

          if (!isTypeMatch) {
            throw new ProductionRuleViolationError(
              `Machine type ${machine.type} is not compatible with stage ${bomCategory}`,
              { machineType: machine.type, bomCategory },
            );
          }
        }
      }
      // 2. Calculate Materials (Standard or Flexible)
      let materialsToCreate = data.items || [];

      if (materialsToCreate.length === 0) {
        // Fetch BOM items to calculate defaults
        const bom = await transaction.bom.findUnique({
          where: { id: bomId },
          include: { items: true },
        });

        if (bom) {
          materialsToCreate = bom.items.map((item) => ({
            productVariantId: item.productVariantId,
            quantity:
              (Number(item.quantity) / Number(bom.outputQuantity)) *
              Number(plannedQuantity),
          }));
        }
      }

      // 3. Determine Initial Status based on Stock Availability
      // Shortage check uses materialSourceLocationId (source warehouse), NOT output locationId.
      // Falls back to resolve from BOM category if not provided.
      let initialStatus: ProductionStatus = ProductionStatus.DRAFT;
      if (materialsToCreate.length > 0) {
        const variantIds = materialsToCreate.map((m) => m.productVariantId);

        // Resolve source location for shortage check
        let shortageLocationId = materialSourceLocationId;
        if (!shortageLocationId) {
          // Fallback: resolve default source from BOM category + maklon
          const allLocations = await transaction.location.findMany({
            select: { id: true, name: true, slug: true, locationPurpose: true },
          });
          const stage = stageFromBomCategory(bomForOrder.category);
          shortageLocationId = resolveSourceLocationId(allLocations, stage, !!isMaklon);
        }

        if (shortageLocationId) {
          const inventoryRows = await transaction.inventory.findMany({
            where: {
              locationId: shortageLocationId,
              productVariantId: { in: variantIds },
            },
          });

          const isShortage = materialsToCreate.some((m) => {
            const stock =
              inventoryRows
                .find((ir) => ir.productVariantId === m.productVariantId)
                ?.quantity.toNumber() || 0;
            return m.quantity > stock;
          });

          if (isShortage) {
            initialStatus = ProductionStatus.WAITING_MATERIAL;
          }
        }
      }

      // 4. Create Order
      const orderData = {
        bom: { connect: { id: bomId } },
        plannedQuantity,
        plannedStartDate,
        plannedEndDate,
        location: { connect: { id: locationId } },
        notes,
        status: initialStatus,
        priority: priority || "NORMAL",
        actualQuantity: 0,
        plannedEnteredQuantity,
        plannedEnteredUnit,
        plannedConversionFactorSnapshot,
        salesOrder: salesOrderId
          ? { connect: { id: salesOrderId } }
          : undefined,
        createdBy: userId ? { connect: { id: userId } } : undefined,
        machine: machineId ? { connect: { id: machineId } } : undefined,
        isMaklon: isMaklon,
        maklonCustomer: maklonCustomerId
          ? { connect: { id: maklonCustomerId } }
          : undefined,
        estimatedConversionCost: estimatedConversionCost,
      } satisfies Omit<Prisma.ProductionOrderCreateInput, "orderNumber">;

      const newOrder = orderNumber
        ? await transaction.productionOrder.create({
            data: {
              ...orderData,
              orderNumber,
            },
          })
        : await createProductionOrderWithGeneratedNumber(transaction, orderData);

      // 5. Create Material Requirements
      if (materialsToCreate.length > 0) {
        await transaction.productionMaterial.createMany({
          data: materialsToCreate.map((item) => ({
            productionOrderId: newOrder.id,
            productVariantId: item.productVariantId,
            quantity: item.quantity,
          })),
        });
      }

      return newOrder;
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await prisma.$transaction(execute);
    }
  }

  /**
   * Create Production Order from Sales Order (Shortage)
   */
  static async createOrderFromSales(
    salesOrderId: string,
    productVariantId: string,
    quantity: number,
  ) {
    if (!salesOrderId || !productVariantId || quantity <= 0) {
      throw new ValidationError("Parameter tidak valid: salesOrderId, productVariantId, dan quantity > 0 wajib diisi");
    }

    // 1. Find default BOM
    const bom = await prisma.bom.findFirst({
      where: {
        productVariantId,
        isDefault: true,
        isActive: true,
      },
    });

    if (!bom) {
      throw new BusinessRuleError(
        "No default BOM found for this product. Please create one first.",
        { productVariantId },
        "MISSING_DEFAULT_BOM",
      );
    }

    // 2. Fetch Sales Order
    const so = await prisma.salesOrder.findUnique({
      where: { id: salesOrderId },
      select: {
        sourceLocationId: true,
        expectedDate: true,
        orderType: true,
        customerId: true,
      },
    });

    if (!so) throw new NotFoundError("Sales Order", salesOrderId);
    if (!so.sourceLocationId) {
      throw new BusinessRuleError(
        "Sales Order does not have a source location. A production location is required.",
        { salesOrderId },
        "MISSING_SOURCE_LOCATION",
      );
    }

    const isMaklon = so.orderType === SalesOrderType.MAKLON_JASA;

    // 3. Create PO
    return await this.createOrder({
      bomId: bom.id,
      plannedQuantity: quantity,
      plannedEnteredQuantity: undefined,
      plannedEnteredUnit: undefined,
      plannedConversionFactorSnapshot: undefined,
      plannedStartDate: new Date(),
      plannedEndDate: so.expectedDate || undefined,
      locationId: so.sourceLocationId!,
      salesOrderId,
      notes: `Auto-generated from Sales Order shortage${isMaklon ? " (Maklon; source location treated as production location/default consumption location)" : ""}.`,
      isMaklon: isMaklon,
      maklonCustomerId: isMaklon ? so.customerId || undefined : undefined,
      estimatedConversionCost: 0,
    });
  }

  /**
   * Split Demand shortage from Sales Order into sibling daily/batch Production Orders
   */
  static async splitOrdersFromSales(data: {
    salesOrderId: string;
    productVariantId: string;
    batches: {
      plannedQuantity: number;
      plannedStartDate: Date;
      machineId?: string;
    }[];
    userId?: string;
  }) {
    const { salesOrderId, productVariantId, batches, userId } = data;

    if (!salesOrderId || !productVariantId || !batches || batches.length === 0) {
      throw new ValidationError("salesOrderId, productVariantId, and at least one batch are required");
    }

    // 1. Find default BOM
    const bom = await prisma.bom.findFirst({
      where: {
        productVariantId,
        isDefault: true,
        isActive: true,
      },
    });

    if (!bom) {
      throw new BusinessRuleError(
        "No default BOM found for this product. Please create one first.",
        { productVariantId },
        "MISSING_DEFAULT_BOM",
      );
    }

    // 2. Fetch Sales Order
    const so = await prisma.salesOrder.findUnique({
      where: { id: salesOrderId },
      select: {
        sourceLocationId: true,
        expectedDate: true,
        orderType: true,
        customerId: true,
      },
    });

    if (!so) throw new NotFoundError("Sales Order", salesOrderId);
    if (!so.sourceLocationId) {
      throw new BusinessRuleError(
        "Sales Order does not have a source location. A production location is required.",
        { salesOrderId },
        "MISSING_SOURCE_LOCATION",
      );
    }

    const isMaklon = so.orderType === SalesOrderType.MAKLON_JASA;

    return await prisma.$transaction(async (tx) => {
      // 3. Validate quantities
      const soItem = await tx.salesOrderItem.findFirst({
        where: { salesOrderId, productVariantId },
      });
      if (!soItem) {
        throw new NotFoundError("Sales Order Item", `${salesOrderId}/${productVariantId}`);
      }

      const existingPOs = await tx.productionOrder.findMany({
        where: {
          salesOrderId,
          bom: { productVariantId },
          status: { not: "CANCELLED" },
        },
        select: { plannedQuantity: true },
      });

      const totalPlannedQty = existingPOs.reduce((sum, po) => sum + po.plannedQuantity.toNumber(), 0);
      const remainingToProduce = Math.max(0, soItem.quantity.toNumber() - soItem.deliveredQty.toNumber() - totalPlannedQty);

      const sumBatchQty = batches.reduce((sum, b) => sum + b.plannedQuantity, 0);
      if (sumBatchQty > remainingToProduce) {
        throw new BusinessRuleError(
          `Requested production quantity (${sumBatchQty}) exceeds the remaining demand to produce (${remainingToProduce}) for this Sales Order item.`,
          { sumBatchQty, remainingToProduce },
          "EXCEEDS_REMAINING_DEMAND"
        );
      }

      // 4. Create sibling POs
      const createdOrders = [];
      for (const batch of batches) {
        if (batch.plannedQuantity <= 0) {
          throw new ValidationError("Qty rencana batch harus positif");
        }

        const po = await this.createOrder(
          {
            bomId: bom.id,
            plannedQuantity: batch.plannedQuantity,
            plannedStartDate: new Date(batch.plannedStartDate),
            plannedEndDate: so.expectedDate || undefined,
            locationId: so.sourceLocationId!,
            salesOrderId,
            machineId: batch.machineId,
            notes: `Split batch from Sales Order shortage${isMaklon ? " (Maklon)" : ""}.`,
            isMaklon: isMaklon,
            maklonCustomerId: isMaklon ? so.customerId || undefined : undefined,
            estimatedConversionCost: 0,
            userId,
          },
          tx,
        );
        createdOrders.push(po);
      }

      return createdOrders;
    });
  }

  /**
   * Quick Create Production Order for Daily Production
   * Wraps createOrder() with daily-production defaults:
   * - Auto-sets plannedStartDate to today
   * - Auto-sets status to RELEASED (skips DRAFT)
   * - Validates machine type vs BOM category
   */
  static async quickCreateOrder(data: {
    bomId: string;
    plannedQuantity: number;
    machineId: string;
    locationId: string;
    userId?: string;
    notes?: string;
    priority?: "URGENT" | "NORMAL" | "LOW";
  }) {
    const { bomId, plannedQuantity, machineId, locationId, userId, notes, priority } =
      data;

    if (!bomId || plannedQuantity <= 0 || !machineId || !locationId) {
      throw new ValidationError("BOM, jumlah, mesin, dan lokasi wajib diisi");
    }

    // Validate machine type vs BOM category (reuse logic from createOrder)
    const [machine, bom] = await Promise.all([
      prisma.machine.findUnique({
        where: { id: machineId },
        select: { type: true },
      }),
      prisma.bom.findUnique({
        where: { id: bomId },
        select: { category: true },
      }),
    ]);

    if (machine && bom) {
      const isTypeMatch =
        (bom.category === BomCategory.MIXING &&
          machine.type === MachineType.MIXER) ||
        (bom.category === BomCategory.EXTRUSION &&
          (machine.type === MachineType.EXTRUDER ||
            machine.type === MachineType.REWINDER)) ||
        (bom.category === BomCategory.PACKING &&
          (machine.type === MachineType.PACKER ||
            machine.type === MachineType.GRANULATOR)) ||
        bom.category === BomCategory.REWORK ||
        (bom.category === BomCategory.STANDARD &&
          (machine.type === MachineType.EXTRUDER ||
            machine.type === MachineType.MIXER));

      if (!isTypeMatch) {
        throw new ProductionRuleViolationError(
          `Machine type ${machine.type} is not compatible with stage ${bom.category}`,
          { machineType: machine.type, bomCategory: bom.category },
        );
      }
    }

    // Create order with daily-production defaults
    const order = await this.createOrder({
      bomId,
      plannedQuantity,
      plannedStartDate: new Date(),
      locationId,
      machineId,
      userId,
      notes: notes || "Quick produce — produksi harian",
      priority: priority || "NORMAL",
      isMaklon: false,
      estimatedConversionCost: 0,
    });

    // Auto-release: if order was created as DRAFT, set to RELEASED
    if (order.status === ProductionStatus.DRAFT) {
      await prisma.productionOrder.update({
        where: { id: order.id },
        data: { status: ProductionStatus.RELEASED },
      });
    }

    return order;
  }

  /**
   * Update Production Order
   */
  static async updateOrder(data: UpdateProductionOrderValues) {
    const {
      id,
      status,
      priority,
      actualQuantity,
      actualStartDate,
      actualEndDate,
      machineId,
      locationId,
      plannedStartDate,
    } = data;

    if (locationId) {
      const existing = await prisma.productionOrder.findUnique({
        where: { id },
        select: { status: true, locationId: true },
      });
      if (!existing) {
        throw new NotFoundError("Production Order", id);
      }
      if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
        throw new BusinessRuleError(
          "Lokasi output tidak bisa diubah untuk SPK yang sudah selesai atau dibatalkan.",
          { status: existing.status, orderId: id },
          "INVALID_ORDER_STATUS",
        );
      }

      const location = await prisma.location.findUnique({
        where: { id: locationId },
        select: { id: true, name: true, slug: true, locationPurpose: true },
      });
      if (!location) {
        throw new NotFoundError("Location", locationId);
      }

      const slug = (location.slug || "").toLowerCase();
      const name = (location.name || "").toLowerCase();
      if (
        slug.startsWith("inactive-") ||
        slug.includes("nonaktif") ||
        name.includes("[nonaktif]")
      ) {
        throw new BusinessRuleError(
          "Tidak bisa memakai lokasi nonaktif sebagai output SPK.",
          { locationId, slug: location.slug },
          "INVALID_LOCATION",
        );
      }
    }

    return await prisma.productionOrder.update({
      where: { id },
      data: {
        status,
        priority,
        actualQuantity,
        actualStartDate,
        actualEndDate,
        machineId,
        ...(locationId ? { locationId } : {}),
        plannedStartDate,
      },
    });
  }

  /**
   * Delete Production Order (Draft Only)
   */
  static async deleteOrder(id: string) {
    const order = await prisma.productionOrder.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!order) {
      throw new NotFoundError("Production Order", id);
    }

    if (order.status !== "DRAFT" && order.status !== "WAITING_MATERIAL") {
      throw new BusinessRuleError(
        "Only DRAFT or WAITING_MATERIAL orders can be deleted.",
        { status: order.status, orderId: id },
        "INVALID_ORDER_STATUS",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.updateMany({
        where: { productionOrderId: id },
        data: { productionOrderId: null },
      });
      await tx.materialIssue.deleteMany({ where: { productionOrderId: id } });
      await tx.scrapRecord.deleteMany({ where: { productionOrderId: id } });
      await tx.qualityInspection.deleteMany({
        where: { productionOrderId: id },
      });
      await tx.productionShift.deleteMany({ where: { productionOrderId: id } });
      await tx.productionMaterial.deleteMany({
        where: { productionOrderId: id },
      });
      await tx.productionOrder.delete({ where: { id } });
    });
  }

  /**
   * Add Shift to Production Order
   */
  static async addShift(data: {
    productionOrderId: string;
    shiftName: string;
    startTime: Date;
    endTime: Date;
    operatorId?: string;
    helperIds?: string[];
    machineId?: string;
  }) {
    await prisma.$transaction(async (tx) => {
      await tx.productionShift.create({
        data: {
          productionOrderId: data.productionOrderId,
          shiftName: data.shiftName,
          startTime: data.startTime,
          endTime: data.endTime,
          operatorId: data.operatorId,
          helpers: data.helperIds
            ? {
                connect: data.helperIds.map((id) => ({ id })),
              }
            : undefined,
        },
      });

      if (data.machineId) {
        await tx.productionOrder.update({
          where: { id: data.productionOrderId },
          data: { machineId: data.machineId },
        });
      }
    });
  }

  /**
   * Delete Production Shift
   */
  static async deleteShift(shiftId: string) {
    await prisma.productionShift.delete({
      where: { id: shiftId },
    });
  }
}
