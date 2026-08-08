import { prisma } from '@/lib/core/prisma';
import { Prisma, ProductionRunStatus } from '@prisma/client';
import {
    BusinessRuleError,
    NotFoundError,
    ValidationError,
} from '@/lib/errors/errors';
import { ProductionRoutingService } from './routing-service';
import { createProductionOrderWithGeneratedNumber } from './order-number-service';
import { computeReadiness } from './routing-readiness-policy';
import { voidProductionExecutionInTransaction } from './execution-void-helper';
import {
    resolveWipSourceLocationId,
    type OrderWithRoute,
} from './routing-execution-guard';

function genRunNumber(): string {
    const date = new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '')
        .slice(2);
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `RUN-${date}-${rand}`;
}

export class ProductionRoutingRunService {
    static async listRuns(filter?: {
        productVariantId?: string;
        status?: ProductionRunStatus;
        routeId?: string;
        salesOrderId?: string;
        search?: string;
    }) {
        return prisma.productionRun.findMany({
            where: {
                ...(filter?.productVariantId
                    ? { productVariantId: filter.productVariantId }
                    : {}),
                ...(filter?.status ? { status: filter.status } : {}),
                ...(filter?.routeId ? { routeId: filter.routeId } : {}),
                ...(filter?.salesOrderId
                    ? { salesOrderId: filter.salesOrderId }
                    : {}),
                ...(filter?.search
                    ? {
                          OR: [
                              {
                                  runNumber: {
                                      contains: filter.search,
                                      mode: 'insensitive' as const,
                                  },
                              },
                              {
                                  routeNameSnapshot: {
                                      contains: filter.search,
                                      mode: 'insensitive' as const,
                                  },
                              },
                          ],
                      }
                    : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: {
                productVariant: {
                    select: {
                        id: true,
                        name: true,
                        skuCode: true,
                        product: { select: { name: true } },
                    },
                },
                route: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        version: true,
                        status: true,
                    },
                },
                orders: {
                    select: {
                        id: true,
                        orderNumber: true,
                        status: true,
                        plannedQuantity: true,
                        actualQuantity: true,
                        routeSequenceSnapshot: true,
                        processNameSnapshot: true,
                        machineId: true,
                    },
                    orderBy: { routeSequenceSnapshot: 'asc' },
                },
            },
        });
    }

    static async getRunById(id: string) {
        const run = await prisma.productionRun.findUnique({
            where: { id },
            include: {
                productVariant: {
                    select: {
                        id: true,
                        name: true,
                        skuCode: true,
                        product: { select: { name: true } },
                    },
                },
                route: {
                    include: {
                        steps: {
                            orderBy: { sequence: 'asc' },
                            include: {
                                process: true,
                                bom: true,
                                outputLocation: true,
                                materialSourceLocation: true,
                            },
                        },
                    },
                },
                orders: {
                    orderBy: { routeSequenceSnapshot: 'asc' },
                    include: {
                        bom: {
                            select: {
                                id: true,
                                name: true,
                                productVariantId: true,
                                outputQuantity: true,
                                items: {
                                    select: {
                                        productVariantId: true,
                                        quantity: true,
                                    },
                                },
                            },
                        },
                        machine: {
                            select: { id: true, name: true, code: true },
                        },
                        location: {
                            select: { id: true, name: true, slug: true },
                        },
                        sourceLocation: {
                            select: { id: true, name: true, slug: true },
                        },
                        routeStep: {
                            select: {
                                id: true,
                                stepCode: true,
                                label: true,
                                processId: true,
                                allowsPartialHandoff: true,
                                sequence: true,
                            },
                        },
                    },
                },
                salesOrder: { select: { id: true, orderNumber: true } },
            },
        });
        if (!run) throw new NotFoundError('ProductionRun', id);
        return run;
    }

    /**
     * Idempotency key store for run number collision-safe generation
     */
    static async generateRunNumber(
        tx: Prisma.TransactionClient,
    ): Promise<string> {
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = genRunNumber();
            const exists = await tx.productionRun.findUnique({
                where: { runNumber: candidate },
                select: { id: true },
            });
            if (!exists) return candidate;
        }
        // fallback: timestamp based
        return `RUN-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    }

    /**
     * Compute planned output quantity per step working backwards from final FG qty.
     *
     * Algorithm:
     * - Walk steps from last (FG) to first (RM).
     * - Track `requiredOfOutput` = how much output variant the downstream step needs.
     * - For each step: recipeRuns = ceil(requiredOfOutput / bom.outputQuantity).
     *   stepOutputQty = recipeRuns × bom.outputQuantity (actual output this step produces).
     * - For upstream requirement: find downstream BOM item that consumes this step's output variant.
     *   upstreamRequired = stepOutputQty × (item.quantity / bom.outputQuantity) × (1 + item.scrapPercentage/100).
     *
     * Key invariants:
     * - Result map stores stepOutputQty (total output quantity for the step).
     * - Scrap is applied only once per hop (in upstream calc), never in stepQty itself.
     * - BomItem.quantity is per outputQuantity unit, so ratio = itemQty / outputQty.
     */
    static computeStepQuantities(
        routeSteps: Array<{
            bom: {
                outputQuantity: unknown;
                productVariantId?: string;
                items: Array<{
                    quantity: unknown;
                    scrapPercentage?: unknown;
                    productVariantId: string;
                }>;
            };
            sequence: number;
        }>,
        finalQty: number,
    ): Map<number, number> {
        const result = new Map<number, number>();
        const sortedAsc = [...routeSteps].sort(
            (a, b) => a.sequence - b.sequence,
        );
        const sortedDesc = [...sortedAsc].reverse();

        let requiredOfOutput = finalQty;

        for (let idx = 0; idx < sortedDesc.length; idx++) {
            const step = sortedDesc[idx];
            const outputQty = Number(step.bom.outputQuantity ?? 1) || 1;

            const recipeRuns = Math.ceil(requiredOfOutput / outputQty - 1e-9);
            const stepOutputQty = recipeRuns * outputQty;
            result.set(step.sequence, stepOutputQty);

            if (idx < sortedDesc.length - 1) {
                const upstreamStep = sortedDesc[idx + 1];
                const upstreamOutputVariant = upstreamStep.bom.productVariantId;
                if (upstreamOutputVariant) {
                    const consumingItem = step.bom.items.find(
                        (it) => it.productVariantId === upstreamOutputVariant,
                    );
                    if (consumingItem) {
                        const itemQty =
                            Number(consumingItem.quantity ?? 1) || 1;
                        const scrap = Number(
                            (consumingItem as { scrapPercentage?: unknown })
                                .scrapPercentage ?? 0,
                        );
                        requiredOfOutput =
                            stepOutputQty *
                            (itemQty / outputQty) *
                            (1 + scrap / 100);
                    } else {
                        requiredOfOutput = stepOutputQty;
                    }
                } else {
                    requiredOfOutput = stepOutputQty;
                }
            }
        }

        return result;
    }

    /**
     * Dry-run preview — same query as createRun but read-only, reuses computeStepQuantities.
     * Returns per-step qty that would be generated. No DB write, no transaction.
     */
    static async previewRunQuantities(
        routeId: string,
        finalQty: number,
    ): Promise<
        Array<{
            sequence: number;
            label: string;
            stepCode: string;
            processCode: string;
            bomName: string;
            stepOutputQty: number;
            recipeRuns: number;
        }>
    > {
        if (finalQty <= 0)
            throw new ValidationError('plannedQuantity harus > 0');
        const route = await ProductionRoutingService.getRouteById(routeId);
        if (route.status !== 'ACTIVE')
            throw new BusinessRuleError(
                'Hanya ACTIVE route yang bisa di-preview',
                undefined,
                'ROUTE_NOT_ACTIVE',
            );
        if (route.steps.length === 0)
            throw new BusinessRuleError(
                'Route tidak punya steps',
                undefined,
                'ROUTE_NO_STEPS',
            );

        const stepQtyMap = ProductionRoutingRunService.computeStepQuantities(
            route.steps.map((s) => ({
                bom: {
                    outputQuantity: s.bom.outputQuantity,
                    productVariantId: s.bom.productVariantId,
                    items: s.bom.items as never,
                },
                sequence: s.sequence,
            })),
            finalQty,
        );

        const sortedAsc = [...route.steps].sort(
            (a, b) => a.sequence - b.sequence,
        );
        return sortedAsc.map((step) => {
            const stepOutputQty = stepQtyMap.get(step.sequence) ?? finalQty;
            const outputQty = Number(step.bom.outputQuantity ?? 1) || 1;
            const recipeRuns = Math.ceil(stepOutputQty / outputQty - 1e-9);
            return {
                sequence: step.sequence,
                label: step.label,
                stepCode: step.stepCode,
                processCode: step.process.code,
                bomName: step.bom.name,
                stepOutputQty,
                recipeRuns,
            };
        });
    }

    /**
     * Create a production run from an ACTIVE route + create N ProductionOrders
     * Atomically — if any step fails, whole run is rolled back.
     * Quantity scaling: backwards from FG using BOM outputQuantity + scrap.
     */
    static async createRun(data: {
        routeId: string;
        plannedQuantity: number;
        salesOrderId?: string | null;
        priority?: 'URGENT' | 'NORMAL' | 'LOW';
        plannedStartDate?: Date | null;
        plannedEndDate?: Date | null;
        notes?: string | null;
        createdById?: string;
        idempotencyKey?: string;
    }) {
        if (data.plannedQuantity <= 0)
            throw new ValidationError('plannedQuantity harus > 0');

        const route = await ProductionRoutingService.getRouteById(data.routeId);
        if (route.status !== 'ACTIVE')
            throw new BusinessRuleError(
                'Hanya ACTIVE route yang bisa dipakai membuat run',
                undefined,
                'ROUTE_NOT_ACTIVE',
            );
        if (route.steps.length === 0)
            throw new BusinessRuleError(
                'Route tidak punya steps',
                undefined,
                'ROUTE_NO_STEPS',
            );

        const { valid, issues } = await ProductionRoutingService.validateRoute(
            data.routeId,
        );
        if (!valid) {
            throw new BusinessRuleError(
                `Route tidak valid saat create run: ${issues
                    .filter((i) => i.severity === 'BLOCKING')
                    .map((i) => i.message)
                    .join('; ')}`,
                { issues },
                'ROUTE_VALIDATION_FAILED',
            );
        }

        // Idempotency check before tx if key provided
        if (data.idempotencyKey) {
            const existing = await prisma.productionRun.findUnique({
                where: { idempotencyKey: data.idempotencyKey },
            });
            if (existing) return existing;
        }

        const stepQtyMap = ProductionRoutingRunService.computeStepQuantities(
            route.steps.map((s) => ({
                bom: {
                    outputQuantity: s.bom.outputQuantity,
                    productVariantId: s.bom.productVariantId,
                    items: s.bom.items as never,
                },
                sequence: s.sequence,
            })),
            data.plannedQuantity,
        );

        const attemptCreate = async (retries = 5): Promise<unknown> => {
            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    return await prisma.$transaction(async (tx) => {
                        const runNumber =
                            await ProductionRoutingRunService.generateRunNumber(
                                tx,
                            );

                        const run = await tx.productionRun.create({
                            data: {
                                runNumber,
                                routeId: route.id,
                                routeVersionSnapshot: route.version,
                                routeNameSnapshot: route.name,
                                productVariantId: route.productVariantId,
                                plannedQuantity: new Prisma.Decimal(
                                    data.plannedQuantity,
                                ),
                                salesOrderId: data.salesOrderId ?? null,
                                priority: (data.priority as never) ?? 'NORMAL',
                                plannedStartDate: data.plannedStartDate ?? null,
                                plannedEndDate: data.plannedEndDate ?? null,
                                notes: data.notes ?? null,
                                createdById: data.createdById,
                                idempotencyKey: data.idempotencyKey ?? null,
                                status: 'RELEASED',
                            },
                        });

                        for (let i = 0; i < route.steps.length; i++) {
                            const step = route.steps[i];
                            const outputLocId = step.outputLocationId;
                            if (!outputLocId)
                                throw new BusinessRuleError(
                                    `Step ${step.stepCode} tidak punya output location`,
                                    { stepCode: step.stepCode },
                                    'ROUTE_INVALID_LOCATION',
                                );
                            const locExists = await tx.location.findUnique({
                                where: { id: outputLocId },
                            });
                            if (!locExists)
                                throw new NotFoundError(
                                    'Location',
                                    outputLocId,
                                );
                            const scaledQty =
                                stepQtyMap.get(step.sequence) ??
                                data.plannedQuantity;
                            const plannedQtyDecimal = new Prisma.Decimal(
                                scaledQty,
                            );
                            const materialEntries = await tx.bom.findUnique({
                                where: { id: step.bom.id },
                                include: { items: true },
                            });
                            if (!materialEntries)
                                throw new NotFoundError('Bom', step.bom.id);
                            const orderData: Prisma.ProductionOrderCreateInput =
                                {
                                    bom: { connect: { id: step.bom.id } },
                                    plannedQuantity: plannedQtyDecimal,
                                    plannedStartDate:
                                        data.plannedStartDate ?? new Date(),
                                    plannedEndDate:
                                        data.plannedEndDate ?? undefined,
                                    status: i === 0 ? 'RELEASED' : 'DRAFT',
                                    priority:
                                        (data.priority as never) ?? 'NORMAL',
                                    location: { connect: { id: outputLocId } },
                                    productionRun: { connect: { id: run.id } },
                                    routeStep: { connect: { id: step.id } },
                                    notes: `Run ${runNumber} Step ${i + 1}/${route.steps.length} ${step.label} (scaled ${scaledQty.toFixed(2)} from FG ${data.plannedQuantity})`,
                                    routeSequenceSnapshot: step.sequence,
                                    processCodeSnapshot: step.process.code,
                                    processNameSnapshot: step.process.name,
                                    executionModeSnapshot:
                                        step.process.executionMode,
                                    ...(step.materialSourceLocationId
                                        ? {
                                              sourceLocation: {
                                                  connect: {
                                                      id: step.materialSourceLocationId,
                                                  },
                                              },
                                          }
                                        : {}),
                                    ...(data.salesOrderId
                                        ? {
                                              salesOrder: {
                                                  connect: {
                                                      id: data.salesOrderId,
                                                  },
                                              },
                                          }
                                        : {}),
                                    ...(data.createdById
                                        ? {
                                              createdBy: {
                                                  connect: {
                                                      id: data.createdById,
                                                  },
                                              },
                                          }
                                        : {}),
                                } as unknown as Prisma.ProductionOrderCreateInput;

                            const order =
                                await createProductionOrderWithGeneratedNumber(
                                    tx,
                                    orderData as unknown as Omit<
                                        Prisma.ProductionOrderCreateInput,
                                        'orderNumber'
                                    >,
                                );
                            const plannedMats = materialEntries.items.map(
                                (it) => ({
                                    productionOrderId: order.id,
                                    productVariantId: it.productVariantId,
                                    quantity: new Prisma.Decimal(
                                        it.quantity.toString(),
                                    )
                                        .mul(plannedQtyDecimal)
                                        .div(
                                            new Prisma.Decimal(
                                                materialEntries.outputQuantity?.toString() ||
                                                    '1',
                                            ),
                                        ),
                                }),
                            );
                            if (plannedMats.length > 0)
                                await tx.productionMaterial.createMany({
                                    data: plannedMats,
                                });
                        }

                        // I4: RM ready check for first step (location-aware)
                        const firstStep = route.steps.find(
                            (s) => s.sequence === 0,
                        );
                        if (firstStep) {
                            const firstOrder =
                                await tx.productionOrder.findFirst({
                                    where: {
                                        productionRunId: run.id,
                                        routeSequenceSnapshot: 0,
                                    },
                                    include: {
                                        plannedMaterials: true,
                                        bom: { include: { items: true } },
                                    },
                                });
                            if (
                                firstOrder?.plannedMaterials &&
                                firstOrder.plannedMaterials.length > 0
                            ) {
                                const srcLocId =
                                    firstStep.materialSourceLocationId;
                                let hasShortage = false;
                                for (const pm of firstOrder.plannedMaterials) {
                                    const needed = Number(pm.quantity);
                                    if (needed <= 0) continue;
                                    let available: number;
                                    if (srcLocId) {
                                        const inv =
                                            await tx.inventory.findUnique({
                                                where: {
                                                    locationId_productVariantId:
                                                        {
                                                            locationId:
                                                                srcLocId,
                                                            productVariantId:
                                                                pm.productVariantId,
                                                        },
                                                },
                                                select: { quantity: true },
                                            });
                                        const invQty = inv
                                            ? Number(inv.quantity)
                                            : 0;
                                        const resv =
                                            await tx.stockReservation.aggregate(
                                                {
                                                    where: {
                                                        locationId: srcLocId,
                                                        productVariantId:
                                                            pm.productVariantId,
                                                        status: 'ACTIVE',
                                                    },
                                                    _sum: { quantity: true },
                                                },
                                            );
                                        available = Math.max(
                                            0,
                                            invQty -
                                                (resv._sum.quantity
                                                    ? Number(resv._sum.quantity)
                                                    : 0),
                                        );
                                    } else {
                                        const invAgg =
                                            await tx.inventory.aggregate({
                                                where: {
                                                    productVariantId:
                                                        pm.productVariantId,
                                                },
                                                _sum: { quantity: true },
                                            });
                                        const invQty = invAgg._sum.quantity
                                            ? Number(invAgg._sum.quantity)
                                            : 0;
                                        const resv =
                                            await tx.stockReservation.aggregate(
                                                {
                                                    where: {
                                                        productVariantId:
                                                            pm.productVariantId,
                                                        status: 'ACTIVE',
                                                    },
                                                    _sum: { quantity: true },
                                                },
                                            );
                                        available = Math.max(
                                            0,
                                            invQty -
                                                (resv._sum.quantity
                                                    ? Number(resv._sum.quantity)
                                                    : 0),
                                        );
                                    }
                                    if (available < needed) {
                                        hasShortage = true;
                                        break;
                                    }
                                }
                                if (hasShortage) {
                                    await tx.productionOrder.update({
                                        where: { id: firstOrder.id },
                                        data: { status: 'WAITING_MATERIAL' },
                                    });
                                }
                            }
                        }

                        return run;
                    });
                } catch (e: unknown) {
                    const isUniqueViolation =
                        e instanceof Prisma.PrismaClientKnownRequestError &&
                        e.code === 'P2002';
                    if (isUniqueViolation) {
                        // I3: idempotencyKey conflict — return existing run (transaction already rolled back by PG)
                        if (data.idempotencyKey) {
                            const existing =
                                await prisma.productionRun.findUnique({
                                    where: {
                                        idempotencyKey: data.idempotencyKey,
                                    },
                                });
                            if (existing) return existing;
                        }
                        // runNumber collision — retry with fresh transaction
                        if (attempt < retries - 1) continue;
                    }
                    throw e;
                }
            }
            throw new BusinessRuleError(
                'Gagal membuat run setelah retry collision',
                undefined,
                'RUN_CREATE_FAILED',
            );
        };

        return attemptCreate() as Promise<{ id: string; runNumber: string }>;
    }

    /**
     * I4: Check RM availability for first step of run.
     * Returns skuCode + name for each shortage so the UI can display human-readable
     * identifiers instead of raw UUIDs.
     */
    static async checkRmAvailability(runId: string): Promise<{
        ready: boolean;
        shortages: Array<{
            productVariantId: string;
            skuCode: string;
            name: string;
            needed: number;
            available: number;
            shortage: number;
        }>;
    }> {
        const run = await this.getRunById(runId);
        const firstOrder = run.orders.find(
            (o) => (o.routeSequenceSnapshot ?? 0) === 0,
        );
        if (!firstOrder) return { ready: true, shortages: [] };

        // I4: get source location from first step (if specified)
        const sourceLocId = (
            firstOrder as { materialSourceLocationId?: string }
        ).materialSourceLocationId;

        const shortageEntries: Array<{
            productVariantId: string;
            needed: number;
            available: number;
            shortage: number;
        }> = [];

        for (const pm of (
            firstOrder as {
                plannedMaterials?: {
                    productVariantId: string;
                    quantity: unknown;
                }[];
            }
        ).plannedMaterials ?? []) {
            const needed = Number(pm.quantity);
            if (needed <= 0) continue;

            // I4: location-aware — check inventory at source location if specified, else aggregate all
            let available: number;
            if (sourceLocId) {
                const inv = await prisma.inventory.findUnique({
                    where: {
                        locationId_productVariantId: {
                            locationId: sourceLocId,
                            productVariantId: pm.productVariantId,
                        },
                    },
                    select: { quantity: true },
                });
                const invQty = inv ? Number(inv.quantity) : 0;
                // Subtract active reservations at this location
                const resv = await prisma.stockReservation.aggregate({
                    where: {
                        locationId: sourceLocId,
                        productVariantId: pm.productVariantId,
                        status: 'ACTIVE',
                    },
                    _sum: { quantity: true },
                });
                const reserved = resv._sum.quantity
                    ? Number(resv._sum.quantity)
                    : 0;
                available = Math.max(0, invQty - reserved);
            } else {
                const invAgg = await prisma.inventory.aggregate({
                    where: { productVariantId: pm.productVariantId },
                    _sum: { quantity: true },
                });
                const invQty = invAgg._sum.quantity
                    ? Number(invAgg._sum.quantity)
                    : 0;
                // Subtract active reservations across all locations
                const resv = await prisma.stockReservation.aggregate({
                    where: {
                        productVariantId: pm.productVariantId,
                        status: 'ACTIVE',
                    },
                    _sum: { quantity: true },
                });
                const reserved = resv._sum.quantity
                    ? Number(resv._sum.quantity)
                    : 0;
                available = Math.max(0, invQty - reserved);
            }
            if (available < needed) {
                shortageEntries.push({
                    productVariantId: pm.productVariantId,
                    needed,
                    available,
                    shortage: needed - available,
                });
            }
        }

        // Batch-fetch skuCode + name for all shortage variants (single query, no N+1)
        const variantIds = shortageEntries.map((s) => s.productVariantId);
        const variants =
            variantIds.length > 0
                ? await prisma.productVariant.findMany({
                      where: { id: { in: variantIds } },
                      select: { id: true, skuCode: true, name: true },
                  })
                : [];
        const variantMap = new Map(variants.map((v) => [v.id, v]));

        const shortages = shortageEntries.map((entry) => {
            const v = variantMap.get(entry.productVariantId);
            return {
                productVariantId: entry.productVariantId,
                skuCode: v?.skuCode ?? '',
                name: v?.name ?? '',
                needed: entry.needed,
                available: entry.available,
                shortage: entry.shortage,
            };
        });

        return { ready: shortages.length === 0, shortages };
    }

    /**
     * I2: Cancel policy
     * - If any order already has actualQuantity>0 (output posted), require force flag + reversal reason
     * - Audit must be atomic — if actorId provided, audit create must succeed or transaction rollback
     * - If force not provided and has output, throw with details
     */
    static async cancelRun(
        id: string,
        actorId?: string,
        opts?: { force?: boolean; reason?: string },
    ) {
        return prisma.$transaction(async (tx) => {
            // Reload inside the transaction: the cancellation decision must not use a
            // stale run/order snapshot read before the transaction starts.
            const run = await tx.productionRun.findUnique({
                where: { id },
                include: {
                    orders: {
                        select: {
                            id: true,
                            orderNumber: true,
                            status: true,
                            actualQuantity: true,
                        },
                    },
                },
            });
            if (!run) throw new NotFoundError('ProductionRun', id);
            if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
                throw new BusinessRuleError(
                    `Run sudah ${run.status}`,
                    undefined,
                    'RUN_ALREADY_FINAL',
                );
            }

            const activeExec = await tx.productionExecution.findFirst({
                where: {
                    productionOrder: { productionRunId: id },
                    endTime: null,
                },
                select: { id: true, productionOrderId: true },
            });
            if (activeExec) {
                throw new BusinessRuleError(
                    `Tidak bisa cancel run saat SPK ${activeExec.productionOrderId} masih running (execution ${activeExec.id}). Stop execution dulu.`,
                    { activeExecutionId: activeExec.id },
                    'RUN_HAS_ACTIVE_EXECUTION',
                );
            }

            const ordersWithOutput = run.orders.filter(
                (o) => Number(o.actualQuantity ?? 0) > 0,
            );
            if (ordersWithOutput.length > 0 && !opts?.force) {
                throw new BusinessRuleError(
                    `Run sudah punya output (${ordersWithOutput.length} SPK dengan actual >0). Gunakan force cancel dengan reason, atau void output satu per satu.`,
                    {
                        ordersWithOutput: ordersWithOutput.map((o) => ({
                            id: o.id,
                            orderNumber: o.orderNumber,
                            actual: String(o.actualQuantity),
                        })),
                    },
                    'RUN_HAS_OUTPUT',
                );
            }

            if (opts?.force) {
                // Reuse the same transaction-level reversal as manual void. The source
                // marker makes overlapping historical execution windows idempotent.
                const executions = await tx.productionExecution.findMany({
                    where: {
                        productionOrder: { productionRunId: id },
                        status: { not: 'VOIDED' },
                    },
                    select: { id: true },
                    orderBy: { createdAt: 'asc' },
                });
                for (const execution of executions) {
                    await voidProductionExecutionInTransaction(
                        tx,
                        execution.id,
                        {
                            sourceMarker: true,
                            syncRun: false,
                        },
                    );
                }

                // A cancelled run cannot leave a child order active or waiting. Output
                // already reversed by the helper; reset all children before cancellation.
                await tx.productionOrder.updateMany({
                    where: {
                        productionRunId: id,
                        status: { not: 'CANCELLED' },
                    },
                    data: { actualQuantity: 0, status: 'CANCELLED' },
                });
            } else {
                await tx.productionOrder.updateMany({
                    where: {
                        productionRunId: id,
                        status: { notIn: ['COMPLETED', 'CANCELLED'] },
                    },
                    data: { status: 'CANCELLED' },
                });
            }

            await tx.stockReservation.updateMany({
                where: {
                    reservedFor: 'PRODUCTION_ORDER',
                    referenceId: { in: run.orders.map((order) => order.id) },
                    status: { in: ['ACTIVE', 'WAITING'] },
                },
                data: { status: 'CANCELLED' },
            });

            const updatedRun = await tx.productionRun.update({
                where: { id },
                data: { status: 'CANCELLED' },
            });
            if (actorId) {
                await tx.auditLog.create({
                    data: {
                        userId: actorId,
                        action: 'CANCEL_RUN',
                        entityType: 'ProductionRun',
                        entityId: id,
                        details: `Cancel production run ${run.runNumber} with ${run.orders.length} orders${opts?.reason ? ` reason: ${opts.reason}` : ''}${opts?.force ? ' (FORCE with output)' : ''}`,
                        fromStatus: run.status,
                        toStatus: 'CANCELLED',
                        changes: opts?.reason
                            ? JSON.stringify({
                                  reason: opts.reason,
                                  force: opts?.force,
                                  ordersWithOutput: ordersWithOutput.length,
                              })
                            : undefined,
                    },
                });
            }
            return updatedRun;
        });
    }

    static async computeRunProgress(runId: string) {
        const run = await this.getRunById(runId);
        const total = run.orders.length;
        if (total === 0)
            return {
                total: 0,
                completed: 0,
                inProgress: 0,
                percent: 0,
                currentStepLabel: null,
                blockedReason: null,
            };

        const completed = run.orders.filter(
            (o) => o.status === 'COMPLETED',
        ).length;
        const inProgress = run.orders.filter(
            (o) => o.status === 'IN_PROGRESS',
        ).length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        const current = run.orders.find((o) =>
            ['IN_PROGRESS', 'RELEASED', 'WAITING_MATERIAL', 'DRAFT'].includes(
                o.status as string,
            ),
        );
        const currentStepLabel = current
            ? ((current as { processNameSnapshot?: string })
                  .processNameSnapshot ?? current.orderNumber)
            : null;

        return {
            total,
            completed,
            inProgress,
            percent,
            currentStepLabel,
            blockedReason: null as string | null,
        };
    }

    /**
     * Compute readiness for each order in run based on predecessor actual output vs inventory available-unallocated
     */
    static async computeRunReadiness(runId: string) {
        const run = await this.getRunById(runId);
        const sortedOrders = [...run.orders].sort(
            (a, b) =>
                (a.routeSequenceSnapshot ?? 0) - (b.routeSequenceSnapshot ?? 0),
        );

        const readiness: Array<{
            orderId: string;
            status: string;
            canStart: boolean;
            reason?: string;
            available: number;
        }> = [];

        for (let i = 0; i < sortedOrders.length; i++) {
            const order = sortedOrders[i] as (typeof sortedOrders)[0] & {
                sourceLocation?: { id: string } | null;
                routeStep?: { allowsPartialHandoff?: boolean } | null;
                materialSourceLocationId?: string | null;
            };
            if (i === 0) {
                readiness.push({
                    orderId: order.id,
                    status: 'FIRST_STEP',
                    canStart: true,
                    available: 0,
                });
                continue;
            }
            const prev = sortedOrders[i - 1] as (typeof sortedOrders)[0] & {
                bom?: { productVariantId: string } | null;
                actualQuantity?: unknown;
            };

            const downstreamBom = order.bom as
                | {
                      productVariantId?: string;
                      outputQuantity?: unknown;
                      items?: Array<{
                          productVariantId: string;
                          quantity: unknown;
                      }>;
                  }
                | null
                | undefined;
            const bomOutputQty =
                Number(downstreamBom?.outputQuantity ?? 1) || 1;
            const bomItem = downstreamBom?.items?.find(
                (item) => item.productVariantId === prev.bom?.productVariantId,
            );
            const requiredQty =
                (Number(order.plannedQuantity) *
                    (Number(bomItem?.quantity ?? 1) || 1)) /
                bomOutputQty;

            let available = prev.actualQuantity
                ? Number(prev.actualQuantity)
                : 0;

            // G2 consistency fix (plan §0.1): resolve the WIP source location
            // with the exact same resolver the execution guard uses, so the
            // readiness number shown here never disagrees with what actually
            // gates start/reservation. Previously this fell back to the raw
            // sourceLocation relation (same underlying FK) and, when both were
            // empty, silently used unscoped prevActual — never resolving from
            // the predecessor step's outputLocationId the way the guard now does.
            const sourceLocId = await resolveWipSourceLocationId(
                prisma as unknown as Prisma.TransactionClient,
                order as unknown as OrderWithRoute,
                order.routeSequenceSnapshot ?? i,
            );
            if (sourceLocId && prev.bom?.productVariantId) {
                try {
                    const inv = await prisma.inventory.findUnique({
                        where: {
                            locationId_productVariantId: {
                                locationId: sourceLocId,
                                productVariantId: prev.bom.productVariantId,
                            },
                        },
                        select: { quantity: true },
                    });
                    const resv = await prisma.stockReservation.aggregate({
                        where: {
                            locationId: sourceLocId,
                            productVariantId: prev.bom.productVariantId,
                            status: 'ACTIVE',
                            NOT: { referenceId: order.id },
                        },
                        _sum: { quantity: true },
                    });
                    const allocated = await prisma.productionOrder.aggregate({
                        where: {
                            productionRunId: runId,
                            routeSequenceSnapshot: {
                                gt: (order.routeSequenceSnapshot ?? i) - 1,
                            },
                            status: {
                                in: ['RELEASED', 'IN_PROGRESS', 'COMPLETED'],
                            },
                            NOT: { id: order.id },
                        },
                        _sum: { plannedQuantity: true },
                    });
                    const allocatedQty = allocated._sum.plannedQuantity
                        ? Number(allocated._sum.plannedQuantity)
                        : 0;
                    const invQty = inv ? Number(inv.quantity) : 0;
                    const reserved = resv._sum.quantity
                        ? Number(resv._sum.quantity)
                        : 0;
                    const invAvailable = Math.max(0, invQty - reserved);
                    // Match the server guard: physical inventory minus reservations and
                    // quantities already allocated to another downstream order.
                    if (invQty > 0)
                        available = Math.max(0, invAvailable - allocatedQty);
                    else available = Math.max(0, available - allocatedQty);
                } catch {
                    // ignore, use prevActual
                }
            }

            const allowsPartial =
                (
                    order.routeStep as
                        | { allowsPartialHandoff?: boolean }
                        | undefined
                )?.allowsPartialHandoff ?? false;

            const r = computeReadiness({
                isFirstStep: false,
                predecessorOutputAvailable: available,
                requiredQty,
                allowsPartialHandoff: allowsPartial,
                isLegacy: false,
            });
            readiness.push({
                orderId: order.id,
                status: r.status,
                canStart: r.canStart,
                reason: r.reason,
                available,
            });
        }

        return readiness;
    }
}
