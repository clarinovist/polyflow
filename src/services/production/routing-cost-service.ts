import { prisma } from '@/lib/core/prisma';
import { NotFoundError } from '@/lib/errors/errors';

type RunCostStep = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  processCode: string | null;
  processName: string | null;
  plannedQty: number;
  actualQty: number | null;
  materialCostExternal: number;
  materialCostInternal: number;
  conversionCost: number;
  scrapQty: number;
};

type RunCostSummary = {
  runId: string;
  runNumber: string;
  steps: RunCostStep[];
  externalMaterialCost: number;
  internalWipValue: number;
  conversionCost: number;
  /** 0 by policy: backflush material movement already includes scrap input. */
  scrapCost: number;
  outputMovementValuation: number;
  reconciliationDelta: number;
  totalHppNoDoubleCount: number;
  totalOutputQty: number;
  hppPerUnit: number;
};

type CostMovement = {
  type: 'IN' | 'OUT';
  productVariantId: string;
  quantity: unknown;
  cost: unknown;
  reference: string | null;
};

function executionConversionCost(execution: {
  status: string;
  startTime: Date;
  endTime: Date | null;
  pieceEarnings: unknown;
  machine: { costPerHour: unknown } | null;
  operator: { dailyRate: unknown; standardDayHours: unknown; payType: string } | null;
}) {
  if (execution.status === 'VOIDED') return 0;
  const end = execution.endTime ?? new Date();
  const hours = Math.max(0, end.getTime() - execution.startTime.getTime()) / 3_600_000;
  const machineCost = hours * Number(execution.machine?.costPerHour ?? 0);
  const laborCost = execution.operator?.payType === 'PIECE' && execution.pieceEarnings != null
    ? Number(execution.pieceEarnings)
    : hours * Number(execution.operator?.dailyRate ?? 0) / Math.max(1, Number(execution.operator?.standardDayHours ?? 8));
  return machineCost + laborCost;
}

/**
 * Routing costing policy:
 * - Actual material cost comes from the persisted issue OUT movement cost at
 *   issue time; never re-price an issued quantity using today's standard cost.
 * - Conversion is actual machine + labor/piece-rate execution cost.
 * - Scrap is already part of backflush material quantity, so ScrapRecord is a
 *   quantity/traceability record and is not added as a second cost.
 * - Final output IN movement valuation is exposed as a reconciliation check,
 *   not added to HPP again (it already carries COGM).
 */
export class RoutingCostService {
  static async computeRunCost(runId: string): Promise<RunCostSummary> {
    const run = await prisma.productionRun.findUnique({
      where: { id: runId },
      include: {
        orders: {
          orderBy: { routeSequenceSnapshot: 'asc' },
          include: {
            bom: { select: { productVariantId: true, outputQuantity: true } },
            plannedMaterials: { include: { productVariant: { select: { standardCost: true } } } },
            materialIssues: { where: { status: { not: 'VOIDED' } }, select: { productVariantId: true, quantity: true } },
            stockMovements: {
              where: { reference: { not: { startsWith: 'VOID:' } } },
              select: { type: true, productVariantId: true, quantity: true, cost: true, reference: true },
            },
            executions: {
              where: { status: { not: 'VOIDED' } },
              select: {
                status: true, startTime: true, endTime: true, pieceEarnings: true,
                machine: { select: { costPerHour: true } },
                operator: { select: { dailyRate: true, standardDayHours: true, payType: true } },
                quantityProduced: true, scrapQuantity: true,
              },
            },
          },
        },
      },
    });
    if (!run) throw new NotFoundError('ProductionRun', runId);

    const outputVariantsInRun = new Set(run.orders.map((o) => o.bom.productVariantId));
    let externalMaterialCost = 0;
    let internalWipValue = 0;
    let conversionCost = 0;
    const steps: RunCostStep[] = [];

    for (const order of run.orders) {
      const movements = order.stockMovements as unknown as CostMovement[];
      let matExternal = 0;
      let matInternal = 0;

      if (order.materialIssues.length > 0) {
        // Movement cost is the historical valuation source. A missing cost is
        // reported as zero rather than silently using today's standard cost.
        for (const move of movements.filter((m) => m.type === 'OUT')) {
          const cost = Number(move.cost ?? 0) * Number(move.quantity ?? 0);
          if (outputVariantsInRun.has(move.productVariantId)) matInternal += cost;
          else matExternal += cost;
        }
      } else {
        // Planned-only rows are an estimate, so standard cost is acceptable
        // until an actual issue movement exists.
        for (const planned of order.plannedMaterials) {
          const cost = Number(planned.productVariant.standardCost ?? 0) * Number(planned.quantity);
          if (outputVariantsInRun.has(planned.productVariantId)) matInternal += cost;
          else matExternal += cost;
        }
      }

      const conv = order.executions.reduce((sum, execution) => sum + executionConversionCost(execution), 0);
      const scrapQty = order.executions.reduce((sum, execution) => sum + Number(execution.scrapQuantity ?? 0), 0);
      externalMaterialCost += matExternal;
      internalWipValue += matInternal;
      conversionCost += conv;
      steps.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        sequence: order.routeSequenceSnapshot ?? 0,
        processCode: order.processCodeSnapshot ?? null,
        processName: order.processNameSnapshot ?? null,
        plannedQty: Number(order.plannedQuantity),
        actualQty: order.actualQuantity ? Number(order.actualQuantity) : null,
        materialCostExternal: matExternal,
        materialCostInternal: matInternal,
        conversionCost: conv,
        scrapQty,
      });
    }

    const finalOrder = run.orders[run.orders.length - 1];
    const finalMovements = (finalOrder?.stockMovements ?? []) as unknown as CostMovement[];
    const outputMovementValuation = finalMovements
      .filter((move) => move.type === 'IN')
      .reduce((sum, move) => sum + Number(move.cost ?? 0) * Number(move.quantity ?? 0), 0);
    const totalHppNoDoubleCount = externalMaterialCost + conversionCost;
    const totalOutputQty = finalOrder ? Number(finalOrder.actualQuantity ?? finalOrder.plannedQuantity) : 0;

    return {
      runId: run.id,
      runNumber: run.runNumber,
      steps,
      externalMaterialCost,
      internalWipValue,
      conversionCost,
      scrapCost: 0,
      outputMovementValuation,
      reconciliationDelta: outputMovementValuation - totalHppNoDoubleCount,
      totalHppNoDoubleCount,
      totalOutputQty,
      hppPerUnit: totalOutputQty > 0 ? totalHppNoDoubleCount / totalOutputQty : 0,
    };
  }
}
