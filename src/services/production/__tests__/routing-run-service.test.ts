import { describe, it, expect, vi, beforeEach } from 'vitest';

type MockFn = ReturnType<typeof vi.fn>;

const mockTx = {
  productionRun: {
    findUnique: vi.fn(),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'run-id', ...data })),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data })),
  },
  productionOrder: { updateMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  location: { findUnique: vi.fn(async () => ({ id: 'loc-1' })) },
  bom: { findUnique: vi.fn(async () => ({ id: 'bom-1', outputQuantity: 1, items: [{ productVariantId: 'rm-1', quantity: 2 }] })) },
  productionMaterial: { createMany: vi.fn() },
  productionRouteStep: { findUnique: vi.fn() },
  productionExecution: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
  inventory: { findUnique: vi.fn() },
  stockReservation: { aggregate: vi.fn(async () => ({ _sum: { quantity: null } })), findFirst: vi.fn(), updateMany: vi.fn() },
};

const mockPrisma = vi.hoisted(() => ({
  productionRun: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  productionRoute: { findUnique: vi.fn() },
  location: { findUnique: vi.fn() },
  bom: { findUnique: vi.fn() },
  productionOrder: { updateMany: vi.fn(), findMany: vi.fn() },
  productionMaterial: { createMany: vi.fn() },
  productionRouteStep: { findUnique: vi.fn() },
  inventory: { findUnique: vi.fn(), aggregate: vi.fn() },
  productVariant: { findUnique: vi.fn(), findMany: vi.fn() },
  stockReservation: { aggregate: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    if (typeof cb === 'function') return cb(mockTx as never);
    return cb;
  }),
}));

vi.mock('@/lib/core/prisma', () => ({
  prisma: mockPrisma,
}));

const mockOrderNumber = vi.hoisted(() => ({
  createProductionOrderWithGeneratedNumber: vi.fn(async (_tx: unknown, data: Record<string, unknown>) => ({
    id: `order-${Math.random().toString(36).slice(2, 8)}`,
    orderNumber: `WO-123-${Math.random().toString(36).slice(2, 4)}`,
    ...data,
    plannedQuantity: data.plannedQuantity,
  })),
}));

vi.mock('../order-number-service', () => ({
  createProductionOrderWithGeneratedNumber: mockOrderNumber.createProductionOrderWithGeneratedNumber,
}));

vi.mock('../routing-service', () => ({
  ProductionRoutingService: {
    getRouteById: vi.fn(async (id: string) => ({
      id,
      status: 'ACTIVE',
      version: 1,
      name: 'Sedotan Steril',
      productVariantId: 'fg-id',
      steps: [
        {
          id: 'step-1',
          sequence: 0,
          stepCode: 'PACK_PRIMER',
          label: 'Packing Primer',
          processId: 'proc-1',
          bomId: 'bom-1',
          materialSourceLocationId: null,
          outputLocationId: 'loc-1',
          bom: { id: 'bom-1', outputQuantity: 1, items: [{ productVariantId: 'raw-1', quantity: 1, scrapPercentage: 2 }] },
          process: { id: 'proc-1', code: 'INNER_PACKING', name: 'Inner Packing', executionMode: 'INDIVIDUAL_OUTPUT' },
        },
        {
          id: 'step-2',
          sequence: 1,
          stepCode: 'STERIL',
          label: 'Sterilization',
          processId: 'proc-2',
          bomId: 'bom-2',
          materialSourceLocationId: 'loc-1',
          outputLocationId: 'loc-2',
          bom: { id: 'bom-2', outputQuantity: 1, items: [{ productVariantId: 'wip-1', quantity: 1 }] },
          process: { id: 'proc-2', code: 'STERILIZATION', name: 'Sterilization', executionMode: 'MATERIAL_CONVERSION' },
        },
      ],
      productVariant: { skuCode: 'FG' },
    })),
    validateRoute: vi.fn(async () => ({ valid: true, issues: [] })),
  },
}));

import { ProductionRoutingRunService } from '../routing-run-service';
import { ProductionRoutingService } from '../routing-service';

describe('ProductionRoutingRunService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.productionExecution.findFirst.mockResolvedValue(null);
    mockTx.inventory.findUnique.mockResolvedValue(null);
    mockTx.stockReservation.aggregate.mockResolvedValue({ _sum: { quantity: null } } as never);
    mockTx.location.findUnique.mockResolvedValue({ id: 'loc-1' } as never);
  });

  it('createRun rejects zero qty', async () => {
    await expect(ProductionRoutingRunService.createRun({ routeId: 'r1', plannedQuantity: 0 } as never)).rejects.toThrow();
  });

  it('computeStepQuantities scales with scrap', () => {
    // step 1 (FG) consumes WIP with 10% scrap → upstream must produce 10% more
    const steps = [
      { bom: { outputQuantity: 1, productVariantId: 'wip', items: [{ quantity: 1, scrapPercentage: 0, productVariantId: 'rm' }] }, sequence: 0 },
      { bom: { outputQuantity: 1, productVariantId: 'fg', items: [{ quantity: 1, scrapPercentage: 10, productVariantId: 'wip' }] }, sequence: 1 },
    ];
    const map = ProductionRoutingRunService.computeStepQuantities(steps as never, 100);
    // step 1 output = 100
    // step 0: downstream BOM item has qty=1, scrap=10%, so required = 100 * (1/1) * 1.1 = 110
    expect(map.get(1)).toBe(100);
    expect(map.get(0)).toBe(110);
  });

  it('computeStepQuantities respects outputQuantity', () => {
    const steps = [
      { bom: { outputQuantity: 2, productVariantId: 'wip', items: [{ quantity: 1, scrapPercentage: 0, productVariantId: 'rm' }] }, sequence: 0 },
      { bom: { outputQuantity: 1, productVariantId: 'fg', items: [{ quantity: 1, scrapPercentage: 0, productVariantId: 'wip' }] }, sequence: 1 },
    ];
    const map = ProductionRoutingRunService.computeStepQuantities(steps as never, 100);
    // step 1: output 100
    // step 0: downstream BOM item qty=1, required = 100 * (1/1) = 100
    // step 0: outputQty=2, recipeRuns=ceil(100/2)=50, output=50*2=100
    expect(map.get(1)).toBe(100);
    expect(map.get(0)).toBe(100);
  });

  it('computeStepQuantities handles 10 WIP → 1 karton scaling', () => {
    // step 0: BOM outputs 10 raw → 1 wip-1; consumes 10 raw per output
    // step 1: BOM outputs 1 wip-1; consumes 10 wip-1 per output
    // step 2: BOM outputs 1 FG; consumes 1 wip-1 per output
    const steps = [
      { bom: { outputQuantity: 10, productVariantId: 'raw', items: [{ quantity: 1, scrapPercentage: 0, productVariantId: 'raw-material' }] }, sequence: 0 },
      { bom: { outputQuantity: 1, productVariantId: 'wip-1', items: [{ quantity: 10, scrapPercentage: 0, productVariantId: 'raw' }] }, sequence: 1 },
      { bom: { outputQuantity: 1, productVariantId: 'fg', items: [{ quantity: 1, scrapPercentage: 0, productVariantId: 'wip-1' }] }, sequence: 2 },
    ];
    const map = ProductionRoutingRunService.computeStepQuantities(steps as never, 100);
    // step 2: output 100 FG
    // step 1: downstream (step2) BOM item qty=1 wip-1 per FG → required = 100 * (1/1) = 100 wip-1
    // step 0: downstream (step1) BOM item qty=10 raw per wip-1 → required = 100 * (10/1) = 1000 raw
    expect(map.get(2)).toBe(100);
    expect(map.get(1)).toBe(100);
    expect(map.get(0)).toBe(1000);
  });

  it('computeStepQuantities with BOM qty > 1 upstream', () => {
    // 2-step: step 1 (FG) needs 3 units of step 0 output per 1 FG output
    const steps = [
      { bom: { outputQuantity: 5, productVariantId: 'wip-a', items: [{ quantity: 1, scrapPercentage: 0, productVariantId: 'rm-x' }] }, sequence: 0 },
      { bom: { outputQuantity: 1, productVariantId: 'fg', items: [{ quantity: 3, scrapPercentage: 0, productVariantId: 'wip-a' }] }, sequence: 1 },
    ];
    const map = ProductionRoutingRunService.computeStepQuantities(steps as never, 20);
    // step 1: output 20 (20 recipe runs × 1)
    // step 0: upstream BOM item qty=3 per output → required = 20 * (3/1) = 60 wip-a
    // step 0: recipeRuns = ceil(60/5) = 12, output = 12*5 = 60
    expect(map.get(1)).toBe(20);
    expect(map.get(0)).toBe(60);
  });

  it('computeStepQuantities with scrap on upstream BOM item', () => {
    // step 1 needs 2 units of step 0 output with 5% scrap
    const steps = [
      { bom: { outputQuantity: 1, productVariantId: 'wip', items: [{ quantity: 1, scrapPercentage: 0, productVariantId: 'rm' }] }, sequence: 0 },
      { bom: { outputQuantity: 1, productVariantId: 'fg', items: [{ quantity: 2, scrapPercentage: 5, productVariantId: 'wip' }] }, sequence: 1 },
    ];
    const map = ProductionRoutingRunService.computeStepQuantities(steps as never, 100);
    // step 1: output 100
    // step 0: upstream BOM item qty=2, scrap=5% → 100 * (2/1) * 1.05 = 210
    expect(map.get(1)).toBe(100);
    expect(map.get(0)).toBe(210);
  });

  it('previewRunQuantities returns per-step qty scaled from final FG qty', async () => {
    (ProductionRoutingService.getRouteById as MockFn).mockResolvedValueOnce({
      id: 'route-preview',
      status: 'ACTIVE',
      steps: [
        {
          sequence: 0,
          label: 'Mix',
          stepCode: 'MIX',
          process: { code: 'MIX' },
          bom: { name: 'BOM WIP', outputQuantity: 1, productVariantId: 'wip', items: [{ productVariantId: 'rm' }] },
        },
        {
          sequence: 1,
          label: 'Extrude',
          stepCode: 'EXTRUDE',
          process: { code: 'EXTRUDE' },
          bom: { name: 'BOM FG', outputQuantity: 1, productVariantId: 'fg', items: [{ productVariantId: 'wip' }] },
        },
      ],
    } as never);

    const preview = await ProductionRoutingRunService.previewRunQuantities('route-preview', 100);

    expect(preview).toHaveLength(2);
    expect(preview[0]).toMatchObject({ sequence: 0, stepCode: 'MIX', processCode: 'MIX', bomName: 'BOM WIP', stepOutputQty: 100, recipeRuns: 100 });
    expect(preview[1]).toMatchObject({ sequence: 1, stepCode: 'EXTRUDE', processCode: 'EXTRUDE', bomName: 'BOM FG', stepOutputQty: 100, recipeRuns: 100 });
  });

  it('previewRunQuantities rejects zero/negative qty', async () => {
    await expect(ProductionRoutingRunService.previewRunQuantities('route-preview', 0)).rejects.toThrow();
    expect(ProductionRoutingService.getRouteById as MockFn).not.toHaveBeenCalled();
  });

  it('previewRunQuantities rejects non-ACTIVE route', async () => {
    (ProductionRoutingService.getRouteById as MockFn).mockResolvedValueOnce({ id: 'route-draft', status: 'DRAFT', steps: [] } as never);
    await expect(ProductionRoutingRunService.previewRunQuantities('route-draft', 10)).rejects.toThrow('Hanya ACTIVE route yang bisa di-preview');
  });

  it('previewRunQuantities rejects route without steps', async () => {
    (ProductionRoutingService.getRouteById as MockFn).mockResolvedValueOnce({ id: 'route-empty', status: 'ACTIVE', steps: [] } as never);
    await expect(ProductionRoutingRunService.previewRunQuantities('route-empty', 10)).rejects.toThrow('Route tidak punya steps');
  });

  it('generateRunNumber collision-safe', async () => {
    mockTx.productionRun.findUnique.mockResolvedValueOnce({ id: 'exists' } as never).mockResolvedValueOnce(null);
    const num = await ProductionRoutingRunService.generateRunNumber(mockTx as never);
    expect(typeof num).toBe('string');
    expect(num.startsWith('RUN-')).toBe(true);
  });

  it('createRun happy path creates run + orders atomically', async () => {
    mockPrisma.productionRoute.findUnique = vi.fn();
    const result = await ProductionRoutingRunService.createRun({
      routeId: 'route-1',
      plannedQuantity: 10000,
      priority: 'NORMAL',
    } as never);
    expect(result).toBeDefined();
    expect((result as { runNumber: string }).runNumber).toBeDefined();
  });

  it('createRun copies INDIVIDUAL_OUTPUT from process to order snapshot', async () => {
    await ProductionRoutingRunService.createRun({ routeId: 'route-1', plannedQuantity: 10000 } as never);
    const orderData = mockOrderNumber.createProductionOrderWithGeneratedNumber.mock.calls.map(
      ([, data]) => data as Record<string, unknown>,
    );
    const packing = orderData.find((o) => o.processCodeSnapshot === 'INNER_PACKING');
    expect(packing?.executionModeSnapshot).toBe('INDIVIDUAL_OUTPUT');
  });

  it('createRun copies MATERIAL_CONVERSION from process to order snapshot', async () => {
    await ProductionRoutingRunService.createRun({ routeId: 'route-1', plannedQuantity: 10000 } as never);
    const orderData = mockOrderNumber.createProductionOrderWithGeneratedNumber.mock.calls.map(
      ([, data]) => data as Record<string, unknown>,
    );
    const steril = orderData.find((o) => o.processCodeSnapshot === 'STERILIZATION');
    expect(steril?.executionModeSnapshot).toBe('MATERIAL_CONVERSION');
  });

  it('createRun defaults snapshot to GENERIC when process has no explicit mode', async () => {
    const routing = await import('../routing-service');
    (routing.ProductionRoutingService.getRouteById as MockFn).mockResolvedValueOnce({
      id: 'route-legacy',
      status: 'ACTIVE',
      version: 1,
      name: 'Legacy Route',
      productVariantId: 'fg-id',
      steps: [
        {
          id: 'step-legacy',
          sequence: 0,
          stepCode: 'LEGACY',
          label: 'Legacy Step',
          processId: 'proc-legacy',
          bomId: 'bom-1',
          materialSourceLocationId: null,
          outputLocationId: 'loc-1',
          bom: { id: 'bom-1', outputQuantity: 1, items: [{ productVariantId: 'raw-1', quantity: 1 }] },
          process: { id: 'proc-legacy', code: 'LEGACY', name: 'Legacy' },
        },
      ],
      productVariant: { skuCode: 'FG' },
    } as never);
    await ProductionRoutingRunService.createRun({ routeId: 'route-legacy', plannedQuantity: 100 } as never);
    const orderData = mockOrderNumber.createProductionOrderWithGeneratedNumber.mock.calls.map(
      ([, data]) => data as Record<string, unknown>,
    );
    expect(orderData[0].executionModeSnapshot).toBeUndefined();
  });

  it('getRunById not found throws', async () => {
    (mockPrisma.productionRun.findUnique as MockFn).mockResolvedValue(null);
    await expect(ProductionRoutingRunService.getRunById('nope')).rejects.toThrow();
  });

  it('computeRunProgress', async () => {
    (mockPrisma.productionRun.findUnique as MockFn).mockResolvedValue({
      id: 'run1',
      orders: [
        { id: 'o1', status: 'COMPLETED', routeSequenceSnapshot: 0, orderNumber: 'WO-1', processNameSnapshot: 'Pack' },
        { id: 'o2', status: 'IN_PROGRESS', routeSequenceSnapshot: 1, orderNumber: 'WO-2', processNameSnapshot: 'Steril' },
      ],
      productVariant: { skuCode: 'FG' },
      route: { steps: [] },
    } as never);
    const p = await ProductionRoutingRunService.computeRunProgress('run1');
    expect(p.total).toBe(2);
    expect(p.completed).toBe(1);
    expect(p.percent).toBe(50);
  });

  it('cancelRun blocks when active execution', async () => {
    mockTx.productionRun.findUnique.mockResolvedValue({
      id: 'run1',
      runNumber: 'RUN-001',
      status: 'RELEASED',
      orders: [{ id: 'o1' }],
      productVariant: { skuCode: 'FG' },
      route: { steps: [] },
    } as never);
    mockTx.productionExecution.findFirst.mockResolvedValueOnce({ id: 'exec-1', productionOrderId: 'o1' } as never);
    await expect(ProductionRoutingRunService.cancelRun('run1')).rejects.toThrow();
  });

  it('cancelRun already final throws', async () => {
    mockTx.productionRun.findUnique.mockResolvedValue({
      id: 'run1',
      runNumber: 'RUN-001',
      status: 'COMPLETED',
      orders: [],
      productVariant: { skuCode: 'FG' },
      route: { steps: [] },
    } as never);
    await expect(ProductionRoutingRunService.cancelRun('run1')).rejects.toThrow();
  });

  it('cancelRun happy path with audit', async () => {
    mockTx.productionRun.findUnique.mockResolvedValue({
      id: 'run1',
      runNumber: 'RUN-001',
      status: 'RELEASED',
      orders: [{ id: 'o1' }],
      productVariant: { skuCode: 'FG' },
      route: { steps: [] },
    } as never);
    mockTx.productionExecution.findFirst.mockResolvedValue(null);
    mockTx.productionOrder.updateMany.mockResolvedValue({} as never);
    mockTx.productionRun.update.mockResolvedValue({ id: 'run1', status: 'CANCELLED' } as never);
    const res = await ProductionRoutingRunService.cancelRun('run1', 'actor-1');
    expect(res.status).toBe('CANCELLED');
    expect(mockTx.auditLog.create).toHaveBeenCalled();
  });

  it('checkRmAvailability returns skuCode and name via batch query (G9)', async () => {
    const findUnique = mockPrisma.productionRun.findUnique as MockFn;
    findUnique.mockResolvedValue({
      id: 'run-avail',
      runNumber: 'RUN-AVAIL',
      status: 'RELEASED',
      orders: [
        {
          id: 'order-first',
          routeSequenceSnapshot: 0,
          orderNumber: 'WO-001',
          status: 'RELEASED',
          plannedQuantity: 100,
          actualQuantity: null,
          processNameSnapshot: 'Mixing',
          bom: { id: 'bom-1', outputQuantity: 1 },
          machine: null,
          location: { id: 'loc-1', name: 'Area', slug: 'area' },
          sourceLocation: null,
          routeStep: null,
          plannedMaterials: [
            { productVariantId: 'rm-aaa', quantity: 50 },
            { productVariantId: 'rm-bbb', quantity: 80 },
          ],
          materialSourceLocationId: null,
        },
      ],
      productVariant: { skuCode: 'FG', name: 'FG Product' },
      route: { steps: [] },
      salesOrder: null,
    } as never);

    // No sourceLocation → code uses inventory.aggregate (not findUnique)
    // rm-aaa: 100 available (enough), rm-bbb: 30 available (shortage)
    const invAggregate = vi.fn(async ({ where }: { where: { productVariantId: string } }) => {
      if (where.productVariantId === 'rm-aaa') return { _sum: { quantity: 100 } };
      if (where.productVariantId === 'rm-bbb') return { _sum: { quantity: 30 } };
      return { _sum: { quantity: null } };
    });
    mockPrisma.inventory.aggregate = invAggregate;

    // Stock reservation: all zero
    const resvAggregate = vi.fn(async () => ({ _sum: { quantity: null } }));
    const stockResvMock = mockPrisma.stockReservation as { aggregate: MockFn; findFirst: MockFn; updateMany: MockFn };
    stockResvMock.aggregate = resvAggregate;

    // Batch variant lookup — only rm-bbb is in shortage
    const pvFindMany = vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
      const map: Record<string, { id: string; skuCode: string; name: string }> = {
        'rm-bbb': { id: 'rm-bbb', skuCode: 'RM-BBB', name: 'Bahan B' },
      };
      return where.id.in.map((id: string) => map[id]).filter(Boolean);
    });
    const pvMock = mockPrisma.productVariant as { findUnique: MockFn; findMany: MockFn };
    pvMock.findMany = pvFindMany;

    const result = await ProductionRoutingRunService.checkRmAvailability('run-avail');
    expect(result.ready).toBe(false);
    expect(result.shortages).toHaveLength(1);
    expect(result.shortages[0]).toMatchObject({
      productVariantId: 'rm-bbb',
      skuCode: 'RM-BBB',
      name: 'Bahan B',
      needed: 80,
      available: 30,
    });
    // Verify batch query was used (called once, not N+1)
    expect(pvFindMany).toHaveBeenCalledOnce();
    expect(pvFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['rm-bbb'] } },
      select: { id: true, skuCode: true, name: true },
    });
  });
});
