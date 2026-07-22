import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    purchaseOrder: { count: vi.fn(), findMany: vi.fn() },
    deliveryOrder: { count: vi.fn(), findMany: vi.fn() },
    productionOrder: { count: vi.fn(), findMany: vi.fn() },
    goodsReceipt: { count: vi.fn() },
    stockMovement: { count: vi.fn() },
    productVariant: { findMany: vi.fn() },
  };
  return { mockPrisma };
});

vi.mock('@/lib/core/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/core/tenant', () => ({
  withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/tools/auth-checks', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}));

vi.mock('@/lib/errors/errors', () => ({
  safeAction: async (fn: () => Promise<unknown>) => {
    try {
      const data = await fn();
      return { success: true as const, data };
    } catch (e) {
      return { success: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  },
}));

import { getWarehouseShiftBoard } from '../warehouse-dashboard';
import { DeliveryStatus } from '@prisma/client';

const decimal = (n: number) => ({ toNumber: () => n });

describe('getWarehouseShiftBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.purchaseOrder.count.mockResolvedValue(3);
    // Parallel counts — branch by where filter (not call order)
    mockPrisma.deliveryOrder.count.mockImplementation(async (args?: {
      where?: { status?: string | { in?: string[] } };
    }) => {
      const status = args?.where?.status;
      if (status && typeof status === 'object' && Array.isArray(status.in)) {
        return 2; // open PENDING|LOADING
      }
      return 7; // shipped today
    });
    mockPrisma.productionOrder.count.mockResolvedValue(4);
    mockPrisma.goodsReceipt.count.mockResolvedValue(1);
    mockPrisma.stockMovement.count.mockResolvedValue(5);
    mockPrisma.deliveryOrder.findMany.mockResolvedValue([
      {
        id: 'do-1',
        orderNumber: 'SJ-001',
        salesOrder: { customer: { name: 'Toko A' } },
      },
    ]);
    mockPrisma.purchaseOrder.findMany.mockResolvedValue([
      {
        id: 'po-1',
        orderNumber: 'PO-001',
        supplier: { name: 'Supplier X' },
      },
    ]);
    mockPrisma.productionOrder.findMany.mockResolvedValue([
      { id: 'spk-1', orderNumber: 'SPK-001' },
    ]);
    mockPrisma.productVariant.findMany.mockImplementation(async (args?: {
      where?: { minStockAlert?: unknown; reorderPoint?: unknown };
    }) => {
      if (args?.where && 'minStockAlert' in args.where) {
        return [
          {
            id: 'pv-low',
            minStockAlert: decimal(100),
            inventories: [
              { quantity: decimal(10), location: { slug: 'rm_warehouse' } },
            ],
          },
          {
            id: 'pv-ok',
            minStockAlert: decimal(10),
            inventories: [
              { quantity: decimal(50), location: { slug: 'rm_warehouse' } },
            ],
          },
        ];
      }
      return [
        {
          id: 'pv-re',
          reorderPoint: decimal(20),
          inventories: [{ quantity: decimal(5) }],
        },
      ];
    });
  });

  it('returns shift board DTO with counts, today activity, and attention lists', async () => {
    const res = await getWarehouseShiftBoard();
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.counts.receivablePOs).toBe(3);
    expect(res.data.counts.openLoadOrders).toBe(2);
    expect(res.data.counts.materialQueue).toBe(4);
    expect(res.data.counts.lowStock).toBe(1);
    expect(res.data.counts.suggestedReorder).toBe(1);

    expect(res.data.today.goodsReceipts).toBe(1);
    expect(res.data.today.deliveriesShipped).toBe(7);
    expect(res.data.today.materialIssues).toBe(5);

    expect(res.data.attention.loadingUnverified).toEqual([
      { id: 'do-1', number: 'SJ-001', customerName: 'Toko A' },
    ]);
    expect(res.data.attention.partialPOs[0].orderNumber).toBe('PO-001');
    expect(res.data.attention.waitingMaterial[0].orderNumber).toBe('SPK-001');
  });

  it('queries open load orders as PENDING + LOADING', async () => {
    await getWarehouseShiftBoard();
    const openLoadCall = mockPrisma.deliveryOrder.count.mock.calls[0]?.[0] as {
      where?: { status?: { in?: string[] } };
    };
    expect(openLoadCall?.where?.status?.in).toEqual(
      expect.arrayContaining([DeliveryStatus.PENDING, DeliveryStatus.LOADING]),
    );
  });
});
