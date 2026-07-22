import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    salesOrder: {
      count: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    deliveryOrder: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    deliveryScheduleVehicle: {
      count: vi.fn(),
    },
    invoice: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    customer: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('@/lib/core/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/core/tenant', () => ({
  withTenant: (fn: (...args: unknown[]) => unknown) => fn,
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

vi.mock('@/services/analytics/analytics-service', () => ({
  AnalyticsService: {
    getSalesMetrics: vi.fn().mockResolvedValue({
      totalRevenue: 1_000_000,
      totalOrders: 12,
      averageOrderValue: 0,
      revenueTrend: [],
      topProducts: [],
      topCustomers: [],
    }),
  },
}));

import { getSalesDashboardStats } from '../sales-dashboard';

describe('getSalesDashboardStats (command board)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.salesOrder.count.mockImplementation(async (args?: {
      where?: { status?: string | { notIn?: string[] } };
    }) => {
      const status = args?.where?.status;
      if (status === 'DRAFT') return 3;
      if (status === 'READY_TO_SHIP') return 2;
      return 9; // active (not delivered/cancelled)
    });

    mockPrisma.deliveryOrder.count.mockResolvedValue(4);
    mockPrisma.deliveryScheduleVehicle.count.mockResolvedValue(1);
    mockPrisma.invoice.count.mockResolvedValue(5);
    mockPrisma.customer.count.mockResolvedValue(20);

    mockPrisma.invoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: 500_000, paidAmount: 100_000 },
    });

    mockPrisma.salesOrder.findMany.mockImplementation(async (args?: {
      where?: { status?: string; id?: { in?: string[] } };
      select?: { id?: boolean };
    }) => {
      if (args?.select && 'id' in (args.select || {}) && args.where?.status === 'READY_TO_SHIP') {
        return [{ id: 'so-ready-1' }, { id: 'so-ready-2' }];
      }
      if (args?.where?.id?.in) {
        return [
          {
            id: 'so-ready-1',
            orderNumber: 'SO-READY',
            customer: { name: 'Toko Ready' },
          },
        ];
      }
      // old drafts
      return [
        {
          id: 'so-draft-1',
          orderNumber: 'SO-DRAFT',
          createdAt: new Date(Date.now() - 2 * 86400000),
          customer: { name: 'Toko Draft' },
        },
      ];
    });

    mockPrisma.deliveryOrder.findMany.mockImplementation(async (args?: {
      where?: { salesOrderId?: { in?: string[] }; status?: { in?: string[] } };
      select?: { salesOrderId?: boolean };
    }) => {
      if (args?.select && 'salesOrderId' in (args.select || {})) {
        return [{ salesOrderId: 'so-ready-2' }]; // so-ready-1 has no open DO
      }
      return [
        {
          id: 'do-1',
          orderNumber: 'SJ-001',
          status: 'LOADING',
          salesOrder: { customer: { name: 'Toko A' } },
        },
      ];
    });

    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        totalAmount: 200_000,
        paidAmount: 0,
        dueDate: new Date(Date.now() - 86400000),
        salesOrderId: 'so-1',
        salesOrder: { id: 'so-1', customer: { name: 'Toko B' } },
      },
    ]);

    mockPrisma.customer.findMany.mockResolvedValue([
      { id: 'c-over', name: 'Customer Over', creditLimit: 100_000 },
    ]);

    mockPrisma.salesOrder.aggregate.mockResolvedValue({
      _sum: { totalAmount: 50_000 },
    });
  });

  it('returns board counts including open DO PENDING+LOADING', async () => {
    const res = await getSalesDashboardStats();
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.counts.draftOrders).toBe(3);
    expect(res.data.counts.readyToShipOrders).toBe(2);
    expect(res.data.counts.openDeliveryOrders).toBe(4);
    expect(res.data.counts.tripsToday).toBe(1);
    expect(res.data.counts.overdueInvoices).toBe(5);
    expect(res.data.counts.overdueAmount).toBe(400_000);
    expect(res.data.performance.totalRevenue).toBe(1_000_000);
    expect(res.data.performance.revenueDefinition).toBe('journal_4xx');
  });

  it('builds attention lists with SO-ready-without-DO and overdue salesOrderId', async () => {
    const res = await getSalesDashboardStats();
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.attention.oldDrafts[0]?.orderNumber).toBe('SO-DRAFT');
    expect(res.data.attention.readyWithoutDo.some((r) => r.id === 'so-ready-1')).toBe(true);
    expect(res.data.attention.openDeliveries[0]?.status).toBe('LOADING');
    expect(res.data.attention.overdueInvoices[0]?.salesOrderId).toBe('so-1');
    expect(res.data.attention.creditRisk[0]?.exposureStatus).toBe('over');
  });

  it('queries open deliveries with PENDING and LOADING', async () => {
    await getSalesDashboardStats();
    const openCountCall = mockPrisma.deliveryOrder.count.mock.calls[0]?.[0] as {
      where?: { status?: { in?: string[] } };
    };
    expect(openCountCall?.where?.status?.in).toEqual(
      expect.arrayContaining(['PENDING', 'LOADING']),
    );
  });
});
