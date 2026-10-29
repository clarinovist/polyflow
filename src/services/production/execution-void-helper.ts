import { MovementType, Prisma, ProductionStatus, ReservationStatus, ReservationType } from '@prisma/client';
import {
  ConflictError,
  NotFoundError,
  ProductionRuleViolationError,
} from '@/lib/errors/errors';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { reverseProductionMovementJournal } from '@/services/accounting/production-movement-reversal';
import { readCostPeriod, periodFailure } from '@/services/accounting/production-cost-period';
import { getActorUserId } from '@/lib/core/actor-context';
import { logActivity } from '@/lib/tools/audit';
import {
  adjustReservationsForVoidOutput,
  cancelSpecificReservation,
} from '@/services/inventory/reservation-service';
import { reversePackagedExecution } from './packaging-reversal-service';
import { removeZeroCostScrapReceipt } from './zero-cost-scrap-removal';
import { VOID_PIECE_SNAPSHOT } from '@/services/hrd/piece-rate-helpers';
import { syncProductionRunStatusFromOrders } from './routing-execution-guard';
import { completionEndDate } from './order-end-date';

type VoidExecutionOptions = {
  /** Force-cancel uses a source marker so overlapping windows cannot reverse twice. */
  sourceMarker?: boolean;
  syncRun?: boolean;
  userId?: string;
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
  let execution = await tx.productionExecution.findUnique({
    where: { id: executionId },
    include: {
      productionOrder: {
        include: { bom: true },
      },
    },
  });

  if (!execution) throw new NotFoundError('ProductionExecution', executionId);
  await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${execution.productionOrderId} FOR UPDATE`;
  // Re-read after serializing on the WO; another request may have voided it.
  execution = await tx.productionExecution.findUnique({
    where: { id: executionId }, include: { productionOrder: { include: { bom: true } } },
  });
  if (!execution) throw new NotFoundError('ProductionExecution', executionId);
  if (execution.status === 'VOIDED') throw new ConflictError('Eksekusi sudah di-void');
  const costPeriod = await readCostPeriod(tx, execution.productionOrderId);
  if (costPeriod?.executionIds.includes(executionId)) periodFailure('hasil sebelum batas biaya harus tetap utuh; pembatalan memerlukan pemeriksaan khusus');

  // A targeted accounting/inventory correction may be linked to this exact
  // execution. Generic void cannot safely reverse the correction movement and
  // its valuation journal, so fail closed and require the documented manual
  // reversal path instead of double-returning material.
  const targetedCorrection = await tx.auditLog.findFirst({
    where: {
      action: 'CORRECT_PACKING_SCRAP_BACKFLUSH',
      changes: { path: ['executionId'], equals: executionId },
    },
    select: { id: true },
  });
  const scrapCorrection = await tx.auditLog.findFirst({
    where: { action: 'RECONCILE_PRODUCTION_SCRAP', entityType: 'ProductionExecution', entityId: executionId },
    select: { id: true },
  });
  if (targetedCorrection || scrapCorrection) {
    throw new ProductionRuleViolationError(
      'Eksekusi memiliki koreksi stok terverifikasi dan tidak dapat di-void otomatis. Hubungi admin untuk reversal koreksi terlebih dahulu.',
      { executionId, correctionAuditId: (targetedCorrection ?? scrapCorrection)!.id },
    );
  }

  if (execution.endTime === null) {
    throw new ProductionRuleViolationError('Eksekusi masih berjalan, tidak bisa di-void');
  }

  const userId = options.userId ?? getActorUserId();
  if (!userId) throw new ProductionRuleViolationError('Aktor pembatalan wajib tersedia.');
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

  // Generic kiosk outputs also carry idempotency keys; a request ID does not
  // identify the packaging accounting pipeline.
  const isPackaged = execution.productionOrder.actualPackagingEnabled;
  const movements = isPackaged
    ? await reversePackagedExecution(tx, executionId, productionOrderId)
    : await tx.stockMovement.findMany({ where: { productionOrderId, OR: [
        { createdAt: range, productionExecutionId: null },
        { productionExecutionId: executionId, reversalOfId: null },
      ] } });

  if (costPeriod && movements.some(m => costPeriod.movementIds.includes(m.id))) {
    periodFailure('jendela pembatalan menyentuh mutasi sebelum batas biaya');
  }

  // Restore output WIP before crediting it back to raw inventory. The original
  // posting order is usually the opposite, and would falsely fail a zero WIP pool.
  const orderedMovements = [...movements].sort((a, b) =>
    (a.type === 'IN' ? 0 : 1) - (b.type === 'IN' ? 0 : 1) || a.id.localeCompare(b.id),
  );
  for (const move of isPackaged ? [] : orderedMovements) {
    if (move.reference?.startsWith('VOID:') || move.reversalOfId) continue;

    // The durable edge covers manual void and force-cancel; retain legacy markers
    // for already-corrected records instead of writing a second financial inverse.
    const existingReversal = await tx.stockMovement.findFirst({
      where: { OR: [
        { reversalOfId: move.id },
        { productionOrderId, reference: { contains: sourceMarker(move.id) } },
      ] }, select: { id: true },
    });
    if (existingReversal) {
      if (options.sourceMarker) continue;
      throw new ConflictError('Transaksi sumber sudah dibalik.');
    }

    const marker = options.sourceMarker ? ` ${sourceMarker(move.id)}` : '';
    if (move.type === MovementType.IN) {
      if (move.productionExecutionId && move.cost?.isZero()) {
        // Automatic scrap entered at zero allocated cost.
        await removeZeroCostScrapReceipt(tx, move, executionId);
      } else {
        await InventoryCoreService.deductStock(tx, move.toLocationId!, move.productVariantId, Number(move.quantity));
      }
      const reversal = await tx.stockMovement.create({
        data: {
          type: MovementType.OUT,
          productVariantId: move.productVariantId,
          fromLocationId: move.toLocationId,
          quantity: move.quantity,
          cost: move.cost,
          reference: `VOID: ${move.reference ?? move.id}${marker}`,
          productionOrderId, reversalOfId: move.id,
          productionExecutionId: move.productionExecutionId,
          companyOwned: move.companyOwned,
        },
      });
      await reverseProductionMovementJournal(tx, move, reversal, userId);

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
          productionOrderId, reversalOfId: move.id,
        },
      });
      await reverseProductionMovementJournal(tx, move, reversal, userId);
    }
  }

  if (!isPackaged) await tx.materialIssue.updateMany({
    where: { productionOrderId, issuedAt: range, productionExecutionId: null },
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
  const previousEndDate = currentOrder.actualEndDate ?? null;
  const nextEndDate =
    currentOrder.status !== ProductionStatus.COMPLETED || !previousEndDate
      ? previousEndDate
      : newStatus !== ProductionStatus.COMPLETED
        ? null
        : await completionEndDate(tx, productionOrderId, previousEndDate, executionId);
  const endDateChanged = previousEndDate?.getTime() !== nextEndDate?.getTime();

  await tx.productionOrder.update({
    where: { id: productionOrderId },
    data: {
      actualQuantity: newTotal,
      status: newStatus,
      ...(endDateChanged ? { actualEndDate: nextEndDate } : {}),
    },
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
  if (!isPackaged && !hasLinkedReservation && execution.productionOrder.salesOrderId) {
    await adjustReservationsForVoidOutput(
      execution.productionOrder.salesOrderId,
      execution.productionOrder.bom.productVariantId,
      execution.productionOrder.locationId,
      Number(execution.quantityProduced),
      tx,
    );
  }

  await logActivity({ userId, action: 'VOID_PRODUCTION_EXECUTION',
    entityType: 'ProductionExecution', entityId: executionId,
    details: 'Production reversal with original journal accounts and amounts.',
    ...(endDateChanged ? { changes: { orderActualEndDate: {
      from: previousEndDate!.toISOString(),
      to: nextEndDate ? nextEndDate.toISOString() : null,
    } } } : {}),
    tx });
  if (options.syncRun !== false && execution.productionOrder.productionRunId) {
    await syncProductionRunStatusFromOrders(tx, execution.productionOrder.productionRunId);
  }
}
