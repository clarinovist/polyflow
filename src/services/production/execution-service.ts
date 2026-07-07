import { prisma } from "@/lib/core/prisma";
import {
  NotFoundError,
  ConflictError,
  ProductionRuleViolationError,
} from "@/lib/errors/errors";
import {
  StartExecutionValues,
  StopExecutionValues,
  LogRunningOutputValues,
  ProductionOutputValues,
  LogMachineDowntimeValues,
} from "@/lib/schemas/production";
import {
  ProductionStatus,
  MovementType,
  ProductionExecution,
  Unit,
  Prisma,
} from "@prisma/client";
import { InventoryCoreService } from "@/services/inventory/core-service";
import { AccountingService } from "../accounting/accounting-service";
import {
  backflushMaterials,
  recordExecutionScrap,
  recordFinishedGoodsOutput,
  type ProductionExecutionOrder,
} from "./execution-helpers";
import { resolveProductionOutputUnit } from "./execution-unit-conversion";

type ResolvedOutputQuantity = {
  baseQty: number;
  enteredQty: number | null;
  enteredUnit: Unit | null;
  conversionSnapshot: number | null;
};

function assertClientBaseQuantityMatches(
  clientBaseQty: number | undefined,
  serverBaseQty: number,
) {
  if (clientBaseQty === undefined) return;

  const delta = Math.abs(Number(clientBaseQty) - serverBaseQty);
  if (delta > 0.0001) {
    throw new ProductionRuleViolationError(
      `Output conversion mismatch. Client sent ${clientBaseQty}, server calculated ${serverBaseQty}.`,
    );
  }
}

function assertClientConversionFactorMatches(
  clientFactor: number | undefined,
  serverFactor: number,
) {
  if (clientFactor === undefined) return;

  const delta = Math.abs(Number(clientFactor) - serverFactor);
  if (delta > 0.0001) {
    throw new ProductionRuleViolationError(
      `Output conversion factor mismatch. Client sent ${clientFactor}, server calculated ${serverFactor}.`,
    );
  }
}

async function resolveOutputQuantity(params: {
  productionOrderId: string;
  quantityProduced: number;
  enteredQuantity?: number;
  enteredUnit?: Unit;
  baseQuantityProduced?: number;
  conversionFactorSnapshot?: number;
  tx?: Prisma.TransactionClient;
}): Promise<ResolvedOutputQuantity> {
  const {
    productionOrderId,
    quantityProduced,
    enteredQuantity,
    enteredUnit,
    baseQuantityProduced,
    conversionFactorSnapshot,
    tx,
  } = params;

  const conversionPayloadCount = [
    enteredQuantity !== undefined,
    enteredUnit !== undefined,
    baseQuantityProduced !== undefined,
    conversionFactorSnapshot !== undefined,
  ].filter(Boolean).length;

  if (conversionPayloadCount > 0 && conversionPayloadCount < 4) {
    throw new ProductionRuleViolationError(
      "Incomplete output conversion payload. Send enteredQuantity, enteredUnit, baseQuantityProduced, and conversionFactorSnapshot together.",
    );
  }

  if (enteredQuantity !== undefined && enteredUnit !== undefined) {
    const conversion = await resolveProductionOutputUnit(
      {
        productionOrderId,
        enteredQuantity: Number(enteredQuantity),
        enteredUnit,
      },
      tx,
    );

    assertClientBaseQuantityMatches(
      baseQuantityProduced !== undefined
        ? Number(baseQuantityProduced)
        : undefined,
      conversion.baseQuantityProduced,
    );
    assertClientConversionFactorMatches(
      conversionFactorSnapshot !== undefined
        ? Number(conversionFactorSnapshot)
        : undefined,
      conversion.conversionFactorSnapshot,
    );

    return {
      baseQty: conversion.baseQuantityProduced,
      enteredQty: Number(enteredQuantity),
      enteredUnit,
      conversionSnapshot: conversion.conversionFactorSnapshot,
    };
  }

  return {
    baseQty: Number(quantityProduced),
    enteredQty: null,
    enteredUnit: null,
    conversionSnapshot: null,
  };
}

function mergeExecutionEnteredQuantity(params: {
  currentEnteredQuantity: unknown;
  currentEnteredUnit: Unit | null;
  nextEnteredQuantity: number | null;
  nextEnteredUnit: Unit | null;
}) {
  const {
    currentEnteredQuantity,
    currentEnteredUnit,
    nextEnteredQuantity,
    nextEnteredUnit,
  } = params;

  if (nextEnteredQuantity === null || nextEnteredUnit === null) {
    return {};
  }

  const currentQty = currentEnteredQuantity
    ? Number(currentEnteredQuantity)
    : 0;

  if (!currentEnteredUnit || currentEnteredUnit === nextEnteredUnit) {
    return {
      enteredQuantity: currentQty + nextEnteredQuantity,
      enteredUnit: nextEnteredUnit,
    };
  }

  // Mixed entered units on one running execution are valid for inventory,
  // but a single aggregate enteredQuantity would be misleading.
  return {
    enteredQuantity: null,
    enteredUnit: null,
  };
}

/**
 * Shared pipeline: update order actualQty → backflush materials → record finished goods.
 * Used by stopExecution, logRunningOutput, and addProductionOutput.
 */
async function processOutputAndBackflush(params: {
  tx: Prisma.TransactionClient;
  productionOrderId: string;
  resolvedBaseQty: number;
  scrapQuantity: number;
  userId?: string;
  resolved: ResolvedOutputQuantity;
  referencePrefix: string;
  additionalScrapQty?: number;
}) {
  const {
    tx,
    productionOrderId,
    resolvedBaseQty,
    scrapQuantity,
    userId,
    resolved,
    referencePrefix,
    additionalScrapQty = 0,
  } = params;

  const currentOrder = await tx.productionOrder.findUniqueOrThrow({
    where: { id: productionOrderId },
  });

  const newTotal =
    (currentOrder.actualQuantity ? Number(currentOrder.actualQuantity) : 0) +
    resolvedBaseQty;

  const order = await tx.productionOrder.update({
    where: { id: productionOrderId },
    data: { actualQuantity: newTotal },
    include: {
      bom: {
        include: {
          items: {
            include: {
              productVariant: {
                include: { product: true },
              },
            },
          },
        },
      },
      plannedMaterials: {
        include: {
          productVariant: {
            include: { product: true },
          },
        },
      },
    },
  });

  const totalConsumed = resolvedBaseQty + scrapQuantity + additionalScrapQty;
  await backflushMaterials({
    tx,
    order: order as ProductionExecutionOrder,
    productionOrderId,
    totalConsumed,
    reference: `${referencePrefix}: WO#${order.orderNumber}`,
    userId,
    outputContext: {
      enteredQuantity: resolved.enteredQty,
      enteredUnit: resolved.enteredUnit,
      baseQuantity: resolvedBaseQty,
    },
  });

  await recordFinishedGoodsOutput({
    tx,
    productionOrderId,
    order: order as ProductionExecutionOrder,
    quantityProduced: resolvedBaseQty,
    reference: `Production Output: WO#${order.orderNumber}`,
  });

  return order;
}

export class ProductionExecutionService {
  /**
   * Start Execution
   */
  static async startExecution(data: StartExecutionValues) {
    const { productionOrderId, machineId, operatorId, shiftId } = data;

    return await prisma.$transaction(async (tx) => {
      const execution = await tx.productionExecution.create({
        data: {
          productionOrderId,
          machineId,
          operatorId,
          shiftId,
          startTime: new Date(),
          endTime: null as unknown as Date,
          quantityProduced: 0,
          scrapQuantity: 0,
        },
      });

      const order = await tx.productionOrder.findUnique({
        where: { id: productionOrderId },
        select: { status: true },
      });

      if (order?.status === ProductionStatus.RELEASED) {
        await tx.productionOrder.update({
          where: { id: productionOrderId },
          data: { status: ProductionStatus.IN_PROGRESS },
        });
      }

      return execution;
    });
  }

  /**
   * Stop Execution
   */
  static async stopExecution(data: StopExecutionValues & { userId?: string }) {
    const {
      executionId,
      quantityProduced,
      enteredQuantity,
      enteredUnit,
      baseQuantityProduced,
      conversionFactorSnapshot,
      scrapQuantity,
      scrapProngkolQty = 0,
      scrapDaunQty = 0,
      notes,
      userId,
    } = data;

    let finalExecution!: ProductionExecution;
    let resolvedBaseQty = Number(quantityProduced);
    await prisma.$transaction(async (tx) => {
      const existingExecution = await tx.productionExecution.findUniqueOrThrow({
        where: { id: executionId },
      });
      const productionOrderId = existingExecution.productionOrderId;
      const resolved = await resolveOutputQuantity({
        productionOrderId,
        quantityProduced: Number(quantityProduced),
        enteredQuantity:
          enteredQuantity !== undefined ? Number(enteredQuantity) : undefined,
        enteredUnit: enteredUnit as Unit | undefined,
        baseQuantityProduced:
          baseQuantityProduced !== undefined
            ? Number(baseQuantityProduced)
            : undefined,
        conversionFactorSnapshot:
          conversionFactorSnapshot !== undefined
            ? Number(conversionFactorSnapshot)
            : undefined,
        tx,
      });
      resolvedBaseQty = resolved.baseQty;

      finalExecution = await tx.productionExecution.update({
        where: { id: executionId },
        data: {
          endTime: new Date(),
          quantityProduced: { increment: resolvedBaseQty },
          scrapQuantity: { increment: scrapQuantity },
          notes: notes ? `[Stopped]: ${notes}` : undefined,
          ...mergeExecutionEnteredQuantity({
            currentEnteredQuantity: existingExecution.enteredQuantity,
            currentEnteredUnit: existingExecution.enteredUnit,
            nextEnteredQuantity: resolved.enteredQty,
            nextEnteredUnit: resolved.enteredUnit,
          }),
          conversionFactorSnapshot:
            resolved.conversionSnapshot ??
            existingExecution.conversionFactorSnapshot,
        },
      });

      // Handle completion status separately (needs order update with status)
      if (data.completed) {
        await tx.productionOrder.update({
          where: { id: productionOrderId },
          data: { status: ProductionStatus.COMPLETED },
        });
      }

      const order = await processOutputAndBackflush({
        tx,
        productionOrderId,
        resolvedBaseQty,
        scrapQuantity,
        userId,
        resolved,
        referencePrefix: "Backflush (Stop)",
      });

      await recordExecutionScrap({
        tx,
        productionOrderId,
        executionId,
        scrapQuantity: Number(scrapQuantity),
        scrapProngkolQty: Number(scrapProngkolQty),
        scrapDaunQty: Number(scrapDaunQty),
        userId,
      });

      if (data.completed && order.isMaklon) {
        await AccountingService.recordMaklonCosts(productionOrderId, tx);
      }
    });

    // DELEGATED: Auto-journal posting is recorded under the transaction via recordFinishedGoodsOutput -> AccountingService.recordInventoryMovement

    return finalExecution;
  }

  /**
   * Log Production Output (While Running)
   */
  static async logRunningOutput(
    data: LogRunningOutputValues & { userId?: string },
  ) {
    const {
      executionId,
      quantityProduced,
      enteredQuantity,
      enteredUnit,
      baseQuantityProduced,
      conversionFactorSnapshot,
      scrapQuantity,
      scrapProngkolQty = 0,
      scrapDaunQty = 0,
      notes,
      operatorId: _operatorId,
      helperIds,
      photoUrl,
      userId,
    } = data;

    let resolvedBaseQty = Number(quantityProduced);
    await prisma.$transaction(async (tx) => {
      const execution = await tx.productionExecution.findUniqueOrThrow({
        where: { id: executionId },
      });

      const productionOrderId = execution.productionOrderId;
      const resolved = await resolveOutputQuantity({
        productionOrderId,
        quantityProduced: Number(quantityProduced),
        enteredQuantity:
          enteredQuantity !== undefined ? Number(enteredQuantity) : undefined,
        enteredUnit: enteredUnit as Unit | undefined,
        baseQuantityProduced:
          baseQuantityProduced !== undefined
            ? Number(baseQuantityProduced)
            : undefined,
        conversionFactorSnapshot:
          conversionFactorSnapshot !== undefined
            ? Number(conversionFactorSnapshot)
            : undefined,
        tx,
      });
      resolvedBaseQty = resolved.baseQty;

      await tx.productionExecution.update({
        where: { id: executionId },
        data: {
          quantityProduced: { increment: resolvedBaseQty },
          scrapQuantity: { increment: scrapQuantity },
          notes: notes
            ? execution.notes
              ? `${execution.notes}\n[Log]: ${notes}`
              : `[Log]: ${notes}`
            : undefined,
          photoUrl: photoUrl ?? execution.photoUrl,
          ...mergeExecutionEnteredQuantity({
            currentEnteredQuantity: execution.enteredQuantity,
            currentEnteredUnit: execution.enteredUnit,
            nextEnteredQuantity: resolved.enteredQty,
            nextEnteredUnit: resolved.enteredUnit,
          }),
          conversionFactorSnapshot:
            resolved.conversionSnapshot ?? execution.conversionFactorSnapshot,
          ...(helperIds && helperIds.length > 0 ? {
            helpers: { connect: helperIds.map((id) => ({ id })) }
          } : {}),
        },
      });

      await processOutputAndBackflush({
        tx,
        productionOrderId,
        resolvedBaseQty,
        scrapQuantity,
        userId,
        resolved,
        referencePrefix: "Backflush (Partial)",
      });

      await recordExecutionScrap({
        tx,
        productionOrderId,
        executionId,
        scrapQuantity: Number(scrapQuantity),
        scrapProngkolQty: Number(scrapProngkolQty),
        scrapDaunQty: Number(scrapDaunQty),
        userId,
      });
    });

    // DELEGATED: Auto-journal posting is recorded under the transaction via recordFinishedGoodsOutput -> AccountingService.recordInventoryMovement
  }

  /**
   * Record Production Output (Batch/Completed)
   */
  static async addProductionOutput(
    data: ProductionOutputValues & { userId?: string },
  ) {
    const {
      productionOrderId,
      machineId,
      operatorId,
      shiftId,
      helperIds,
      quantityProduced,
      scrapQuantity,
      scrapProngkolQty,
      scrapDaunQty,
      bruto,
      bobin,
      cekGram,
      startTime,
      endTime,
      notes,
      userId,
      enteredQuantity,
      enteredUnit,
      baseQuantityProduced,
      conversionFactorSnapshot,
    } = data;

    await prisma.$transaction(async (tx) => {
      const resolved = await resolveOutputQuantity({
        productionOrderId,
        quantityProduced: Number(quantityProduced),
        enteredQuantity:
          enteredQuantity !== undefined ? Number(enteredQuantity) : undefined,
        enteredUnit: enteredUnit as Unit | undefined,
        baseQuantityProduced:
          baseQuantityProduced !== undefined
            ? Number(baseQuantityProduced)
            : undefined,
        conversionFactorSnapshot:
          conversionFactorSnapshot !== undefined
            ? Number(conversionFactorSnapshot)
            : undefined,
        tx,
      });
      const resolvedBaseQty = resolved.baseQty;

      // Validate: qty=0 only allowed for REWORK orders
      if (resolvedBaseQty === 0) {
        const checkOrder = await tx.productionOrder.findUniqueOrThrow({
          where: { id: productionOrderId },
          include: { bom: { select: { category: true } } },
        });
        if (checkOrder.bom?.category !== "REWORK") {
          throw new ProductionRuleViolationError(
            "Output quantity must be greater than 0 for non-Rework orders",
          );
        }
      }

      const executionData: {
        productionOrderId: string;
        machineId?: string | null;
        operatorId?: string | null;
        shiftId?: string | null;
        startTime: Date;
        endTime?: Date | null;
        quantityProduced: number;
        scrapQuantity: number;
        notes?: string | null;
        scrapProngkolQty?: number;
        scrapDaunQty?: number;
        bruto?: number | null;
        bobin?: number | null;
        cekGram?: string | null;
        enteredQuantity?: number | null;
        enteredUnit?: Unit | null;
        conversionFactorSnapshot?: number | null;
        helpers?: { connect: { id: string }[] };
      } = {
        productionOrderId,
        machineId,
        operatorId,
        shiftId,
        startTime,
        endTime,
        quantityProduced: resolvedBaseQty,
        scrapQuantity: Number(scrapQuantity),
        notes,
        enteredQuantity: resolved.enteredQty,
        enteredUnit: resolved.enteredUnit,
        conversionFactorSnapshot: resolved.conversionSnapshot,
      };
      if (scrapProngkolQty !== undefined)
        executionData.scrapProngkolQty = Number(scrapProngkolQty);
      if (scrapDaunQty !== undefined)
        executionData.scrapDaunQty = Number(scrapDaunQty);
      if (bruto !== undefined) executionData.bruto = Number(bruto);
      if (bobin !== undefined) executionData.bobin = Number(bobin);
      if (cekGram !== undefined) executionData.cekGram = cekGram;
      if (helperIds && helperIds.length > 0) {
        executionData.helpers = { connect: helperIds.map((id) => ({ id })) };
      }

      const execution = await tx.productionExecution.create({
        data: executionData,
      });

      const additionalScrap =
        Number(scrapProngkolQty ?? 0) + Number(scrapDaunQty ?? 0);
      await processOutputAndBackflush({
        tx,
        productionOrderId,
        resolvedBaseQty,
        scrapQuantity: Number(scrapQuantity),
        userId,
        resolved,
        referencePrefix: "Backflush (Batch)",
        additionalScrapQty: additionalScrap,
      });

      await recordExecutionScrap({
        tx,
        productionOrderId,
        executionId: execution.id,
        scrapQuantity: Number(scrapQuantity),
        scrapProngkolQty: Number(scrapProngkolQty ?? 0),
        scrapDaunQty: Number(scrapDaunQty ?? 0),
        userId,
      });
    });
  }

  /**
   * Get Active Executions
   */
  static async getActiveExecutions() {
    return await prisma.productionExecution.findMany({
      where: {
        endTime: { equals: null },
      },
      include: {
        productionOrder: {
          select: {
            orderNumber: true,
            bom: {
              select: {
                productVariant: { select: { name: true } },
              },
            },
          },
        },
        operator: true,
        machine: true,
      },
      orderBy: {
        startTime: "desc",
      },
    });
  }

  /**
   * Record Machine Downtime
   */
  static async recordDowntime(
    data: LogMachineDowntimeValues & { createdById?: string },
  ) {
    const { machineId, reason, startTime, endTime, createdById } = data;
    await prisma.machineDowntime.create({
      data: {
        machineId,
        reason,
        startTime,
        endTime,
        createdById,
      },
    });
  }

  /**
   * Void a Production Execution (Reverses stock movements and output totals)
   */
  static async voidExecution(executionId: string, _userId?: string) {
    await prisma.$transaction(async (tx) => {
      const execution = await tx.productionExecution.findUnique({
        where: { id: executionId },
        include: { productionOrder: true },
      });

      if (!execution)
        throw new NotFoundError("ProductionExecution", executionId);
      if (execution.status === "VOIDED")
        throw new ConflictError("Execution has already been voided");
      if (execution.status !== "COMPLETED")
        throw new ProductionRuleViolationError(
          "Only completed executions can be voided",
        );

      const { productionOrderId, quantityProduced, createdAt } = execution;

      // 1. Isolate the execution's own movement window so nearby executions on the same
      //    work order are not accidentally reversed together.
      const marginMs = 30000;
      const adjacentExecutions = await tx.productionExecution.findMany({
        where: { productionOrderId, id: { not: executionId } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      const previousExecution =
        adjacentExecutions.filter((e) => e.createdAt < createdAt).at(-1) ??
        null;
      const nextExecution =
        adjacentExecutions.find((e) => e.createdAt > createdAt) ?? null;

      const startTime = previousExecution
        ? new Date(
            (previousExecution.createdAt.getTime() + createdAt.getTime()) / 2,
          )
        : new Date(createdAt.getTime() - marginMs);
      const endTime = nextExecution
        ? new Date(
            (nextExecution.createdAt.getTime() + createdAt.getTime()) / 2,
          )
        : new Date(createdAt.getTime() + marginMs);

      const movements = await tx.stockMovement.findMany({
        where: {
          productionOrderId,
          createdAt: nextExecution
            ? { gte: startTime, lt: endTime }
            : { gte: startTime, lte: endTime },
        },
      });

      // 2. Reverse Stock Movements
      for (const move of movements) {
        // Prevent recursive voids
        if (move.reference && move.reference.startsWith("VOID:")) continue;

        if (move.type === MovementType.IN) {
          // Reversing Finished Goods IN -> OUT
          await InventoryCoreService.deductStock(
            tx,
            move.toLocationId!,
            move.productVariantId,
            Number(move.quantity),
          );
          const rev = await tx.stockMovement.create({
            data: {
              type: MovementType.OUT,
              productVariantId: move.productVariantId,
              fromLocationId: move.toLocationId,
              quantity: move.quantity,
              reference: `VOID: ${move.reference}`,
              productionOrderId,
            },
          });
          await AccountingService.recordInventoryMovement(rev, tx);
        } else if (move.type === MovementType.OUT) {
          // Reversing Backflush OUT -> IN
          await InventoryCoreService.incrementStock(
            tx,
            move.fromLocationId!,
            move.productVariantId,
            Number(move.quantity),
          );
          const rev = await tx.stockMovement.create({
            data: {
              type: MovementType.IN,
              productVariantId: move.productVariantId,
              toLocationId: move.fromLocationId,
              quantity: move.quantity,
              reference: `VOID: ${move.reference}`,
              productionOrderId,
            },
          });
          await AccountingService.recordInventoryMovement(rev, tx);
        }
      }

      // 3. Mark Material Issues as VOIDED (Consumption records)
      await tx.materialIssue.updateMany({
        where: {
          productionOrderId,
          issuedAt: nextExecution
            ? { gte: startTime, lt: endTime }
            : { gte: startTime, lte: endTime },
        },
        data: { status: "VOIDED" },
      });

      // 4. Update Production Order Totals & Status
      const currentOrder = await tx.productionOrder.findUniqueOrThrow({
        where: { id: productionOrderId },
      });
      const newTotal = Math.max(
        0,
        (currentOrder.actualQuantity
          ? Number(currentOrder.actualQuantity)
          : 0) - Number(quantityProduced),
      );

      // Check remaining active executions
      const activeExecutionsCount = await tx.productionExecution.count({
        where: {
          productionOrderId,
          id: { not: executionId },
          status: "COMPLETED",
        },
      });

      let newStatus: ProductionStatus = currentOrder.status;
      if (activeExecutionsCount === 0) {
        newStatus = ProductionStatus.DRAFT; // Back to before-release state
      } else if (newTotal < Number(currentOrder.plannedQuantity)) {
        newStatus = ProductionStatus.IN_PROGRESS;
      }

      await tx.productionOrder.update({
        where: { id: productionOrderId },
        data: {
          actualQuantity: newTotal,
          status: newStatus,
        },
      });

      // 5. Update Execution status to VOIDED
      await tx.productionExecution.update({
        where: { id: executionId },
        data: { status: "VOIDED" },
      });
    });
  }
}
