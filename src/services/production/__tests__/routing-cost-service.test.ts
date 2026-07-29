import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  productionRun: { findUnique: vi.fn() },
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mockPrisma }));

import { RoutingCostService } from '../routing-cost-service';

describe('RoutingCostService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reconciles persisted output valuation without adding scrap twice', async () => {
    const hour = new Date('2026-07-29T08:00:00.000Z');
    const hourLater = new Date('2026-07-29T09:00:00.000Z');
    mockPrisma.productionRun.findUnique.mockResolvedValue({
      id: 'run-1',
      runNumber: 'RUN-001',
      orders: [
        {
          id: 'order-1', orderNumber: 'WO-1', routeSequenceSnapshot: 0,
          processCodeSnapshot: 'MIX', processNameSnapshot: 'Mix',
          plannedQuantity: 1, actualQuantity: 1,
          bom: { productVariantId: 'wip', outputQuantity: 1 },
          plannedMaterials: [],
          materialIssues: [{ productVariantId: 'raw', quantity: 2 }],
          stockMovements: [
            { type: 'OUT', productVariantId: 'raw', quantity: 2, cost: 100, reference: 'BACKFLUSH' },
          ],
          executions: [{
            status: 'COMPLETED', startTime: hour, endTime: hourLater,
            pieceEarnings: null, scrapQuantity: 1,
            machine: { costPerHour: 10 },
            operator: { dailyRate: 0, standardDayHours: 8, payType: 'TIME' },
          }],
        },
        {
          id: 'order-2', orderNumber: 'WO-2', routeSequenceSnapshot: 1,
          processCodeSnapshot: 'PACK', processNameSnapshot: 'Pack',
          plannedQuantity: 1, actualQuantity: 1,
          bom: { productVariantId: 'fg', outputQuantity: 1 },
          plannedMaterials: [],
          materialIssues: [{ productVariantId: 'wip', quantity: 1 }],
          stockMovements: [
            { type: 'OUT', productVariantId: 'wip', quantity: 1, cost: 210, reference: 'BACKFLUSH' },
            { type: 'IN', productVariantId: 'fg', quantity: 1, cost: 230, reference: 'OUTPUT' },
          ],
          executions: [{
            status: 'COMPLETED', startTime: hour, endTime: hourLater,
            pieceEarnings: null, scrapQuantity: 0,
            machine: { costPerHour: 20 },
            operator: { dailyRate: 0, standardDayHours: 8, payType: 'TIME' },
          }],
        },
      ],
    } as never);

    const result = await RoutingCostService.computeRunCost('run-1');

    expect(result.externalMaterialCost).toBe(200);
    expect(result.internalWipValue).toBe(210);
    expect(result.conversionCost).toBe(30);
    expect(result.scrapCost).toBe(0);
    expect(result.outputMovementValuation).toBe(230);
    expect(result.reconciliationDelta).toBe(0);
    expect(result.totalHppNoDoubleCount).toBe(230);
  });
});
