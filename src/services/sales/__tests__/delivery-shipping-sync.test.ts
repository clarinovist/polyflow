import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncSalesOrderShippingFromDeliveries } from '../delivery-shipping-sync';
import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';

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

vi.mock('@/lib/tools/audit', () => ({
  logActivity: vi.fn(),
}));

describe('syncSalesOrderShippingFromDeliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SO_CANCELLED when SO is cancelled', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CANCELLED',
      totalAmount: 1000000, shippingCost: 50000, orderNumber: 'SO-001',
    } as never);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.synced).toBe(false);
    expect(result.reason).toBe('SO_CANCELLED');
    expect(result.shippingCost).toBe(0);
  });

  it('sums billable delivery charges correctly', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CONFIRMED',
      totalAmount: 1050000, shippingCost: 50000, orderNumber: 'SO-001',
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
      { status: 'SHIPPED', totalCharge: 50000 },
    ] as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.synced).toBe(true);
    expect(result.reason).toBe('OK');
    expect(result.shippingCost).toBe(150000);
    expect(result.goodsSubtotal).toBe(1000000);
    expect(result.totalAmount).toBe(1150000);
    expect(result.billableDeliveryCount).toBe(2);
    expect(vi.mocked(prisma.salesOrder.update)).toHaveBeenCalledWith({
      where: { id: 'so-1' },
      data: { shippingCost: 150000, totalAmount: 1150000 },
    });
  });

  it('excludes CANCELLED deliveries from sum', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CONFIRMED',
      totalAmount: 1000000, shippingCost: null, orderNumber: 'SO-001',
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
      { status: 'CANCELLED', totalCharge: 50000 },
    ] as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.shippingCost).toBe(100000);
    expect(result.billableDeliveryCount).toBe(1);
  });

  it('includes RETURNED deliveries in sum (policy A2)', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CONFIRMED',
      totalAmount: 1000000, shippingCost: null, orderNumber: 'SO-001',
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
      { status: 'RETURNED', totalCharge: 50000 },
    ] as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.shippingCost).toBe(150000);
    expect(result.billableDeliveryCount).toBe(2);
  });

  it('returns INVOICE_LOCKED when invoice is UNPAID', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CONFIRMED',
      totalAmount: 1000000, shippingCost: null, orderNumber: 'SO-001',
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
    ] as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      { id: 'inv-1', status: 'UNPAID' },
    ] as never);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.synced).toBe(false);
    expect(result.reason).toBe('INVOICE_LOCKED');
    expect(result.shippingCost).toBe(100000);
    expect(vi.mocked(prisma.salesOrder.update)).not.toHaveBeenCalled();
  });

  it('blocks on PARTIAL, PAID, OVERDUE invoices too', async () => {
    for (const status of ['PARTIAL', 'PAID', 'OVERDUE']) {
      vi.clearAllMocks();
      vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
        id: 'so-1', status: 'CONFIRMED',
        totalAmount: 1000000, shippingCost: null, orderNumber: 'SO-001',
      } as never);
      vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
        { status: 'DELIVERED', totalCharge: 100000 },
      ] as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        { id: 'inv-1', status },
      ] as never);

      const result = await syncSalesOrderShippingFromDeliveries('so-1');
      expect(result.synced).toBe(false);
      expect(result.reason).toBe('INVOICE_LOCKED');
    }
  });

  it('updates DRAFT invoices when syncing', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CONFIRMED',
      totalAmount: 1000000, shippingCost: null, orderNumber: 'SO-001',
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
    ] as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      { id: 'inv-draft', status: 'DRAFT' },
    ] as never);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.synced).toBe(true);
    expect(result.invoiceUpdated).toBe(true);
    expect(vi.mocked(prisma.invoice.update)).toHaveBeenCalledWith({
      where: { id: 'inv-draft' },
      data: { totalAmount: 1100000 },
    });
  });

  it('skips deliveries with null totalCharge', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CONFIRMED',
      totalAmount: 1000000, shippingCost: null, orderNumber: 'SO-001',
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 100000 },
      { status: 'PENDING', totalCharge: null },
    ] as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.shippingCost).toBe(100000);
  });

  it('sets shippingCost to null when sum is 0', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CONFIRMED',
      totalAmount: 1000000, shippingCost: 50000, orderNumber: 'SO-001',
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { status: 'CANCELLED', totalCharge: 50000 },
    ] as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.shippingCost).toBe(0);
    expect(vi.mocked(prisma.salesOrder.update)).toHaveBeenCalledWith({
      where: { id: 'so-1' },
      data: { shippingCost: null, totalAmount: 950000 },
    });
  });

  it('calculates goodsSubtotal correctly when old shippingCost was non-zero', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CONFIRMED',
      totalAmount: 1100000, shippingCost: 100000, orderNumber: 'SO-001',
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 200000 },
    ] as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    const result = await syncSalesOrderShippingFromDeliveries('so-1');
    expect(result.goodsSubtotal).toBe(1000000);
    expect(result.totalAmount).toBe(1200000);
  });

  it('logs activity when userId is provided', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CONFIRMED',
      totalAmount: 1000000, shippingCost: null, orderNumber: 'SO-001',
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { status: 'DELIVERED', totalCharge: 50000 },
    ] as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    await syncSalesOrderShippingFromDeliveries('so-1', { userId: 'user-1' });
    expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'SYNC_SHIPPING_FROM_DELIVERIES',
        entityType: 'SalesOrder',
        entityId: 'so-1',
      }),
    );
  });

  it('skips log when userId is not provided', async () => {
    vi.mocked(prisma.salesOrder.findUniqueOrThrow).mockResolvedValue({
      id: 'so-1', status: 'CONFIRMED',
      totalAmount: 1000000, shippingCost: null, orderNumber: 'SO-001',
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    await syncSalesOrderShippingFromDeliveries('so-1');
    expect(vi.mocked(logActivity)).not.toHaveBeenCalled();
  });
});
