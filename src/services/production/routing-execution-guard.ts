import { Prisma, ReservationStatus, ReservationType } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { computeReadiness } from './routing-readiness-policy';
import {
    MACHINE_STAGE_MAP_SETTING_KEY,
    getFallbackMachineTypesForProcess,
    isMachineCompatibleWithCategory,
    parseMachineStageMap,
} from '@/lib/production/machine-compatibility';
import { createStockReservation } from '@/services/inventory/reservation-service';

/**
 * Enforce routed order readiness before startExecution / release.
 * - First step always allowed
 * - Non-first: predecessor must have actual output; WIP available from inventory minus reservations if possible
 * - Partial handoff flag checked
 */

type OrderWithRoute = {
  id: string;
  productionRunId: string | null;
  routeStepId: string | null;
  routeSequenceSnapshot: number | null;
  plannedQuantity: Prisma.Decimal;
  status: string;
  materialSourceLocationId: string | null;
  locationId: string;
  machineId: string | null;
  bomId: string;
  bom?: { productVariantId: string };
};

const ALLOWED_START_STATUSES = new Set(['RELEASED', 'WAITING_MATERIAL', 'IN_PROGRESS']);
const ALLOWED_RELEASE_STATUSES = new Set(['DRAFT', 'WAITING_MATERIAL']);

/**
 * Assert that a routed order can transition to targetStatus.
 * - DRAFT → RELEASED: planning release, no WIP readiness check needed (B2 fix).
 * - RELEASED/WAITING_MATERIAL → IN_PROGRESS: execution start, WIP readiness enforced.
 * - IN_PROGRESS → IN_PROGRESS: reassignment, capability check separate.
 */
export async function assertRoutedOrderCanStart(
  tx: Prisma.TransactionClient,
  order: OrderWithRoute,
  targetStatus?: string,
): Promise<void> {
  if (!order.productionRunId || order.routeStepId == null) return; // legacy

  const effectiveTarget = targetStatus ?? order.status;

  // Release transition: DRAFT → RELEASED is always allowed for routed orders (planning action)
  if (effectiveTarget === 'RELEASED' && ALLOWED_RELEASE_STATUSES.has(order.status)) {
    return; // release is a planning transition, no WIP readiness needed
  }

  // Start execution: must be in allowed status
  if (!ALLOWED_START_STATUSES.has(order.status) && effectiveTarget !== 'RELEASED') {
    throw new BusinessRuleError(
      `SPK routing berstatus ${order.status} tidak bisa transisi ke ${effectiveTarget}.`,
      { status: order.status, targetStatus: effectiveTarget, orderId: order.id },
      'ROUTE_INVALID_START_STATUS',
    );
  }

  const step = await tx.productionRouteStep.findUnique({
    where: { id: order.routeStepId },
    select: { sequence: true, allowsPartialHandoff: true, processId: true, requiresQualityGate: true },
  });
  if (!step) return;

  if (step.sequence === 0) return; // first step — RM check separate (I4)

  // Find predecessor order in same run with sequence-1
  const prevOrder = await tx.productionOrder.findFirst({
    where: {
      productionRunId: order.productionRunId,
      routeSequenceSnapshot: step.sequence - 1,
    },
    select: {
      id: true,
      actualQuantity: true,
      status: true,
      bom: { select: { productVariantId: true } },
      routeStep: { select: { requiresQualityGate: true } },
    },
  });

  if (!prevOrder) return;

  // B4: QC gate — if predecessor step requires QC, must have PASS inspection
  if (prevOrder.routeStep?.requiresQualityGate) {
    const inspection = await tx.qualityInspection.findFirst({
      where: { productionOrderId: prevOrder.id },
      orderBy: { inspectedAt: 'desc' },
      select: { result: true },
    });
    if (!inspection || inspection.result !== 'PASS') {
      throw new BusinessRuleError(
        `QC gate predecessor belum PASS — tidak bisa start downstream. Selesaikan QC untuk ${prevOrder.id}.`,
        { predecessorOrderId: prevOrder.id },
        'ROUTE_QC_GATE_BLOCKED',
      );
    }
}

  const prevActual = prevOrder.actualQuantity ? Number(prevOrder.actualQuantity) : 0;

  // B2: handoff ledger — compute available-unallocated WIP
  let availableUnallocated = prevActual;

  if (order.materialSourceLocationId && prevOrder.bom.productVariantId) {
    const inv = await tx.inventory.findUnique({
      where: {
        locationId_productVariantId: {
          locationId: order.materialSourceLocationId,
          productVariantId: prevOrder.bom.productVariantId,
        },
      },
      select: { quantity: true },
    });

    const reservations = await tx.stockReservation.aggregate({
      where: {
        productVariantId: prevOrder.bom.productVariantId,
        locationId: order.materialSourceLocationId,
        status: 'ACTIVE',
        NOT: { referenceId: order.id },
      },
      _sum: { quantity: true },
    });

    const invQty = inv ? Number(inv.quantity) : 0;
    const reservedQty = reservations._sum.quantity ? Number(reservations._sum.quantity) : 0;
    const invAvailable = Math.max(0, invQty - reservedQty);

    // Handoff ledger: sum of plannedQuantity of sibling downstream orders already started
    const downstreamAllocated = await tx.productionOrder.aggregate({
      where: {
        productionRunId: order.productionRunId,
        routeSequenceSnapshot: { gt: step.sequence - 1 },
        status: { in: ['RELEASED', 'IN_PROGRESS', 'COMPLETED'] },
        NOT: { id: order.id },
      },
      _sum: { plannedQuantity: true },
    });
    const allocatedQty = downstreamAllocated._sum.plannedQuantity ? Number(downstreamAllocated._sum.plannedQuantity) : 0;

    if (invQty > 0) {
      availableUnallocated = Math.max(0, invAvailable - allocatedQty);
    } else if (prevActual > 0) {
      availableUnallocated = Math.max(0, prevActual - allocatedQty);
    }
  }

  // B2: WIP required = how much of predecessor variant does this downstream order need?
  // Look up from downstream order's BOM items: find item referencing predecessor output variant.
  // required = downstreamPlannedQty × (bomItemQty / bom.outputQty)
  const downstreamBom = await tx.bom.findUnique({
    where: { id: order.bomId },
    select: { outputQuantity: true, items: { select: { productVariantId: true, quantity: true } } },
  });
  const bomOutputQty = downstreamBom ? Number(downstreamBom.outputQuantity ?? 1) || 1 : 1;
  const bomItem = downstreamBom?.items.find((it) => it.productVariantId === prevOrder.bom.productVariantId);
  const itemQtyPerOutput = bomItem ? Number(bomItem.quantity ?? 1) || 1 : 1;
  const required = Number(order.plannedQuantity) * (itemQtyPerOutput / bomOutputQty);

  const readiness = computeReadiness({
    isFirstStep: false,
    predecessorOutputAvailable: availableUnallocated,
    requiredQty: required,
    allowsPartialHandoff: step.allowsPartialHandoff,
    isLegacy: false,
  });

  if (!readiness.canStart) {
    throw new BusinessRuleError(
      readiness.reason ?? 'SPK tahap downstream belum siap — menunggu WIP predecessor',
      { predecessorOrderId: prevOrder.id, available: availableUnallocated, required, allowsPartial: step.allowsPartialHandoff },
      'ROUTE_WIP_NOT_READY',
    );
  }
}

/**
 * Reserve downstream WIP at release/start time. The inventory row lock in
 * createStockReservation makes two concurrent releases compete atomically.
 */
export async function ensureRoutedOrderWipReservation(
  tx: Prisma.TransactionClient,
  order: OrderWithRoute,
): Promise<void> {
  if (!order.productionRunId || !order.routeStepId || !order.materialSourceLocationId) return;

  const step = await tx.productionRouteStep.findUnique({
    where: { id: order.routeStepId },
    select: { sequence: true },
  });
  if (!step || step.sequence === 0) return;

  const predecessor = await tx.productionOrder.findFirst({
    where: { productionRunId: order.productionRunId, routeSequenceSnapshot: step.sequence - 1 },
    select: { bom: { select: { productVariantId: true } } },
  });
  const predecessorVariantId = predecessor?.bom?.productVariantId;
  if (!predecessorVariantId) return;

  const bom = await tx.bom.findUnique({
    where: { id: order.bomId },
    select: { outputQuantity: true, items: { select: { productVariantId: true, quantity: true } } },
  });
  const outputQty = Number(bom?.outputQuantity ?? 1) || 1;
  const itemQty = Number(bom?.items.find((item) => item.productVariantId === predecessorVariantId)?.quantity ?? 1) || 1;
  const requiredQty = Number(order.plannedQuantity) * itemQty / outputQty;
  if (requiredQty <= 0) return;

  const existing = await tx.stockReservation.findFirst({
    where: {
      reservedFor: ReservationType.PRODUCTION_ORDER,
      referenceId: order.id,
      status: { in: [ReservationStatus.ACTIVE, ReservationStatus.WAITING] },
    },
    select: { id: true },
  });
  if (existing) return;

  await createStockReservation({
    productVariantId: predecessorVariantId,
    locationId: order.materialSourceLocationId,
    quantity: requiredQty,
    reservedFor: ReservationType.PRODUCTION_ORDER,
    referenceId: order.id,
  }, tx);
}

export async function assertMachineCapableForOrder(
  tx: Prisma.TransactionClient,
  order: OrderWithRoute,
  machineId?: string | null,
): Promise<void> {
  const mid = machineId ?? order.machineId;
  if (!mid) return;
  if (!order.routeStepId) return;

  const step = await tx.productionRouteStep.findUnique({
    where: { id: order.routeStepId },
    select: { processId: true, process: { select: { code: true, requiresMachine: true } }, bom: { select: { category: true } } },
  });
  if (!step) return;
  if (!step.process.requiresMachine) return;

  // Primary: capability table
  const anyCap = await tx.machineProcessCapability.findFirst({
    where: { processId: step.processId },
    select: { id: true },
  });

  if (anyCap) {
    const cap = await tx.machineProcessCapability.findUnique({
      where: { machineId_processId: { machineId: mid, processId: step.processId } },
    });
    if (!cap) {
      throw new BusinessRuleError(
        'Mesin tidak capable untuk process tahap ini. Pilih mesin yang sesuai atau tambah capability.',
        { machineId: mid, processId: step.processId },
        'ROUTE_MACHINE_NOT_CAPABLE',
      );
    }
    return;
  }

  // I1 fallback: when capability table empty, check machine type vs process fallback + BomCategory fallback
  const machine = await tx.machine.findUnique({ where: { id: mid }, select: { type: true } });
  if (!machine) return;

  const fallbackTypes = getFallbackMachineTypesForProcess(step.process.code);
  if (fallbackTypes.length > 0) {
    if (!fallbackTypes.includes(machine.type as never)) {
      throw new BusinessRuleError(
        `Mesin type ${machine.type} tidak compatible dengan process ${step.process.code} (fallback requires ${fallbackTypes.join(', ')})`,
        { machineType: machine.type, processCode: step.process.code },
        'ROUTE_MACHINE_NOT_CAPABLE',
      );
    }
    return;
  }

  // Final fallback: BomCategory × MachineType (legacy)
  if (step.bom?.category) {
    const setting = await tx.appSetting.findUnique({
      where: { key: MACHINE_STAGE_MAP_SETTING_KEY },
      select: { value: true },
    });
    const stageMap = parseMachineStageMap(setting?.value);
    if (!isMachineCompatibleWithCategory(machine.type, step.bom.category, stageMap)) {
      throw new BusinessRuleError(
        `Mesin type ${machine.type} tidak compatible dengan stage ${step.bom.category}`,
        { machineType: machine.type, bomCategory: step.bom.category },
        'ROUTE_MACHINE_NOT_CAPABLE',
      );
    }
  }
}

export async function syncProductionRunStatusFromOrders(
  tx: Prisma.TransactionClient,
  productionRunId: string,
  opts?: { triggerOrderId?: string; completedAt?: Date },
): Promise<void> {
  const orders = await tx.productionOrder.findMany({
    where: { productionRunId },
    select: { status: true, actualStartDate: true, actualEndDate: true, updatedAt: true },
  });

  if (orders.length === 0) return;

  const allCompleted = orders.every((o) => o.status === 'COMPLETED');
  const anyInProgress = orders.some((o) => o.status === 'IN_PROGRESS');
  // B3 fix: RELEASED/WAITING_MATERIAL should NOT trigger IN_PROGRESS on run — only actual execution does
  const allCancelled = orders.every((o) => o.status === 'CANCELLED');
  const anyStarted = orders.some((o) => o.actualStartDate != null);

  let newStatus: string | null = null;
  if (allCancelled) newStatus = 'CANCELLED';
  else if (allCompleted) newStatus = 'COMPLETED';
  else if (anyInProgress || anyStarted) newStatus = 'IN_PROGRESS';
  else newStatus = null;

  // Dates: earliest start, latest end
  const startDates = orders.map((o) => o.actualStartDate).filter(Boolean) as Date[];
  const endDates = orders.map((o) => o.actualEndDate).filter(Boolean) as Date[];
  const earliestStart = startDates.length > 0 ? new Date(Math.min(...startDates.map((d) => d.getTime()))) : null;
  const latestEnd = endDates.length > 0 ? new Date(Math.max(...endDates.map((d) => d.getTime()))) : null;

  if (newStatus) {
    const current = await tx.productionRun.findUnique({
      where: { id: productionRunId },
      select: { status: true, actualStartDate: true, actualEndDate: true },
    });
    if (current && current.status !== newStatus) {
      const order = ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
      const curIdx = order.indexOf(current.status);
      const newIdx = order.indexOf(newStatus);
      if (newIdx > curIdx || newStatus === 'CANCELLED') {
        const updateData: Record<string, unknown> = { status: newStatus as never };

        if (newStatus === 'IN_PROGRESS' && !current.actualStartDate && earliestStart) {
          updateData.actualStartDate = earliestStart;
        } else if (newStatus === 'IN_PROGRESS' && !current.actualStartDate) {
          updateData.actualStartDate = new Date();
        }

        if (newStatus === 'COMPLETED') {
          updateData.actualEndDate = latestEnd ?? opts?.completedAt ?? new Date();
        }

        await tx.productionRun.update({
          where: { id: productionRunId },
          data: updateData as never,
        });
      } else if (newStatus === 'IN_PROGRESS' && !current.actualStartDate && earliestStart) {
        // Already IN_PROGRESS but missing dates — patch dates
        await tx.productionRun.update({
          where: { id: productionRunId },
          data: { actualStartDate: earliestStart } as never,
        });
      }
    } else if (current) {
      // Same status but dates may need update (e.g., first order started after run already IN_PROGRESS)
      if (current.status === 'IN_PROGRESS' && !current.actualStartDate && earliestStart) {
        await tx.productionRun.update({ where: { id: productionRunId }, data: { actualStartDate: earliestStart } as never });
      }
      if (current.status === 'COMPLETED' && !current.actualEndDate && latestEnd) {
        await tx.productionRun.update({ where: { id: productionRunId }, data: { actualEndDate: latestEnd } as never });
      }
    }
  }
}
