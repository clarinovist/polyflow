import { prisma } from '@/lib/core/prisma';
import { createHash } from 'node:crypto';
import { logActivity } from '@/lib/tools/audit';
import type { PackagedOutputValues } from '@/lib/schemas/production-packaging';
import { validatePackagedOutput, postPackagedOutput } from './packaging-output-service';
import { ProductionRuleViolationError } from '@/lib/errors/errors';
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
    resolvePackingScrapMaterialId,
    recordExecutionScrap,
    recordExecutionQualityInspection,
    recordFinishedGoodsOutput,
    type ProductionExecutionOrder,
} from './execution-helpers';
import { resolveProductionOutputUnit } from './execution-unit-conversion';
import { resolveShiftAwareLogTimes } from '@/lib/production/execution-business-date';
import { executionScrapTotal } from '@/lib/production/execution-scrap';
import { buildPieceSnapshotForOperator } from '@/services/hrd/piece-rate-helpers';
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

async function preflightPackingScrapMaterial(params: {
    tx: Prisma.TransactionClient;
    productionOrderId: string;
    scrapQuantity: number;
    scrapProngkolQty?: number;
    scrapDaunQty?: number;
}) {
    const normalizedScrap = executionScrapTotal(params);
    if (normalizedScrap <= 0) return;

    const order = await params.tx.productionOrder.findUniqueOrThrow({
        where: { id: params.productionOrderId },
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
    if (order.bom.category !== 'PACKING') return;

    const effectiveMaterials =
        order.plannedMaterials.length > 0
            ? order.plannedMaterials
            : order.bom.items;
    resolvePackingScrapMaterialId(effectiveMaterials);
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
    packagedOutput?: PackagedOutputValues;
    executionId?: string;
    scrapProngkolQty?: number;
    scrapDaunQty?: number;
}) {
    const {
        tx,
        productionOrderId,
        resolvedBaseQty,
        scrapQuantity,
        userId,
        resolved,
        referencePrefix,
        scrapProngkolQty = 0,
        scrapDaunQty = 0,
    } = params;

    const order = await tx.productionOrder.update({
        where: { id: productionOrderId },
        data: { actualQuantity: { increment: resolvedBaseQty } },
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

    if (order.actualPackagingEnabled && !params.packagedOutput) {
        throw new ProductionRuleViolationError('SPK ini memakai kemasan aktual. Catat hasil melalui form kemasan aktual.');
    }
    const actualPackaging = params.packagedOutput
        ? await validatePackagedOutput(tx, order as ProductionExecutionOrder, params.packagedOutput, resolvedBaseQty)
        : null;
    const normalizedScrap = executionScrapTotal({
        scrapQuantity,
        scrapProngkolQty,
        scrapDaunQty,
    });
    // Non-packing recipes preserve the legacy proportional scrap semantics.
    // PACKING carries output units (often BAL) separately from physical affal KG.
    const isPackingOrder = order.bom?.category === 'PACKING';
    const totalConsumed = isPackingOrder
        ? resolvedBaseQty
        : resolvedBaseQty + normalizedScrap;
    const materialValuation = await backflushMaterials({
        tx,
        order: order as ProductionExecutionOrder,
        productionOrderId,
        totalConsumed,
        reference: `${referencePrefix}: WO#${order.orderNumber}`,
        userId,
        executionId: actualPackaging ? params.executionId : undefined,
        actualPackagingIds: actualPackaging?.ids,
        outputContext: {
            enteredQuantity: resolved.enteredQty,
            enteredUnit: resolved.enteredUnit,
            baseQuantity: resolvedBaseQty,
            scrapQuantityKg: isPackingOrder ? normalizedScrap : undefined,
        },
    });

    if (actualPackaging && params.executionId) {
        if (actualPackaging.data.groups.length) await postPackagedOutput(tx, order as ProductionExecutionOrder, params.executionId, actualPackaging.data, userId);
        return order;
    }
    await recordFinishedGoodsOutput({
        tx,
        productionOrderId,
        order: order as ProductionExecutionOrder,
        quantityProduced: resolvedBaseQty,
        materialRoundingAdjustment: materialValuation?.roundingAdjustment,
        reference: `Production Output: WO#${order.orderNumber}`,
    });

    return order;
}

/**
 * Reserved non-login user (migration 20260725) that records kiosk postings.
 * The PIN-verified operator is kept on the execution and in the audit text.
 */
const KIOSK_AUDIT_ACTOR_USER_ID = 'system';

export interface KioskOperatorActor {
    employeeId: string;
    code: string;
}

/**
 * Locks the order and checks replay for an actual-packaging submission.
 * Returns false when the identical request was already posted.
 * Only the admin form may switch an SPK into actual packaging, and only
 * before any execution exists; the kiosk follows the flag Planning set.
 */
async function preparePackagedSubmission(
    tx: Prisma.TransactionClient,
    params: {
        productionOrderId: string;
        clientRequestId: string;
        requestHash: string;
        allowEnable: boolean;
    },
): Promise<boolean> {
    const { productionOrderId, clientRequestId, requestHash } = params;
    await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${productionOrderId} FOR UPDATE`;
    const replay = await tx.productionExecution.findUnique({ where: { clientRequestId } });
    if (replay) {
        if (replay.requestHash !== requestHash || replay.status === 'VOIDED') {
            throw new ProductionRuleViolationError('Permintaan sudah dipakai dengan data berbeda atau dibatalkan.');
        }
        return false;
    }
    const state = await tx.productionOrder.findUniqueOrThrow({ where: { id: productionOrderId } });
    if (!state.actualPackagingEnabled) {
        if (!params.allowEnable) {
            throw new ProductionRuleViolationError('SPK ini belum memakai pencatatan kemasan. Minta Planning menyalakannya sebelum ada hasil.');
        }
        const prior = await tx.productionExecution.count({ where: { productionOrderId } });
        if (prior > 0) throw new ProductionRuleViolationError('Gunakan SPK baru untuk beralih ke kemasan aktual; hasil lama tidak boleh dicampur.');
        await tx.productionOrder.update({ where: { id: productionOrderId }, data: { actualPackagingEnabled: true } });
    }
    if (['CANCELLED', 'CLOSED', 'COMPLETED'].includes(state.status)) throw new ProductionRuleViolationError('SPK tidak dapat menerima hasil baru.');
    return true;
}

/** A single brand group always carries the resolved base output, so display-unit rounding cannot break the group total. */
function withResolvedGroupQuantity(packagedOutput: PackagedOutputValues, baseQty: number): PackagedOutputValues {
    if (packagedOutput.groups.length !== 1 || baseQty <= 0) return packagedOutput;
    return { ...packagedOutput, groups: [{ ...packagedOutput.groups[0], quantity: baseQty }] };
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
                await assertRoutedOrderCanStart(
                    tx,
                    routedOrderForGuard as never,
                );
                await assertMachineCapableForOrder(
                    tx,
                    routedOrderForGuard as never,
                    machineId ?? routedOrderForGuard.machineId,
                );
                await ensureRoutedOrderWipReservation(
                    tx,
                    routedOrderForGuard as never,
                );
            }

            // Handover: if SPK still running (paused without full stop), reassign operator/shift
            const existing = await tx.productionExecution.findFirst({
                where: { productionOrderId, endTime: null },
                orderBy: { startTime: 'desc' },
            });
            if (existing) {
                // I1: check capability if new machine assigned during handover
                if (
                    machineId &&
                    machineId !== existing.machineId &&
                    routedOrderForGuard
                ) {
                    await assertMachineCapableForOrder(
                        tx,
                        routedOrderForGuard as never,
                        machineId,
                    );
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
                await syncProductionRunStatusFromOrders(
                    tx,
                    order.productionRunId,
                );
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
            const orderState = await tx.productionOrder.findUniqueOrThrow({
                where: { id: productionOrderId },
                select: { actualPackagingEnabled: true, isMaklon: true, productionRunId: true },
            });
            const stopScrap = Number(scrapQuantity) + Number(scrapProngkolQty) + Number(scrapDaunQty);
            // Packaging is recorded per output in Catat Hasil; the stop dialog
            // has no packaging step, so it may only close the shell.
            if (orderState.actualPackagingEnabled && (Number(quantityProduced) > 0 || stopScrap > 0)) {
                throw new ProductionRuleViolationError(
                    'SPK ini mencatat kemasan aktual. Catat hasil dan affal terakhir lewat Catat Hasil, lalu hentikan dengan jumlah 0.',
                );
            }
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
            await preflightPackingScrapMaterial({
                tx,
                productionOrderId,
                scrapQuantity: Number(scrapQuantity),
                scrapProngkolQty: Number(scrapProngkolQty),
                scrapDaunQty: Number(scrapDaunQty),
            });

            finalExecution = await tx.productionExecution.update({
                where: { id: executionId },
                data: {
                    endTime: new Date(),
                    quantityProduced: { increment: resolvedBaseQty },
                    scrapQuantity: { increment: scrapQuantity },
                    scrapProngkolQty: { increment: scrapProngkolQty },
                    scrapDaunQty: { increment: scrapDaunQty },
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
                const pendingAdditionalMaterial = await tx.$queryRaw<
                    Array<{ count: bigint }>
                >`
                    SELECT COUNT(*)::bigint AS count
                    FROM "AdditionalMaterialRequest"
                    WHERE "productionOrderId" = ${productionOrderId}
                      AND "status" = 'PENDING'
                `;
                const pendingAdditionalMaterialCount = Number(
                    pendingAdditionalMaterial[0]?.count ?? 0,
                );
                if (pendingAdditionalMaterialCount > 0) {
                    throw new ProductionRuleViolationError(
                        'Masih ada permintaan bahan tambahan yang menunggu konfirmasi gudang. Minta gudang konfirmasi atau tolak sebelum menandai SPK selesai.',
                        {
                            productionOrderId,
                            pendingAdditionalMaterial:
                                pendingAdditionalMaterialCount,
                        },
                    );
                }
                await tx.productionOrder.update({
                    where: { id: productionOrderId },
                    data: { status: ProductionStatus.COMPLETED },
                });
            }

            const order = orderState.actualPackagingEnabled
                ? orderState
                : await processOutputAndBackflush({
                      tx,
                      productionOrderId,
                      resolvedBaseQty,
                      scrapQuantity,
                      userId,
                      resolved,
                      referencePrefix: 'Backflush (Stop)',
                      scrapProngkolQty,
                      scrapDaunQty,
                  });

            if (!orderState.actualPackagingEnabled) {
                await recordExecutionScrap({
                    tx,
                    productionOrderId,
                    executionId,
                    scrapQuantity: Number(scrapQuantity),
                    scrapProngkolQty: Number(scrapProngkolQty),
                    scrapDaunQty: Number(scrapDaunQty),
                    userId,
                });
            }

            if (data.completed && order.isMaklon) {
                await AccountingService.recordMaklonCosts(
                    productionOrderId,
                    tx,
                );
            }

            // B3: sync run status and dates on stop + complete
            if (order.productionRunId) {
                await syncProductionRunStatusFromOrders(
                    tx,
                    order.productionRunId,
                    {
                        triggerOrderId: productionOrderId,
                        completedAt: data.completed ? new Date() : undefined,
                    },
                );
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
        data: LogRunningOutputValues & {
            userId?: string;
            kioskOperator?: KioskOperatorActor;
        },
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
            qcMeasurements = [],
            packagedOutput,
            kioskOperator,
        } = data;

        const actorUserId =
            userId ?? (kioskOperator ? KIOSK_AUDIT_ACTOR_USER_ID : undefined);
        if (packagedOutput && !actorUserId) {
            throw new ProductionRuleViolationError('Aktor pencatatan wajib tersedia.');
        }
        const requestHash = packagedOutput
            ? createHash('sha256').update(JSON.stringify({
                  executionId, operatorId: requestOperatorId, shiftId: explicitShiftId, helperIds,
                  quantityProduced, enteredQuantity, enteredUnit, baseQuantityProduced, conversionFactorSnapshot,
                  scrapQuantity, scrapProngkolQty, scrapDaunQty, notes, photoUrl, qcMeasurements, packagedOutput,
              })).digest('hex')
            : undefined;

        await prisma.$transaction(async (tx) => {
            // 1. Running shell = machine context; operator/shift prefer kiosk login
            const runningExecution =
                await tx.productionExecution.findUniqueOrThrow({
                    where: { id: executionId },
                });

            const productionOrderId = runningExecution.productionOrderId;
            const operatorId = requestOperatorId || runningExecution.operatorId;

            if (packagedOutput) {
                if (!packagedOutput.groups.length && Number(quantityProduced) > 0) {
                    throw new ProductionRuleViolationError('Kelompok hasil wajib diisi.');
                }
                const fresh = await preparePackagedSubmission(tx, {
                    productionOrderId,
                    clientRequestId: packagedOutput.clientRequestId,
                    requestHash: requestHash!,
                    allowEnable: false,
                });
                if (!fresh) return;
            }

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
            await preflightPackingScrapMaterial({
                tx,
                productionOrderId,
                scrapQuantity: Number(scrapQuantity),
                scrapProngkolQty: Number(scrapProngkolQty),
                scrapDaunQty: Number(scrapDaunQty),
            });

            // Keep shell in sync only after all fail-closed validation.
            if (
                operatorId !== runningExecution.operatorId ||
                shiftId !== runningExecution.shiftId
            ) {
                await tx.productionExecution.update({
                    where: { id: executionId },
                    data: { operatorId, shiftId },
                });
            }

            // 3. CREATE a new completed execution (not update the running one!)
            // Shift-aware business time: entri otomatis setelah tengah malam yang
            // masih dalam jangkauan shift di-backdate ke mulai shift (laporan Ika
            // 2026-09-01 — hasil shift malam masuk tanggal shift, bukan tanggal input).
            const shiftForLog = shiftId
                ? await tx.productionShift.findUnique({
                      where: { id: shiftId },
                      select: { startTime: true, endTime: true },
                  })
                : null;
            const logTimes = resolveShiftAwareLogTimes({
                logAt: new Date(),
                clientStart: null,
                clientEnd: null,
                shiftStart: shiftForLog?.startTime ?? null,
                shiftEnd: shiftForLog?.endTime ?? null,
            });
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
                    startTime: logTimes.startTime,
                    endTime: logTimes.endTime,
                    status: 'COMPLETED',
                    pieceRateSnapshot: pieceSnap.pieceRateSnapshot,
                    pieceEarnings: pieceSnap.pieceEarnings,
                    pieceMachineType: pieceSnap.pieceMachineType,
                    clientRequestId: packagedOutput?.clientRequestId,
                    requestHash,
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
                packagedOutput: packagedOutput
                    ? withResolvedGroupQuantity(packagedOutput, resolved.baseQty)
                    : undefined,
                executionId: packagedOutput ? newExecution.id : undefined,
                scrapProngkolQty,
                scrapDaunQty,
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
                linkMovements: Boolean(packagedOutput),
            });

            // 5b. Record QC measurements for this log (no-op kalau varian
            // belum punya parameter terdefinisi — array kosong dari client)
            await recordExecutionQualityInspection({
                tx,
                productionOrderId,
                executionId: newExecution.id,
                measurements: qcMeasurements,
                userId,
            });

            if (packagedOutput) {
                await logActivity({
                    userId: actorUserId!,
                    action: 'RECORD_PACKAGED_OUTPUT',
                    entityType: 'ProductionExecution',
                    entityId: newExecution.id,
                    details: kioskOperator
                        ? `Hasil dan pemakaian kemasan aktual dicatat dari kiosk oleh operator ${kioskOperator.code} (${kioskOperator.employeeId}).`
                        : 'Hasil dan pemakaian kemasan aktual dicatat.',
                    tx,
                });
            }

            // B3: sync run
            const runOrder = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { productionRunId: true },
            });
            if (runOrder?.productionRunId)
                await syncProductionRunStatusFromOrders(
                    tx,
                    runOrder.productionRunId,
                );
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

        const requestHash = data.packagedOutput ? createHash('sha256').update(JSON.stringify({
            productionOrderId, machineId, operatorId, shiftId, helperIds, quantityProduced,
            scrapQuantity, scrapProngkolQty, scrapDaunQty, notes, enteredQuantity, enteredUnit,
            productionDate: data.productionDate, packagedOutput: data.packagedOutput,
            bruto, bobin, cekGram, baseQuantityProduced, conversionFactorSnapshot,
        })).digest('hex') : undefined;
        await prisma.$transaction(async (tx) => {
            if (data.packagedOutput) {
                if (!data.packagedOutput.groups.length && quantityProduced > 0) throw new ProductionRuleViolationError('Kelompok hasil wajib diisi.');
                if (!userId) throw new ProductionRuleViolationError('Aktor pencatatan wajib tersedia.');
                const fresh = await preparePackagedSubmission(tx, {
                    productionOrderId,
                    clientRequestId: data.packagedOutput.clientRequestId,
                    requestHash: requestHash!,
                    allowEnable: true,
                });
                if (!fresh) return;
            }
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
            await preflightPackingScrapMaterial({
                tx,
                productionOrderId,
                scrapQuantity: Number(scrapQuantity),
                scrapProngkolQty: Number(scrapProngkolQty ?? 0),
                scrapDaunQty: Number(scrapDaunQty ?? 0),
            });

            // Validate: shift must belong to the same production order
            let shiftStartForLog: Date | null = null;
            let shiftEndForLog: Date | null = null;
            if (shiftId) {
                const shiftOk = await tx.productionShift.findFirst({
                    where: { id: shiftId, productionOrderId },
                    select: { id: true, startTime: true, endTime: true },
                });
                if (!shiftOk) {
                    throw new ProductionRuleViolationError(
                        'Shift tidak valid untuk SPK ini. Pilih shift yang terdaftar di SPK.',
                    );
                }
                shiftStartForLog = shiftOk.startTime;
                shiftEndForLog = shiftOk.endTime;
            }

            // Explicit WO production dates win; legacy callers retain automatic
            // overnight shift bucketing. Posting timestamps are not backdated.
            const logTimes = resolveShiftAwareLogTimes({
                logAt: new Date(),
                productionDate: data.productionDate,
                clientStart: startTime ?? null,
                clientEnd: endTime ?? null,
                shiftStart: shiftStartForLog,
                shiftEnd: shiftEndForLog,
            });

            // Validate: qty=0 needs something to record — either scrap (mesin trobel,
            // hasil bagus 0 tapi affal keluar) or a REWORK order. Blank entries stay blocked.
            const totalScrapReported =
                Number(scrapQuantity ?? 0) +
                Number(scrapProngkolQty ?? 0) +
                Number(scrapDaunQty ?? 0);
            if (resolvedBaseQty === 0 && totalScrapReported === 0) {
                const checkOrder = await tx.productionOrder.findUniqueOrThrow({
                    where: { id: productionOrderId },
                    include: { bom: { select: { category: true } } },
                });
                if (checkOrder.bom?.category !== 'REWORK') {
                    throw new ProductionRuleViolationError(
                        'Hasil produksi 0 hanya bisa dicatat jika ada affal/scrap. Isi jumlah hasil bagus atau jumlah affal.',
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
                startTime: logTimes.startTime,
                endTime: logTimes.endTime,
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
                data: { ...executionData, clientRequestId: data.packagedOutput?.clientRequestId, requestHash },
            });

            await processOutputAndBackflush({
                tx,
                productionOrderId,
                resolvedBaseQty,
                scrapQuantity: Number(scrapQuantity),
                userId,
                resolved,
                referencePrefix: 'Backflush (Batch)',
                packagedOutput: data.packagedOutput,
                executionId: execution.id,
                scrapProngkolQty,
                scrapDaunQty,
            });

            await recordExecutionScrap({
                tx,
                productionOrderId,
                executionId: execution.id,
                scrapQuantity: Number(scrapQuantity),
                scrapProngkolQty: Number(scrapProngkolQty ?? 0),
                scrapDaunQty: Number(scrapDaunQty ?? 0),
                userId,
                linkMovements: Boolean(data.packagedOutput),
            });

            if (data.packagedOutput) await logActivity({
                userId: userId!, action: 'RECORD_PACKAGED_OUTPUT', entityType: 'ProductionExecution', entityId: execution.id,
                details: 'Hasil dan pemakaian kemasan aktual dicatat.', tx,
            });
            const batchOrder = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { productionRunId: true },
            });
            if (batchOrder?.productionRunId) {
                await syncProductionRunStatusFromOrders(
                    tx,
                    batchOrder.productionRunId,
                );
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
    static async voidExecution(executionId: string, userId?: string) {
        await prisma.$transaction(async (tx) => {
            await voidProductionExecutionInTransaction(tx, executionId, { userId });
        });
    }
}
