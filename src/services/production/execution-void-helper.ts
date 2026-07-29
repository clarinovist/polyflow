import { MovementType, Prisma, ProductionStatus, ReservationStatus, ReservationType } from '@prisma/client';
import {
  ConflictError,
  NotFoundError,
  ProductionRuleViolationError,
} from '@/lib/errors/errors';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '../accounting/accounting-service';
import {
  adjustReservationsForVoidOutput,
  cancelSpecificReservation,
} from '@/services/inventory/reservation-service';
import { VOID_PIECE_SNAPSHOT } from '@/services/hrd/piece-rate-helpers';
import { syncProductionRunStatusFromOrders } from './routing-execution-guard';

type VoidExecutionOptions = {
  /** Force-cancel uses a source marker so overlapping windows cannot reverse twice. */
  sourceMarker?: boolean;
  syncRun?: boolean;
};

function sourceMarker(id: string) {
  return `[SOURCE:${id}]`;
}

/**
 * Reverse one completed execution inside the caller's transaction.
 * Both manual void and force-cancel use this helper so inventory, journals,
 * reservations, execution attribution, and piece-rate snapshots stay aligned.
 */
export async function voidProductionExecutionInTransaction(
  tx: Prisma.TransactionClient,
  executionId: string,
  options: VoidExecutionOptions = {},
): Promise<void> {
  const execution = await tx.productionExecution.findUnique({
    where: { id: executionId },
    include: {
      productionOrder: {
        include: { bom: true },
      },
    },
  });

  if (!execution) throw new NotFoundError('ProductionExecution', executionId);
  if (execution.status === 'VOIDED') throw new ConflictError('Eksekusi sudah di-void');
  if (execution.endTime === null) {
    throw new ProductionRuleViolationError('Eksekusi masih berjalan, tidak bisa di-void');
  }

  const { productionOrderId, quantityProduced, createdAt } = execution;
  const adjacentExecutions = await tx.productionExecution.findMany({
    where: { productionOrderId, id: { not: executionId } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  const previousExecution = adjacentExecutions.filter((e) => e.createdAt < createdAt).at(-1) ?? null;
  const nextExecution = adjacentExecutions.find((e) => e.createdAt > createdAt) ?? null;
  const startTime = previousExecution
    ? new Date((previousExecution.createdAt.getTime() + createdAt.getTime()) / 2)
    : new Date(createdAt.getTime() - 30000);
  const endTime = nextExecution
    ? new Date((nextExecution.createdAt.getTime() + createdAt.getTime()) / 2)
    : new Date(createdAt.getTime() + 30000);
  const range = nextExecution ? { gte: startTime, lt: endTime } : { gte: startTime, lte: endTime };

  const movements = await tx.stockMovement.findMany({
    where: { productionOrderId, createdAt: range },
  });

  for (const move of movements) {
    if (move.reference?.startsWith('VOID:')) continue;

    // Force-cancel may process multiple executions whose historical windows
    // overlap. A source marker makes each original movement reversible once.
    if (options.sourceMarker) {
      const existingReversal = await tx.stockMovement.findFirst({
        where: { reference: { contains: sourceMarker(move.id) } },
        select: { id: true },
      });
      if (existingReversal) continue;
    }

    const marker = options.sourceMarker ? ` ${sourceMarker(move.id)}` : '';
    if (move.type === MovementType.IN) {
      await InventoryCoreService.deductStock(tx, move.toLocationId!, move.productVariantId, Number(move.quantity));
      const reversal = await tx.stockMovement.create({
        data: {
          type: MovementType.OUT,
          productVariantId: move.productVariantId,
          fromLocationId: move.toLocationId,
          quantity: move.quantity,
          cost: move.cost,
          reference: `VOID: ${move.reference ?? move.id}${marker}`,
          productionOrderId,
        },
      });
      await AccountingService.recordInventoryMovement(reversal, tx);

      if (move.reference?.includes('| RESERVE:')) {
        const reservationId = move.reference.split('| RESERVE:')[1]?.trim();
        if (reservationId) await cancelSpecificReservation(reservationId, tx);
      }
    } else if (move.type === MovementType.OUT) {
      await InventoryCoreService.incrementStock(tx, move.fromLocationId!, move.productVariantId, Number(move.quantity));
      const reversal = await tx.stockMovement.create({
        data: {
          type: MovementType.IN,
          productVariantId: move.productVariantId,
          toLocationId: move.fromLocationId,
          quantity: move.quantity,
          cost: move.cost,
          reference: `VOID: ${move.reference ?? move.id}${marker}`,
          productionOrderId,
        },
      });
      await AccountingService.recordInventoryMovement(reversal, tx);
    }
  }

  await tx.materialIssue.updateMany({
    where: { productionOrderId, issuedAt: range },
    data: { status: 'VOIDED' },
  });
  // ScrapRecord has no VOIDED status. Delete only this execution's
  // attribution; its stock IN movement is already included in the movement
  // reversal above, so the record must not remain in reporting/costing.
  await tx.scrapRecord.deleteMany({ where: { productionExecutionId: executionId } });

  const currentOrder = await tx.productionOrder.findUniqueOrThrow({ where: { id: productionOrderId } });
  const newTotal = Math.max(0, Number(currentOrder.actualQuantity ?? 0) - Number(quantityProduced));
  const activeExecutionsCount = await tx.productionExecution.count({
    where: { productionOrderId, id: { not: executionId }, status: 'COMPLETED' },
  });
  const newStatus: ProductionStatus = activeExecutionsCount === 0
    ? ProductionStatus.DRAFT
    : newTotal < Number(currentOrder.plannedQuantity)
      ? ProductionStatus.IN_PROGRESS
      : currentOrder.status;

  await tx.productionOrder.update({
    where: { id: productionOrderId },
    data: { actualQuantity: newTotal, status: newStatus },
  });
  if (newStatus === ProductionStatus.DRAFT) {
    await tx.stockReservation.updateMany({
      where: {
        reservedFor: ReservationType.PRODUCTION_ORDER,
        referenceId: productionOrderId,
        status: { in: [ReservationStatus.ACTIVE, ReservationStatus.WAITING] },
      },
      data: { status: ReservationStatus.CANCELLED },
    });
  }
  await tx.productionExecution.update({
    where: { id: executionId },
    data: { status: 'VOIDED', ...VOID_PIECE_SNAPSHOT },
  });

  const hasLinkedReservation = movements.some(
    (m) => m.type === MovementType.IN && m.reference?.includes('| RESERVE:'),
  );
  if (!hasLinkedReservation && execution.productionOrder.salesOrderId) {
    await adjustReservationsForVoidOutput(
      execution.productionOrder.salesOrderId,
      execution.productionOrder.bom.productVariantId,
      execution.productionOrder.locationId,
      Number(execution.quantityProduced),
      tx,
    );
  }

  if (options.syncRun !== false && execution.productionOrder.productionRunId) {
    await syncProductionRunStatusFromOrders(tx, execution.productionOrder.productionRunId);
  }
}
