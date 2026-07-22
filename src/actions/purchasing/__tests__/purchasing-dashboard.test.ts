import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma, mockGetSuggestedPurchases } = vi.hoisted(() => {
  const mockPrisma = {
    purchaseRequest: { count: vi.fn(), findMany: vi.fn() },
    purchaseOrder: { count: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    purchaseInvoice: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    supplier: { findUnique: vi.fn() },
  };
  const mockGetSuggestedPurchases = vi.fn();
  return { mockPrisma, mockGetSuggestedPurchases };
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

vi.mock('@/services/inventory/analytics-service', () => ({
  getSuggestedPurchases: mockGetSuggestedPurchases,
}));

import { getPurchasingShiftBoard, PR_AGING_THRESHOLD_DAYS } from '../purchasing-dashboard';
import { PurchaseOrderStatus, PurchaseRequestStatus } from '@prisma/client';

const decimal = (n: number) => ({ toNumber: () => n });

describe('getPurchasingShiftBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.purchaseRequest.count.mockResolvedValue(4);
    mockPrisma.purchaseOrder.count.mockImplementation(async (args?: {
      where?: { status?: string | { in?: string[] } };
    }) => {
      const status = args?.where?.status;
      if (status === PurchaseOrderStatus.DRAFT) return 2;
      if (status === PurchaseOrderStatus.SENT) return 3;
      if (status === PurchaseOrderStatus.PARTIAL_RECEIVED) return 1;
      return 0;
    });
    mockPrisma.purchaseInvoice.count.mockResolvedValue(2);
    mockPrisma.purchaseInvoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: 1_000_000, paidAmount: 200_000 },
    });
    mockPrisma.purchaseOrder.aggregate.mockResolvedValue({
      _sum: { totalAmount: decimal(5_000_000) },
    });

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - (PR_AGING_THRESHOLD_DAYS + 2));

    mockPrisma.purchaseRequest.findMany.mockResolvedValue([
      {
        id: 'pr-1',
        requestNumber: 'PR-001',
        createdAt: oldDate,
        status: PurchaseRequestStatus.APPROVED,
      },
    ]);
    mockPrisma.purchaseOrder.findMany.mockImplementation(async (args?: {
      where?: { status?: string };
    }) => {
      if (args?.where?.status === PurchaseOrderStatus.DRAFT) {
        return [{
          id: 'po-draft',
          orderNumber: 'PO-D1',
          createdAt: oldDate,
          supplier: { name: 'Supplier A' },
        }];
      }
      if (args?.where?.status === PurchaseOrderStatus.SENT) {
        return [{
          id: 'po-sent',
          orderNumber: 'PO-S1',
          supplier: { name: 'Supplier B' },
        }];
      }
      if (args?.where?.status === PurchaseOrderStatus.PARTIAL_RECEIVED) {
        return [{
          id: 'po-part',
          orderNumber: 'PO-P1',
          supplier: { name: 'Supplier C' },
        }];
      }
      return [];
    });
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNumber: 'PI-001',
        totalAmount: 500_000,
        paidAmount: 0,
        dueDate: oldDate,
        purchaseOrder: { supplier: { name: 'Supplier D' } },
      },
    ]);
    mockPrisma.purchaseOrder.groupBy.mockResolvedValue([
      {
        supplierId: 'sup-1',
        _count: { id: 3 },
        _sum: { totalAmount: decimal(2_000_000) },
      },
    ]);
    mockPrisma.supplier.findUnique.mockResolvedValue({ name: 'Top Supplier' });
    mockGetSuggestedPurchases.mockResolvedValue([
      {
        id: 'pv-1',
        name: 'PP Pure',
        skuCode: 'RM-PP',
        preferredSupplier: { name: 'Supplier X' },
        totalStock: 5,
        reorderPoint: decimal(20),
        reorderQuantity: decimal(50),
      },
    ]);
  });

  it('returns board counts for PR, DRAFT, SENT, PARTIAL, overdue AP', async () => {
    const res = await getPurchasingShiftBoard();
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.counts.pendingPrs).toBe(4);
    expect(res.data.counts.draftPos).toBe(2);
    expect(res.data.counts.awaitingReceiptPos).toBe(3);
    expect(res.data.counts.partialPos).toBe(1);
    expect(res.data.counts.overdueApCount).toBe(2);
    expect(res.data.counts.overdueApAmount).toBe(800_000);
    expect(res.data.counts.monthlySpend).toBe(5_000_000);
  });

  it('returns attention lists and suggested reorder', async () => {
    const res = await getPurchasingShiftBoard();
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.attention.agingPrs[0].requestNumber).toBe('PR-001');
    expect(res.data.attention.agingPrs[0].daysOld).toBeGreaterThanOrEqual(PR_AGING_THRESHOLD_DAYS);
    expect(res.data.attention.draftPos[0].orderNumber).toBe('PO-D1');
    expect(res.data.attention.awaitingReceipt[0].orderNumber).toBe('PO-S1');
    expect(res.data.attention.partialPos[0].orderNumber).toBe('PO-P1');
    expect(res.data.attention.overdueAp[0].invoiceNumber).toBe('PI-001');
    expect(res.data.attention.overdueAp[0].remaining).toBe(500_000);
    expect(res.data.attention.suggestedReorder[0].skuCode).toBe('RM-PP');
  });

  it('returns performance strip with top supplier', async () => {
    const res = await getPurchasingShiftBoard();
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.performance.monthlySpend).toBe(5_000_000);
    expect(res.data.performance.topSupplierName).toBe('Top Supplier');
    expect(res.data.performance.topSupplierSpend).toBe(2_000_000);
  });

  it('queries aging PRs with createdAt threshold', async () => {
    await getPurchasingShiftBoard();
    const agingCall = mockPrisma.purchaseRequest.findMany.mock.calls[0]?.[0] as {
      where?: { createdAt?: { lte?: Date }; status?: { in?: string[] } };
    };
    expect(agingCall?.where?.status?.in).toEqual(
      expect.arrayContaining([PurchaseRequestStatus.OPEN, PurchaseRequestStatus.APPROVED]),
    );
    expect(agingCall?.where?.createdAt?.lte).toBeInstanceOf(Date);
  });
});
