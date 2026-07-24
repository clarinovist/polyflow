import { prisma } from '@/lib/core/prisma';

export interface ActiveShiftResult {
  id: string;
  operatorId: string | null;
}

/**
 * Find the active ProductionShift for a given production order and optionally an operator.
 * Active = startTime <= now <= endTime.
 *
 * If operatorId is provided, prefers shift assigned to that operator.
 * Falls back to any active shift for the order if no operator-specific match.
 *
 * Returns shift with its operatorId, or null if no active shift found.
 */
export async function findActiveShift(params: {
  productionOrderId: string;
  operatorId?: string;
}): Promise<ActiveShiftResult | null> {
  const now = new Date();

  // First try: match by operator
  if (params.operatorId) {
    const shift = await prisma.productionShift.findFirst({
      where: {
        productionOrderId: params.productionOrderId,
        startTime: { lte: now },
        endTime: { gte: now },
        operatorId: params.operatorId,
      },
      orderBy: { startTime: 'asc' },
      select: { id: true, operatorId: true },
    });

    if (shift) return shift;
  }

  // Fallback: any active shift for this order (no operator filter)
  const fallbackShift = await prisma.productionShift.findFirst({
    where: {
      productionOrderId: params.productionOrderId,
      startTime: { lte: now },
      endTime: { gte: now },
    },
    orderBy: { startTime: 'asc' },
    select: { id: true, operatorId: true },
  });

  return fallbackShift ?? null;
}
