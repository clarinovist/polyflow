import { prisma } from '@/lib/core/prisma';
import {
    ProductionRuleViolationError,
} from '@/lib/errors/errors';
import {
    StartExecutionValues,
    StopExecutionValues,
    LogRunningOutputValues,
    ProductionOutputValues,
    LogMachineDowntimeValues,
} from '@/lib/schemas/production';
import {
    ProductionStatus,
    ProductionExecution,
    Unit,
    Prisma,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting-service';
import {
    backflushMaterials,
    recordExecutionScrap,
    recordFinishedGoodsOutput,
    type ProductionExecutionOrder,
} from './execution-helpers';
import { resolveProductionOutputUnit } from './execution-unit-conversion';
import {
  buildPieceSnapshotForOperator,
} from '@/services/hrd/piece-rate-helpers';
import {
  assertRoutedOrderCanStart,
  assertMachineCapableForOrder,
  ensureRoutedOrderWipReservation,
  syncProductionRunStatusFromOrders,
} from './routing-execution-guard';
import { voidProductionExecutionInTransaction } from './execution-void-helper';

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
            'Incomplete output conversion payload. Send enteredQuantity, enteredUnit, baseQuantityProduced, and conversionFactorSnapshot together.',
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
        (currentOrder.actualQuantity
            ? Number(currentOrder.actualQuantity)
            : 0) + resolvedBaseQty;

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
            // Validate: shift must belong to the same production order
            if (shiftId) {
                const shiftOk = await tx.productionShift.findFirst({
                    where: { id: shiftId, productionOrderId },
                    select: { id: true },
                });
                if (!shiftOk) {
                    throw new ProductionRuleViolationError(
                        'Shift tidak valid untuk SPK ini',
                    );
                }
            }

            // ── B1: Routed order readiness guard ──
            const routedOrderForGuard = await tx.productionOrder.findUnique({
              where: { id: productionOrderId },
              select: {
                id: true,
                productionRunId: true,
                routeStepId: true,
                routeSequenceSnapshot: true,
                plannedQuantity: true,
                status: true,
                materialSourceLocationId: true,
                locationId: true,
                machineId: true,
                bomId: true,
                bom: { select: { productVariantId: true } },
              },
            });
            if (routedOrderForGuard) {
              await assertRoutedOrderCanStart(tx, routedOrderForGuard as never);
              await assertMachineCapableForOrder(tx, routedOrderForGuard as never, machineId ?? routedOrderForGuard.machineId);
              await ensureRoutedOrderWipReservation(tx, routedOrderForGuard as never);
            }

            // Handover: if SPK still running (paused without full stop), reassign operator/shift
            const existing = await tx.productionExecution.findFirst({
                where: { productionOrderId, endTime: null },
                orderBy: { startTime: 'desc' },
            });
            if (existing) {
                // I1: check capability if new machine assigned during handover
                if (machineId && machineId !== existing.machineId && routedOrderForGuard) {
                    await assertMachineCapableForOrder(tx, routedOrderForGuard as never, machineId);
                }
                return await tx.productionExecution.update({
                    where: { id: existing.id },
                    data: {
                        operatorId: operatorId ?? existing.operatorId,
                        shiftId: shiftId ?? existing.shiftId,
                        machineId: machineId ?? existing.machineId,
                    },
                });
            }

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
                    status: 'COMPLETED',
                },
            });

            const order = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { status: true, productionRunId: true },
            });

            if (order?.status === ProductionStatus.RELEASED) {
                await tx.productionOrder.update({
                    where: { id: productionOrderId },
                    data: { status: ProductionStatus.IN_PROGRESS },
                });
            }

            // B3: sync run status
            if (order?.productionRunId) {
              await syncProductionRunStatusFromOrders(tx, order.productionRunId);
            }

            return execution;
        });
    }

    /**
     * Stop Execution
     */
    static async stopExecution(
        data: StopExecutionValues & { userId?: string },
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
            userId,
        } = data;

        let finalExecution!: ProductionExecution;
        let resolvedBaseQty = Number(quantityProduced);
        await prisma.$transaction(async (tx) => {
            const existingExecution =
                await tx.productionExecution.findUniqueOrThrow({
                    where: { id: executionId },
                });
            const productionOrderId = existingExecution.productionOrderId;
            const resolved = await resolveOutputQuantity({
                productionOrderId,
                quantityProduced: Number(quantityProduced),
                enteredQuantity:
                    enteredQuantity !== undefined
                        ? Number(enteredQuantity)
                        : undefined,
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
                        currentEnteredQuantity:
                            existingExecution.enteredQuantity,
                        currentEnteredUnit: existingExecution.enteredUnit,
                        nextEnteredQuantity: resolved.enteredQty,
                        nextEnteredUnit: resolved.enteredUnit,
                    }),
                    conversionFactorSnapshot:
                        resolved.conversionSnapshot ??
                        existingExecution.conversionFactorSnapshot,
                },
            });

            const pieceSnap = await buildPieceSnapshotForOperator(tx, {
                operatorId: finalExecution.operatorId,
                machineId: finalExecution.machineId,
                quantityProduced: Number(finalExecution.quantityProduced),
            });
            finalExecution = await tx.productionExecution.update({
                where: { id: executionId },
                data: pieceSnap,
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
                referencePrefix: 'Backflush (Stop)',
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
                await AccountingService.recordMaklonCosts(
                    productionOrderId,
                    tx,
                );
            }

            // B3: sync run status and dates on stop + complete
            if (order.productionRunId) {
              await syncProductionRunStatusFromOrders(tx, order.productionRunId, { triggerOrderId: productionOrderId, completedAt: data.completed ? new Date() : undefined });
            }
        });

        // DELEGATED: Auto-journal posting is recorded under the transaction via recordFinishedGoodsOutput -> AccountingService.recordInventoryMovement

        return finalExecution;
    }

    /**
     * Log Running Output — CREATE a new completed execution per log.
     * Each log output becomes its own execution record with its own photo.
     * The running execution stays active (not modified).
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
            operatorId: requestOperatorId,
            helperIds,
            photoUrl,
            userId,
            shiftId: explicitShiftId,
        } = data;

        await prisma.$transaction(async (tx) => {
            // 1. Running shell = machine context; operator/shift prefer kiosk login
            const runningExecution =
                await tx.productionExecution.findUniqueOrThrow({
                    where: { id: executionId },
                });

            const productionOrderId = runningExecution.productionOrderId;
            const operatorId = requestOperatorId || runningExecution.operatorId;

            // Priority: explicit shiftId from kiosk wizard > auto-detect > running shell
            let shiftId: string | null = runningExecution.shiftId;

            // Validate and use explicit shiftId if provided
            if (explicitShiftId) {
                const validShift = await tx.productionShift.findFirst({
                    where: { id: explicitShiftId, productionOrderId },
                    select: { id: true },
                });
                if (validShift) {
                    shiftId = explicitShiftId;
                }
            }

            // Auto-detect if no explicit shift and operatorId provided
            if (!explicitShiftId && requestOperatorId) {
                const now = new Date();
                const byOperator = await tx.productionShift.findFirst({
                    where: {
                        productionOrderId,
                        startTime: { lte: now },
                        endTime: { gte: now },
                        operatorId: requestOperatorId,
                    },
                    orderBy: { startTime: 'asc' },
                    select: { id: true },
                });
                const activeShift =
                    byOperator ??
                    (await tx.productionShift.findFirst({
                        where: {
                            productionOrderId,
                            startTime: { lte: now },
                            endTime: { gte: now },
                        },
                        orderBy: { startTime: 'asc' },
                        select: { id: true },
                    }));
                if (activeShift) shiftId = activeShift.id;
            }

            // Keep shell in sync so next log / UI shows current operator
            if (
                operatorId !== runningExecution.operatorId ||
                shiftId !== runningExecution.shiftId
            ) {
                await tx.productionExecution.update({
                    where: { id: executionId },
                    data: { operatorId, shiftId },
                });
            }

            // 2. Resolve quantity
            const resolved = await resolveOutputQuantity({
                productionOrderId,
                quantityProduced: Number(quantityProduced),
                enteredQuantity:
                    enteredQuantity !== undefined
                        ? Number(enteredQuantity)
                        : undefined,
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

            // 3. CREATE a new completed execution (not update the running one!)
            const pieceSnap = await buildPieceSnapshotForOperator(tx, {
                operatorId,
                machineId: runningExecution.machineId,
                quantityProduced: resolved.baseQty,
            });
            const newExecution = await tx.productionExecution.create({
                data: {
                    productionOrderId,
                    machineId: runningExecution.machineId,
                    operatorId,
                    shiftId,
                    quantityProduced: resolved.baseQty,
                    scrapQuantity: scrapQuantity || 0,
                    scrapProngkolQty: scrapProngkolQty || 0,
                    scrapDaunQty: scrapDaunQty || 0,
                    enteredQuantity: resolved.enteredQty,
                    enteredUnit: resolved.enteredUnit as Unit,
                    conversionFactorSnapshot: resolved.conversionSnapshot,
                    notes: notes ? `[Log]: ${notes}` : null,
                    photoUrl: photoUrl || null,
                    startTime: new Date(),
                    endTime: new Date(),
                    status: 'COMPLETED',
                    pieceRateSnapshot: pieceSnap.pieceRateSnapshot,
                    pieceEarnings: pieceSnap.pieceEarnings,
                    pieceMachineType: pieceSnap.pieceMachineType,
                    helpers:
                        helperIds && helperIds.length > 0
                            ? { connect: helperIds.map((id) => ({ id })) }
                            : undefined,
                },
            });

            // 4. Process output and backflush
            await processOutputAndBackflush({
                tx,
                productionOrderId,
                resolvedBaseQty: resolved.baseQty,
                scrapQuantity: scrapQuantity || 0,
                userId,
                resolved,
                referencePrefix: 'Backflush (Partial)',
            });

            // 5. Record scrap for this log
            await recordExecutionScrap({
                tx,
                productionOrderId,
                executionId: newExecution.id,
                scrapQuantity: Number(scrapQuantity),
                scrapProngkolQty: Number(scrapProngkolQty),
                scrapDaunQty: Number(scrapDaunQty),
                userId,
            });

            // B3: sync run
            const runOrder = await tx.productionOrder.findUnique({ where: { id: productionOrderId }, select: { productionRunId: true } });
            if (runOrder?.productionRunId) await syncProductionRunStatusFromOrders(tx, runOrder.productionRunId);
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
                    enteredQuantity !== undefined
                        ? Number(enteredQuantity)
                        : undefined,
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

            // Validate: shift must belong to the same production order
            if (shiftId) {
                const shiftOk = await tx.productionShift.findFirst({
                    where: { id: shiftId, productionOrderId },
                    select: { id: true },
                });
                if (!shiftOk) {
                    throw new ProductionRuleViolationError(
                        'Shift tidak valid untuk SPK ini. Pilih shift yang terdaftar di SPK.',
                    );
                }
            }

            // Validate: qty=0 only allowed for REWORK orders
            if (resolvedBaseQty === 0) {
                const checkOrder = await tx.productionOrder.findUniqueOrThrow({
                    where: { id: productionOrderId },
                    include: { bom: { select: { category: true } } },
                });
                if (checkOrder.bom?.category !== 'REWORK') {
                    throw new ProductionRuleViolationError(
                        'Output quantity must be greater than 0 for non-Rework orders',
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
                pieceRateSnapshot?: Prisma.Decimal | null;
                pieceEarnings?: Prisma.Decimal | null;
                pieceMachineType?: import('@prisma/client').MachineType | null;
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
                executionData.helpers = {
                    connect: helperIds.map((id) => ({ id })),
                };
            }

            const pieceSnap = await buildPieceSnapshotForOperator(tx, {
                operatorId,
                machineId,
                quantityProduced: resolvedBaseQty,
            });
            executionData.pieceRateSnapshot = pieceSnap.pieceRateSnapshot;
            executionData.pieceEarnings = pieceSnap.pieceEarnings;
            executionData.pieceMachineType = pieceSnap.pieceMachineType;

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
                referencePrefix: 'Backflush (Batch)',
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

            const batchOrder = await tx.productionOrder.findUnique({ where: { id: productionOrderId }, select: { productionRunId: true } });
            if (batchOrder?.productionRunId) {
              await syncProductionRunStatusFromOrders(tx, batchOrder.productionRunId);
            }
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
                        id: true,
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
                startTime: 'desc',
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
            await voidProductionExecutionInTransaction(tx, executionId);
        });
    }
}
