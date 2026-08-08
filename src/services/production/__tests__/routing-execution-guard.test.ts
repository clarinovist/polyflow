import { describe, it, expect, vi, beforeEach } from 'vitest';

type MockFn = ReturnType<typeof vi.fn>;
const mockTx = {
  productionRouteStep: { findUnique: vi.fn(), findFirst: vi.fn() },
  productionOrder: { findFirst: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(async () => ({ _sum: { plannedQuantity: null } })) },
  productionRun: { findUnique: vi.fn(), update: vi.fn() },
  machineProcessCapability: { findFirst: vi.fn(), findUnique: vi.fn() },
  inventory: { findUnique: vi.fn() },
  stockReservation: { aggregate: vi.fn(async () => ({ _sum: { quantity: null } })), findFirst: vi.fn(), updateMany: vi.fn() },
  qualityInspection: { findFirst: vi.fn(async () => null) },
  machine: { findUnique: vi.fn() },
  bom: { findUnique: vi.fn(async () => ({ outputQuantity: 1, items: [{ productVariantId: 'v1', quantity: 1 }] })) },
};

vi.mock('@/lib/core/prisma', () => ({
  prisma: {},
}));

vi.mock('@/services/inventory/reservation-service', () => ({
  createStockReservation: vi.fn(),
}));

import {
  assertRoutedOrderCanStart,
  assertMachineCapableForOrder,
  syncProductionRunStatusFromOrders,
  ensureRoutedOrderWipReservation,
} from '../routing-execution-guard';
import { createStockReservation } from '@/services/inventory/reservation-service';

describe('routing-execution-guard', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('assertRoutedOrderCanStart', () => {
    it('legacy order (no run) skips', async () => {
      const order = { id: 'o1', productionRunId: null, routeStepId: null, routeSequenceSnapshot: null, plannedQuantity: { toString: () => '100' } as never, status: 'DRAFT', materialSourceLocationId: null, locationId: 'loc', machineId: null, bomId: 'bom' } as never;
      await expect(assertRoutedOrderCanStart(mockTx as never, order)).resolves.toBeUndefined();
    });

    it('first step can start when RELEASED', async () => {
      mockTx.productionRouteStep.findUnique.mockResolvedValue({ sequence: 0, allowsPartialHandoff: false, processId: 'p1' });
      const order = { id: 'o1', productionRunId: 'run1', routeStepId: 'step1', routeSequenceSnapshot: 0, plannedQuantity: { toString: () => '100' } as never, status: 'RELEASED', materialSourceLocationId: null, locationId: 'loc', machineId: null, bomId: 'bom' } as never;
      await expect(assertRoutedOrderCanStart(mockTx as never, order)).resolves.toBeUndefined();
    });

    it('first step DRAFT now allowed for release (B2 fix)', async () => {
      mockTx.productionRouteStep.findUnique.mockResolvedValue({ sequence: 0, allowsPartialHandoff: false, processId: 'p1' });
      const order = { id: 'o1', productionRunId: 'run1', routeStepId: 'step1', routeSequenceSnapshot: 0, plannedQuantity: { toString: () => '100' } as never, status: 'DRAFT', materialSourceLocationId: null, locationId: 'loc', machineId: null, bomId: 'bom' } as never;
      await expect(assertRoutedOrderCanStart(mockTx as never, order, 'RELEASED')).resolves.toBeUndefined();
    });

    it('non-first step waiting WIP throws', async () => {
      mockTx.productionRouteStep.findUnique.mockResolvedValue({ sequence: 1, allowsPartialHandoff: false, processId: 'p1', requiresQualityGate: false });
      mockTx.productionOrder.findFirst.mockResolvedValue({ id: 'prev', actualQuantity: { toString: () => '0' } as never, status: 'COMPLETED', bom: { productVariantId: 'v1' }, routeStep: { requiresQualityGate: false } } as never);
      mockTx.inventory.findUnique.mockResolvedValue(null);
      mockTx.stockReservation.aggregate.mockResolvedValue({ _sum: { quantity: null } } as never);
      const order = {
        id: 'o2',
        productionRunId: 'run1',
        routeStepId: 'step2',
        routeSequenceSnapshot: 1,
        plannedQuantity: 100 as never,
        status: 'RELEASED',
        materialSourceLocationId: null,
        locationId: 'loc',
        machineId: null,
        bomId: 'bom2',
      } as unknown as never;
      await expect(assertRoutedOrderCanStart(mockTx as never, order)).rejects.toThrow();
    });

    it('non-first with enough WIP passes', async () => {
      mockTx.productionRouteStep.findUnique.mockResolvedValue({ sequence: 1, allowsPartialHandoff: false, processId: 'p1', requiresQualityGate: false });
      mockTx.productionOrder.findFirst.mockResolvedValue({ id: 'prev', actualQuantity: 150 as never, status: 'COMPLETED', bom: { productVariantId: 'v1' }, routeStep: { requiresQualityGate: false } } as never);
      mockTx.inventory.findUnique.mockResolvedValue(null);
      mockTx.stockReservation.aggregate.mockResolvedValue({ _sum: { quantity: null } } as never);
      mockTx.productionOrder.aggregate = vi.fn(async () => ({ _sum: { plannedQuantity: null } })) as never;
      (mockTx as { qualityInspection?: { findFirst: MockFn } }).qualityInspection = { findFirst: vi.fn(async () => null) } as never;
      const order = {
        id: 'o2',
        productionRunId: 'run1',
        routeStepId: 'step2',
        routeSequenceSnapshot: 1,
        plannedQuantity: 100 as never,
        status: 'RELEASED',
        materialSourceLocationId: null,
        locationId: 'loc',
        machineId: null,
        bomId: 'bom2',
      } as never;
      await expect(assertRoutedOrderCanStart(mockTx as never, order)).resolves.toBeUndefined();
    });

    it('DRAFT routed order blocked for execution start (B2)', async () => {
      const order = {
        id: 'o2',
        productionRunId: 'run1',
        routeStepId: 'step2',
        routeSequenceSnapshot: 1,
        plannedQuantity: 100 as never,
        status: 'DRAFT',
        materialSourceLocationId: null,
        locationId: 'loc',
        machineId: null,
        bomId: 'bom2',
      } as never;
      // DRAFT→IN_PROGRESS not allowed for execution (target not provided, status=DRAFT not in ALLOWED_START_STATUSES)
      await expect(assertRoutedOrderCanStart(mockTx as never, order)).rejects.toThrow('tidak bisa transisi');
    });
  });

  describe('assertMachineCapableForOrder', () => {
    it('no machine skips', async () => {
      const order = { routeStepId: 's1', machineId: null } as never;
      await expect(assertMachineCapableForOrder(mockTx as never, order, null)).resolves.toBeUndefined();
    });

    it('capability exists but mismatch throws', async () => {
      mockTx.productionRouteStep.findUnique.mockResolvedValue({ processId: 'proc1', process: { requiresMachine: true } });
      mockTx.machineProcessCapability.findFirst.mockResolvedValue({ id: 'some' });
      mockTx.machineProcessCapability.findUnique.mockResolvedValue(null);
      const order = { routeStepId: 's1', machineId: 'm1' } as never;
      await expect(assertMachineCapableForOrder(mockTx as never, order, 'm1')).rejects.toThrow();
    });

    it('capable passes', async () => {
      mockTx.productionRouteStep.findUnique.mockResolvedValue({ processId: 'proc1', process: { requiresMachine: true } });
      mockTx.machineProcessCapability.findFirst.mockResolvedValue({ id: 'some' });
      mockTx.machineProcessCapability.findUnique.mockResolvedValue({ id: 'cap1' });
      const order = { routeStepId: 's1', machineId: 'm1' } as never;
      await expect(assertMachineCapableForOrder(mockTx as never, order, 'm1')).resolves.toBeUndefined();
    });
  });

  describe('ensureRoutedOrderWipReservation — G2 source location resolution', () => {
    it('[case 5] step with materialSourceLocationId reserves at that location (unchanged behavior)', async () => {
      mockTx.productionRouteStep.findUnique.mockResolvedValue({ sequence: 1 });
      mockTx.productionOrder.findFirst.mockResolvedValue({ bom: { productVariantId: 'wip-1' } } as never);
      mockTx.bom.findUnique.mockResolvedValue({ outputQuantity: 2, items: [{ productVariantId: 'wip-1', quantity: 3 }] } as never);
      mockTx.stockReservation.findFirst.mockResolvedValue(null);

      await ensureRoutedOrderWipReservation(mockTx as never, {
        id: 'order-2', productionRunId: 'run-1', routeStepId: 'step-2',
        routeSequenceSnapshot: 1, plannedQuantity: 10 as never, status: 'DRAFT',
        materialSourceLocationId: 'loc-wip', locationId: 'loc-fg', machineId: null, bomId: 'bom-2',
      });

      expect(createStockReservation).toHaveBeenCalledWith(expect.objectContaining({
        productVariantId: 'wip-1', locationId: 'loc-wip', quantity: 15,
        referenceId: 'order-2',
      }), mockTx);
      // Resolver short-circuits on explicit materialSourceLocationId — no extra route step lookups.
      expect(mockTx.productionRouteStep.findFirst).not.toHaveBeenCalled();
    });

    it('[case 4] step without materialSourceLocationId reserves at predecessor step outputLocationId', async () => {
      // First call resolves order.routeStepId -> its routeId; second (findFirst)
      // resolves the predecessor step (sequence - 1) -> its outputLocationId.
      mockTx.productionRouteStep.findUnique.mockResolvedValue({ sequence: 1, routeId: 'route-1' });
      mockTx.productionRouteStep.findFirst.mockResolvedValue({ outputLocationId: 'loc-prev-output' });
      mockTx.productionOrder.findFirst.mockResolvedValue({ bom: { productVariantId: 'wip-1' } } as never);
      mockTx.bom.findUnique.mockResolvedValue({ outputQuantity: 2, items: [{ productVariantId: 'wip-1', quantity: 3 }] } as never);
      mockTx.stockReservation.findFirst.mockResolvedValue(null);

      await ensureRoutedOrderWipReservation(mockTx as never, {
        id: 'order-2', productionRunId: 'run-1', routeStepId: 'step-2',
        routeSequenceSnapshot: 1, plannedQuantity: 10 as never, status: 'DRAFT',
        materialSourceLocationId: null, locationId: 'loc-fg', machineId: null, bomId: 'bom-2',
      });

      expect(mockTx.productionRouteStep.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { routeId: 'route-1', sequence: 0 },
      }));
      expect(createStockReservation).toHaveBeenCalledWith(expect.objectContaining({
        productVariantId: 'wip-1', locationId: 'loc-prev-output', quantity: 15,
        referenceId: 'order-2',
      }), mockTx);
    });

    it('[case 6] first step (sequence 0) without materialSourceLocationId gets no reservation', async () => {
      mockTx.productionRouteStep.findUnique.mockResolvedValue({ sequence: 0 });

      await ensureRoutedOrderWipReservation(mockTx as never, {
        id: 'order-1', productionRunId: 'run-1', routeStepId: 'step-1',
        routeSequenceSnapshot: 0, plannedQuantity: 10 as never, status: 'DRAFT',
        materialSourceLocationId: null, locationId: 'loc-fg', machineId: null, bomId: 'bom-1',
      });

      expect(createStockReservation).not.toHaveBeenCalled();
      expect(mockTx.productionRouteStep.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('syncProductionRunStatusFromOrders', () => {
    it('all completed -> COMPLETED', async () => {
      mockTx.productionOrder.findMany.mockResolvedValue([{ status: 'COMPLETED', actualStartDate: null, actualEndDate: null }, { status: 'COMPLETED', actualStartDate: null, actualEndDate: null }] as never);
      mockTx.productionRun.findUnique.mockResolvedValue({ status: 'IN_PROGRESS', actualStartDate: null, actualEndDate: null } as never);
      mockTx.productionRun.update.mockResolvedValue({} as never);
      await syncProductionRunStatusFromOrders(mockTx as never, 'run1');
      expect(mockTx.productionRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
    });

    it('any IN_PROGRESS -> IN_PROGRESS', async () => {
      mockTx.productionOrder.findMany.mockResolvedValue([{ status: 'RELEASED', actualStartDate: null, actualEndDate: null }, { status: 'IN_PROGRESS', actualStartDate: null, actualEndDate: null }] as never);
      mockTx.productionRun.findUnique.mockResolvedValue({ status: 'RELEASED', actualStartDate: null, actualEndDate: null } as never);
      mockTx.productionRun.update.mockResolvedValue({} as never);
      await syncProductionRunStatusFromOrders(mockTx as never, 'run1');
      expect(mockTx.productionRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) }));
    });

    it('[case 1 — G1] mixed COMPLETED + CANCELLED -> run COMPLETED with actualEndDate filled', async () => {
      const completedEnd = new Date('2026-08-01T10:00:00Z');
      mockTx.productionOrder.findMany.mockResolvedValue([
        { status: 'COMPLETED', actualStartDate: new Date('2026-08-01T08:00:00Z'), actualEndDate: completedEnd },
        { status: 'CANCELLED', actualStartDate: new Date('2026-08-01T08:00:00Z'), actualEndDate: null },
      ] as never);
      mockTx.productionRun.findUnique.mockResolvedValue({ status: 'IN_PROGRESS', actualStartDate: new Date('2026-08-01T08:00:00Z'), actualEndDate: null } as never);
      mockTx.productionRun.update.mockResolvedValue({} as never);
      await syncProductionRunStatusFromOrders(mockTx as never, 'run1');
      expect(mockTx.productionRun.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', actualEndDate: completedEnd }),
      }));
    });

    it('[case 2 — regression] all CANCELLED -> run CANCELLED, not COMPLETED', async () => {
      mockTx.productionOrder.findMany.mockResolvedValue([
        { status: 'CANCELLED', actualStartDate: null, actualEndDate: null },
        { status: 'CANCELLED', actualStartDate: null, actualEndDate: null },
      ] as never);
      mockTx.productionRun.findUnique.mockResolvedValue({ status: 'RELEASED', actualStartDate: null, actualEndDate: null } as never);
      mockTx.productionRun.update.mockResolvedValue({} as never);
      await syncProductionRunStatusFromOrders(mockTx as never, 'run1');
      expect(mockTx.productionRun.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }));
    });

    it('[case 3] one IN_PROGRESS + rest terminal -> run stays IN_PROGRESS', async () => {
      mockTx.productionOrder.findMany.mockResolvedValue([
        { status: 'COMPLETED', actualStartDate: new Date('2026-08-01T08:00:00Z'), actualEndDate: new Date('2026-08-01T09:00:00Z') },
        { status: 'CANCELLED', actualStartDate: null, actualEndDate: null },
        { status: 'IN_PROGRESS', actualStartDate: new Date('2026-08-01T09:30:00Z'), actualEndDate: null },
      ] as never);
      mockTx.productionRun.findUnique.mockResolvedValue({ status: 'RELEASED', actualStartDate: null, actualEndDate: null } as never);
      mockTx.productionRun.update.mockResolvedValue({} as never);
      await syncProductionRunStatusFromOrders(mockTx as never, 'run1');
      expect(mockTx.productionRun.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      }));
    });
  });
});
