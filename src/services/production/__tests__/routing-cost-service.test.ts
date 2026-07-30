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

  it('nets original + force-cancel reversal pairs so void does not inflate HPP', async () => {
    const hour = new Date('2026-07-29T08:00:00.000Z');
    const hourLater = new Date('2026-07-29T09:00:00.000Z');
    mockPrisma.productionRun.findUnique.mockResolvedValue({
      id: 'run-void',
      runNumber: 'RUN-VOID',
      orders: [
        {
          id: 'order-1', orderNumber: 'WO-1', routeSequenceSnapshot: 0,
          processCodeSnapshot: 'MIX', processNameSnapshot: 'Mix',
          plannedQuantity: 1, actualQuantity: 1,
          bom: { productVariantId: 'wip', outputQuantity: 1 },
          plannedMaterials: [],
          materialIssues: [{ productVariantId: 'raw', quantity: 2 }],
          stockMovements: [
            { id: 'mov-orig-1', type: 'OUT', productVariantId: 'raw', quantity: 2, cost: 100, reference: 'BACKFLUSH' },
            { id: 'mov-rev-1', type: 'IN', productVariantId: 'raw', quantity: 2, cost: 100, reference: 'VOID: BACKFLUSH [SOURCE:mov-orig-1]' },
          ],
          executions: [{
            status: 'COMPLETED', startTime: hour, endTime: hourLater,
            pieceEarnings: null, scrapQuantity: 0,
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
            { id: 'mov-orig-2', type: 'OUT', productVariantId: 'wip', quantity: 1, cost: 210, reference: 'BACKFLUSH' },
            { id: 'mov-rev-2', type: 'IN', productVariantId: 'wip', quantity: 1, cost: 210, reference: 'VOID: BACKFLUSH [SOURCE:mov-orig-2]' },
            { id: 'mov-out-1', type: 'IN', productVariantId: 'fg', quantity: 1, cost: 320, reference: 'OUTPUT' },
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

    const result = await RoutingCostService.computeRunCost('run-void');

    // Original OUT (100) and its reversal IN cancel → no material cost from order-1
    // Original OUT (210) and its reversal IN cancel → no internal WIP from order-2
    // Conversion still counts: 10 + 20 = 30
    expect(result.externalMaterialCost).toBe(0);
    expect(result.internalWipValue).toBe(0);
    expect(result.conversionCost).toBe(30);
    expect(result.outputMovementValuation).toBe(320);
    expect(result.totalHppNoDoubleCount).toBe(30);
  });

  it('nets original with reference: null + reversal VOID: <id> (G3-FIX a)', async () => {
    const hour = new Date('2026-07-29T08:00:00.000Z');
    const hourLater = new Date('2026-07-29T09:00:00.000Z');
    mockPrisma.productionRun.findUnique.mockResolvedValue({
      id: 'run-null-ref',
      runNumber: 'RUN-NREF',
      orders: [
        {
          id: 'order-1', orderNumber: 'WO-1', routeSequenceSnapshot: 0,
          processCodeSnapshot: 'MIX', processNameSnapshot: 'Mix',
          plannedQuantity: 1, actualQuantity: 1,
          bom: { productVariantId: 'wip', outputQuantity: 1 },
          plannedMaterials: [],
          materialIssues: [{ productVariantId: 'raw', quantity: 2 }],
          stockMovements: [
            { id: 'mov-null-orig', type: 'OUT', productVariantId: 'raw', quantity: 2, cost: 80, reference: null },
            { id: 'mov-null-rev', type: 'IN', productVariantId: 'raw', quantity: 2, cost: 80, reference: 'VOID: mov-null-orig' },
          ],
          executions: [{
            status: 'COMPLETED', startTime: hour, endTime: hourLater,
            pieceEarnings: null, scrapQuantity: 0,
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
          materialIssues: [],
          stockMovements: [
            { id: 'mov-out-fg', type: 'IN', productVariantId: 'fg', quantity: 1, cost: 100, reference: 'OUTPUT' },
          ],
          executions: [{
            status: 'COMPLETED', startTime: hour, endTime: hourLater,
            pieceEarnings: null, scrapQuantity: 0,
            machine: { costPerHour: 5 },
            operator: { dailyRate: 0, standardDayHours: 8, payType: 'TIME' },
          }],
        },
      ],
    } as never);

    const result = await RoutingCostService.computeRunCost('run-null-ref');

    // Original (reference: null) + reversal (VOID: mov-null-orig) cancel → no material cost
    expect(result.externalMaterialCost).toBe(0);
    expect(result.conversionCost).toBe(15);
    expect(result.totalHppNoDoubleCount).toBe(15);
  });

  it('nets two identical originals against two reversals — result is zero, not half (G3-FIX b)', async () => {
    const hour = new Date('2026-07-29T08:00:00.000Z');
    const hourLater = new Date('2026-07-29T09:00:00.000Z');
    mockPrisma.productionRun.findUnique.mockResolvedValue({
      id: 'run-dup',
      runNumber: 'RUN-DUP',
      orders: [
        {
          id: 'order-1', orderNumber: 'WO-1', routeSequenceSnapshot: 0,
          processCodeSnapshot: 'MIX', processNameSnapshot: 'Mix',
          plannedQuantity: 1, actualQuantity: 1,
          bom: { productVariantId: 'wip', outputQuantity: 1 },
          plannedMaterials: [],
          materialIssues: [{ productVariantId: 'raw', quantity: 2 }],
          stockMovements: [
            { id: 'mov-dup-1', type: 'OUT', productVariantId: 'raw', quantity: 2, cost: 50, reference: 'BACKFLUSH' },
            { id: 'mov-dup-2', type: 'OUT', productVariantId: 'raw', quantity: 2, cost: 50, reference: 'BACKFLUSH' },
            { id: 'mov-dup-rev1', type: 'IN', productVariantId: 'raw', quantity: 2, cost: 50, reference: 'VOID: BACKFLUSH [SOURCE:mov-dup-1]' },
            { id: 'mov-dup-rev2', type: 'IN', productVariantId: 'raw', quantity: 2, cost: 50, reference: 'VOID: BACKFLUSH [SOURCE:mov-dup-2]' },
          ],
          executions: [{
            status: 'COMPLETED', startTime: hour, endTime: hourLater,
            pieceEarnings: null, scrapQuantity: 0,
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
          materialIssues: [],
          stockMovements: [
            { id: 'mov-out-fg2', type: 'IN', productVariantId: 'fg', quantity: 1, cost: 200, reference: 'OUTPUT' },
          ],
          executions: [{
            status: 'COMPLETED', startTime: hour, endTime: hourLater,
            pieceEarnings: null, scrapQuantity: 0,
            machine: { costPerHour: 5 },
            operator: { dailyRate: 0, standardDayHours: 8, payType: 'TIME' },
          }],
        },
      ],
    } as never);

    const result = await RoutingCostService.computeRunCost('run-dup');

    // Both originals net against both reversals → zero material cost (not half)
    expect(result.externalMaterialCost).toBe(0);
    expect(result.conversionCost).toBe(15);
    expect(result.totalHppNoDoubleCount).toBe(15);
  });

  it('nets original + manual void reversal pairs (VOID: <reference> format)', async () => {
    const hour = new Date('2026-07-29T08:00:00.000Z');
    const hourLater = new Date('2026-07-29T09:00:00.000Z');
    mockPrisma.productionRun.findUnique.mockResolvedValue({
      id: 'run-manual-void',
      runNumber: 'RUN-MVOID',
      orders: [
        {
          id: 'order-1', orderNumber: 'WO-1', routeSequenceSnapshot: 0,
          processCodeSnapshot: 'MIX', processNameSnapshot: 'Mix',
          plannedQuantity: 1, actualQuantity: 1,
          bom: { productVariantId: 'wip', outputQuantity: 1 },
          plannedMaterials: [],
          materialIssues: [{ productVariantId: 'raw', quantity: 3 }],
          stockMovements: [
            { id: 'mov-a', type: 'OUT', productVariantId: 'raw', quantity: 3, cost: 50, reference: 'Backflush (Stop): WO#1' },
            { id: 'mov-b', type: 'IN', productVariantId: 'raw', quantity: 3, cost: 50, reference: 'VOID: Backflush (Stop): WO#1' },
          ],
          executions: [{
            status: 'COMPLETED', startTime: hour, endTime: hourLater,
            pieceEarnings: null, scrapQuantity: 0,
            machine: { costPerHour: 0 },
            operator: { dailyRate: 0, standardDayHours: 8, payType: 'TIME' },
          }],
        },
        {
          id: 'order-2', orderNumber: 'WO-2', routeSequenceSnapshot: 1,
          processCodeSnapshot: 'PACK', processNameSnapshot: 'Pack',
          plannedQuantity: 1, actualQuantity: 1,
          bom: { productVariantId: 'fg', outputQuantity: 1 },
          plannedMaterials: [],
          materialIssues: [],
          stockMovements: [
            { id: 'mov-c', type: 'IN', productVariantId: 'fg', quantity: 1, cost: 150, reference: 'OUTPUT' },
          ],
          executions: [{
            status: 'COMPLETED', startTime: hour, endTime: hourLater,
            pieceEarnings: null, scrapQuantity: 0,
            machine: { costPerHour: 5 },
            operator: { dailyRate: 0, standardDayHours: 8, payType: 'TIME' },
          }],
        },
      ],
    } as never);

    const result = await RoutingCostService.computeRunCost('run-manual-void');

    // Original OUT and VOID: reversal cancel → no material cost
    // Only conversion from order-2 = 5
    expect(result.externalMaterialCost).toBe(0);
    expect(result.internalWipValue).toBe(0);
    expect(result.conversionCost).toBe(5);
    expect(result.outputMovementValuation).toBe(150);
    expect(result.totalHppNoDoubleCount).toBe(5);
  });
});
