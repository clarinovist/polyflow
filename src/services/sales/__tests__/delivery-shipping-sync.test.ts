import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncSalesOrderShippingFromDeliveries } from '../delivery-shipping-sync';

// Mock prisma
vi.mock('@/lib/core/prisma', () => ({
  prisma: {
    salesOrder: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    deliveryOrder: {
      findMany: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock audit log
vi.mock('@/lib/tools/audit', () => ({
  logActivity: vi.fn(),
}));

import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';

const mockPrisma = vi.mocked(prisma);
const mockLogActivity = vi.mocked(logActivity);

describe('syncSalesOrderShippingFromDeliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SO_CANCELLED when SO is cancelled', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CANCELLED',
      totalAmount: 1000000,
      shippingCost: 50000,
      orderNumber: 'SO-001',
    } as any);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.synced).toBe(false);
    expect(result.reason).toBe('SO_CANCELLED');
    expect(result.shippingCost).toBe(0);
  });

  it('sums billable delivery charges correctly', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      totalAmount: 1050000,
      shippingCost: 50000,
      orderNumber: 'SO-001',
    } as any);

    mockPrisma.deliveryOrder.findMany.mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
      { status: 'SHIPPED', totalCharge: 50000 },
    ] as any);

    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.synced).toBe(true);
    expect(result.reason).toBe('OK');
    expect(result.shippingCost).toBe(150000);
    // goodsSubtotal = 1050000 - 50000 = 1000000
    expect(result.goodsSubtotal).toBe(1000000);
    // totalAmount = 1000000 + 150000 = 1150000
    expect(result.totalAmount).toBe(1150000);
    expect(result.billableDeliveryCount).toBe(2);
    expect(mockPrisma.salesOrder.update).toHaveBeenCalledWith({
      where: { id: 'so-1' },
      data: { shippingCost: 150000, totalAmount: 1150000 },
    });
  });

  it('excludes CANCELLED deliveries from sum', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      totalAmount: 1000000,
      shippingCost: null,
      orderNumber: 'SO-001',
    } as any);

    mockPrisma.deliveryOrder.findMany.mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
      { status: 'CANCELLED', totalCharge: 50000 },
    ] as any);

    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.shippingCost).toBe(100000);
    expect(result.billableDeliveryCount).toBe(1);
  });

  it('includes RETURNED deliveries in sum (policy A2)', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      totalAmount: 1000000,
      shippingCost: null,
      orderNumber: 'SO-001',
    } as any);

    mockPrisma.deliveryOrder.findMany.mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
      { status: 'RETURNED', totalCharge: 50000 },
    ] as any);

    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.shippingCost).toBe(150000);
    expect(result.billableDeliveryCount).toBe(2);
  });

  it('returns INVOICE_LOCKED when invoice is UNPAID', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      totalAmount: 1000000,
      shippingCost: null,
      orderNumber: 'SO-001',
    } as any);

    mockPrisma.deliveryOrder.findMany.mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
    ] as any);

    mockPrisma.invoice.findMany.mockResolvedValue([
      { id: 'inv-1', status: 'UNPAID' },
    ] as any);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.synced).toBe(false);
    expect(result.reason).toBe('INVOICE_LOCKED');
    expect(result.shippingCost).toBe(100000);
    expect(mockPrisma.salesOrder.update).not.toHaveBeenCalled();
  });

  it('blocks on PARTIAL, PAID, OVERDUE invoices too', async () => {
    for (const status of ['PARTIAL', 'PAID', 'OVERDUE']) {
      vi.clearAllMocks();
      mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
        id: 'so-1', status: 'CONFIRMED',
        totalAmount: 1000000, shippingCost: null,
        orderNumber: 'SO-001',
      } as any);
      mockPrisma.deliveryOrder.findMany.mockResolvedValue([
        { status: 'DELIVERED', totalCharge: 100000 },
      ] as any);
      mockPrisma.invoice.findMany.mockResolvedValue([
        { id: 'inv-1', status },
      ] as any);

      const result = await syncSalesOrderShippingFromDeliveries('so-1');
      expect(result.synced).toBe(false);
      expect(result.reason).toBe('INVOICE_LOCKED');
    }
  });

  it('updates DRAFT invoices when syncing', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      totalAmount: 1000000,
      shippingCost: null,
      orderNumber: 'SO-001',
    } as any);

    mockPrisma.deliveryOrder.findMany.mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
    ] as any);

    mockPrisma.invoice.findMany.mockResolvedValue([
      { id: 'inv-draft', status: 'DRAFT' },
    ] as any);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.synced).toBe(true);
    expect(result.invoiceUpdated).toBe(true);
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-draft' },
      data: { totalAmount: 1100000 },
    });
  });

  it('skips deliveries with null totalCharge', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      totalAmount: 1000000,
      shippingCost: null,
      orderNumber: 'SO-001',
    } as any);

    mockPrisma.deliveryOrder.findMany.mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
      { status: 'PENDING', totalCharge: null },
    ] as any);

    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.shippingCost).toBe(100000);
  });

  it('sets shippingCost to null when sum is 0', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      totalAmount: 1000000,
      shippingCost: 50000,
      orderNumber: 'SO-001',
    } as any);

    mockPrisma.deliveryOrder.findMany.mockResolvedValue([
      { status: 'CANCELLED', totalCharge: 50000 },
    ] as any);

    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.shippingCost).toBe(0);
    expect(mockPrisma.salesOrder.update).toHaveBeenCalledWith({
      where: { id: 'so-1' },
      data: { shippingCost: null, totalAmount: 950000 },
    });
  });

  it('calculates goodsSubtotal correctly when old shippingCost was non-zero', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      totalAmount: 1100000,
      shippingCost: 100000,
      orderNumber: 'SO-001',
    } as any);

    mockPrisma.deliveryOrder.findMany.mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 200000 },
    ] as any);

    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    // goodsSubtotal = 1100000 - 100000 = 1000000
    expect(result.goodsSubtotal).toBe(1000000);
    // totalAmount = 1000000 + 200000 = 1200000
    expect(result.totalAmount).toBe(1200000);
  });

  it('logs activity when userId is provided', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      totalAmount: 1000000,
      shippingCost: null,
      orderNumber: 'SO-001',
    } as any);

    mockPrisma.deliveryOrder.findMany.mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 50000 },
    ] as any);

    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await syncSalesOrderShippingFromDeliveries('so-1', { userId: 'user-1' });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'SYNC_SHIPPING_FROM_DELIVERIES',
        entityType: 'SalesOrder',
        entityId: 'so-1',
      }),
    );
  });

  it('skips log when userId is not provided', async () => {
    mockPrisma.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      totalAmount: 1000000,
      shippingCost: null,
      orderNumber: 'SO-001',
    } as any);

    mockPrisma.deliveryOrder.findMany.mockResolvedValue([]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await syncSalesOrderShippingFromDeliveries('so-1');
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
