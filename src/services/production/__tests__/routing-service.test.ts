import { describe, it, expect, vi, beforeEach } from 'vitest';

type MockFn = ReturnType<typeof vi.fn>;

const mockPrisma = vi.hoisted(() => ({
  productionProcess: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  machineProcessCapability: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  machine: { findUnique: vi.fn() },
  productionRoute: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  productionRouteStep: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  productVariant: { findUnique: vi.fn() },
  bom: { findUnique: vi.fn() },
  location: { findUnique: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      productionRoute: {
        updateMany: vi.fn(),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new-route', ...data, _count: { runs: 0 }, steps: [], productVariant: { skuCode: 'TEST' } })),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data })),
        findFirst: vi.fn(),
      },
      productionRouteStep: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new-step', ...data })),
        update: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn(async () => []),
      },
      machineProcessCapability: { deleteMany: vi.fn(), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'cap', ...data })) },
    };
    if (typeof cb === 'function') return cb(tx as never);
    return cb;
  }),
}));

vi.mock('@/lib/core/prisma', () => ({
  prisma: mockPrisma,
}));

import { ProductionRoutingService } from '../routing-service';

describe('ProductionRoutingService - process', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listProcesses calls findMany', async () => {
    (mockPrisma.productionProcess.findMany as MockFn).mockResolvedValue([]);
    const res = await ProductionRoutingService.listProcesses();
    expect(res).toEqual([]);
  });

  it('createProcess dup code throws', async () => {
    (mockPrisma.productionProcess.findUnique as MockFn).mockResolvedValue({ id: 'x', code: 'MIXING' });
    await expect(ProductionRoutingService.createProcess({ code: 'MIXING', name: 'Mixing' })).rejects.toThrow();
  });

  it('createProcess ok', async () => {
    (mockPrisma.productionProcess.findUnique as MockFn).mockResolvedValue(null);
    (mockPrisma.productionProcess.create as MockFn).mockResolvedValue({ id: '1', code: 'STERILIZATION', name: 'Sterilization' });
    const res = await ProductionRoutingService.createProcess({ code: 'STERILIZATION', name: 'Sterilization' });
    expect(res.code).toBe('STERILIZATION');
  });

  it('deleteProcess with steps used throws', async () => {
    (mockPrisma.productionProcess.findUnique as MockFn)
      .mockResolvedValueOnce({ id: 'p1', code: 'MIXING', capabilities: [] })
      .mockResolvedValueOnce({ id: 'p1', code: 'MIXING' });
    (mockPrisma.productionRouteStep.count as MockFn).mockResolvedValue(1);
    await expect(ProductionRoutingService.deleteProcess('p1')).rejects.toThrow();
  });

  it('reorderSteps duplicate ids throws', async () => {
    (mockPrisma.productionRoute.findUnique as MockFn).mockResolvedValue({ id: 'r1', status: 'DRAFT' });
    (mockPrisma.productionRouteStep.findMany as MockFn).mockResolvedValue([{ id: 's1' }, { id: 's2' }] as unknown[]);
    await expect(ProductionRoutingService.reorderSteps('r1', ['s1', 's1'])).rejects.toThrow();
  });

  it('reorderSteps missing id throws', async () => {
    (mockPrisma.productionRoute.findUnique as MockFn).mockResolvedValue({ id: 'r1', status: 'DRAFT' });
    (mockPrisma.productionRouteStep.findMany as MockFn).mockResolvedValue([{ id: 's1' }, { id: 's2' }] as unknown[]);
    await expect(ProductionRoutingService.reorderSteps('r1', ['s1', 'nonexist'])).rejects.toThrow();
  });
});

describe('ProductionRoutingService - routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createRoute finds variant and computes version', async () => {
    (mockPrisma.productVariant.findUnique as MockFn).mockResolvedValue({ id: 'v1', skuCode: 'SKU1' });
    (mockPrisma.productionRoute.findFirst as MockFn).mockResolvedValue({ version: 1 });
    const res = await ProductionRoutingService.createRoute({ productVariantId: 'v1', name: 'Route v2' });
    expect(res).toBeDefined();
  });

  it('createRoute draft cannot be default immediately (I3)', async () => {
    (mockPrisma.productVariant.findUnique as MockFn).mockResolvedValue({ id: 'v1', skuCode: 'SKU1' });
    (mockPrisma.productionRoute.findFirst as MockFn).mockResolvedValue({ version: 0 });
    const res = await ProductionRoutingService.createRoute({ productVariantId: 'v1', name: 'Draft Route', isDefault: true });
    // Should be created with isDefault false (draft can't be default)
    expect((res as unknown as { isDefault: boolean }).isDefault).toBe(false);
  });

  it('updateRoute draft trying to set default throws', async () => {
    (mockPrisma.productionRoute.findUnique as MockFn).mockResolvedValue({
      id: 'r1',
      productVariantId: 'v1',
      status: 'DRAFT',
      productVariant: { skuCode: 'FG', name: 'FG' },
      steps: [],
      _count: { runs: 0 },
    });
    await expect(ProductionRoutingService.updateRoute('r1', { isDefault: true })).rejects.toThrow();
  });

  it('validateRoute -> no steps invalid', async () => {
    (mockPrisma.productionRoute.findUnique as MockFn).mockResolvedValueOnce({
      id: 'r1',
      productVariantId: 'fg',
      productVariant: { skuCode: 'FG', name: 'FG' },
      status: 'DRAFT',
      steps: [],
      _count: { runs: 0 },
    });
    (mockPrisma.machineProcessCapability.findMany as MockFn).mockResolvedValue([]);
    const result = await ProductionRoutingService.validateRoute('r1');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'ROUTE_NO_STEPS')).toBe(true);
  });

  it('validateRoute -> missing output location blocking', async () => {
    (mockPrisma.productionRoute.findUnique as MockFn).mockResolvedValueOnce({
      id: 'r1',
      productVariantId: 'fg',
      productVariant: { skuCode: 'FG', name: 'FG' },
      status: 'DRAFT',
      steps: [
        {
          stepCode: 'MIX',
          sequence: 0,
          bomId: 'b1',
          bom: { productVariantId: 'fg', isActive: true, items: [] as unknown[], outputQuantity: 1 },
          processId: 'p1',
          process: { code: 'MIXING', isActive: true, requiresMachine: false },
          materialSourceLocationId: null,
          outputLocationId: null,
          materialSourceLocation: null,
          outputLocation: null,
        },
      ],
      _count: { runs: 0 },
    });
    (mockPrisma.machineProcessCapability.findMany as MockFn).mockResolvedValue([]);
    const result = await ProductionRoutingService.validateRoute('r1');
    expect(result.issues.some((i) => i.code === 'ROUTE_MISSING_OUTPUT_LOCATION')).toBe(true);
  });
});
