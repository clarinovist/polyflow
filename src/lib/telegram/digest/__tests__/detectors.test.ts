import { describe, it, expect, vi } from 'vitest';
import {
  detectCriticalStock,
  detectStuckSalesOrders,
  detectOverdueAr,
  detectOverdueAp,
  detectProductionNoProgress,
} from '../detectors';

function makeTenantDb(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    productionOrder: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe('detectCriticalStock', () => {
  it('returns items with stable entity id when products are low', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        { productId: 'p-1', product: 'Karung', qty: 5, threshold: 20 },
        { productId: 'p-2', product: 'Gula', qty: 2, threshold: 10 },
      ]),
    });

    const result = await detectCriticalStock(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.detector).toBe('critical_stock');
    expect(result.requiredResources).toEqual(['/warehouse/inventory']);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].entityId).toBe('p-1');
    expect(result.items[0].entityKey).toBe('critical_stock:p-1');
    expect(result.items[0].severity).toBe('critical');
  });

  it('returns no items when no critical stock', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectCriticalStock(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.items).toHaveLength(0);
  });

  it('does not cap or synthesize a summary row — that lives in format.ts', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      productId: `p-${i}`,
      product: `Product ${i}`,
      qty: i,
      threshold: 20,
    }));
    const tenantDb = makeTenantDb({ $queryRaw: vi.fn().mockResolvedValue(rows) });

    const result = await detectCriticalStock(tenantDb as never);
    expect(result.items).toHaveLength(7);
    expect(result.items[0].headline).toContain('Product 0');
  });

  it('reports status failed (not empty items) on DB error', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB error')),
    });

    const result = await detectCriticalStock(tenantDb as never);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('DB error');
    expect(result.items).toHaveLength(0);
  });
});

describe('detectStuckSalesOrders', () => {
  it('returns items with entity id for old orders', async () => {
    const oldDate = new Date(Date.now() - 5 * 86_400_000);
    const tenantDb = makeTenantDb({
      salesOrder: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'so-1',
            orderNumber: 'SO-001',
            customer: { name: 'ACME' },
            orderDate: oldDate,
          },
        ]),
      },
    });

    const result = await detectStuckSalesOrders(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.detector).toBe('stuck_so');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].entityId).toBe('so-1');
    expect(result.items[0].headline).toContain('SO-001');
    expect(result.items[0].detail).toContain('hari');
  });

  it('returns no items when no stuck orders', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectStuckSalesOrders(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.items).toHaveLength(0);
  });

  it('reports status failed on DB error', async () => {
    const tenantDb = makeTenantDb({
      salesOrder: { findMany: vi.fn().mockRejectedValue(new Error('DB error')) },
    });
    const result = await detectStuckSalesOrders(tenantDb as never);
    expect(result.status).toBe('failed');
    expect(result.items).toHaveLength(0);
  });
});

describe('detectOverdueAr', () => {
  it('returns items with entity id for overdue invoices', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          invoiceId: 'inv-1',
          invoiceNumber: 'INV-001',
          totalAmount: 1000000,
          paidAmount: 500000,
          dueDate: new Date('2026-07-01'),
          soNumber: 'SO-001',
        },
      ]),
    });

    const result = await detectOverdueAr(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.detector).toBe('overdue_ar');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].entityId).toBe('inv-1');
    expect(result.items[0].severity).toBe('critical');
    expect(result.items[0].headline).toContain('INV-001');
    expect(result.items[0].detail).toContain('Rp');
  });

  it('returns no items when no overdue', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectOverdueAr(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.items).toHaveLength(0);
  });

  it('reports status failed on DB error', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const result = await detectOverdueAr(tenantDb as never);
    expect(result.status).toBe('failed');
    expect(result.items).toHaveLength(0);
  });
});

describe('detectOverdueAp', () => {
  it('returns items with entity id for overdue purchase invoices', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          invoiceId: 'pinv-1',
          invoiceNumber: 'PI-001',
          totalAmount: 2000000,
          paidAmount: 0,
          dueDate: new Date('2026-07-01'),
          poNumber: 'PO-001',
        },
      ]),
    });

    const result = await detectOverdueAp(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.detector).toBe('overdue_ap');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].entityId).toBe('pinv-1');
    expect(result.items[0].severity).toBe('critical');
    expect(result.items[0].headline).toContain('PI-001');
  });

  it('returns no items when no overdue', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectOverdueAp(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.items).toHaveLength(0);
  });

  it('reports status failed on DB error', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const result = await detectOverdueAp(tenantDb as never);
    expect(result.status).toBe('failed');
    expect(result.items).toHaveLength(0);
  });
});

describe('detectProductionNoProgress', () => {
  it('returns items with entity id for orders with no recent execution', async () => {
    const oldDate = new Date(Date.now() - 30 * 3_600_000);
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        { id: 'po-1', orderNumber: 'SPK-001', lastActivity: oldDate, hoursSince: 30 },
      ]),
    });

    const result = await detectProductionNoProgress(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.detector).toBe('production_no_progress');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].entityId).toBe('po-1');
    expect(result.items[0].severity).toBe('warning');
    expect(result.items[0].headline).toContain('SPK-001');
    expect(result.items[0].detail).toContain('jam');
  });

  it('returns no items when all orders are progressing', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectProductionNoProgress(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.items).toHaveLength(0);
  });

  it('does not cap or synthesize a summary row — that lives in format.ts', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      id: `po-${i}`,
      orderNumber: `SPK-${String(i).padStart(3, '0')}`,
      lastActivity: new Date(Date.now() - 30 * 3_600_000),
      hoursSince: 30,
    }));
    const tenantDb = makeTenantDb({ $queryRaw: vi.fn().mockResolvedValue(rows) });

    const result = await detectProductionNoProgress(tenantDb as never);
    expect(result.items).toHaveLength(7);
    expect(result.items[0].headline).toContain('SPK-000');
  });

  it('reports status failed on DB error', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const result = await detectProductionNoProgress(tenantDb as never);
    expect(result.status).toBe('failed');
    expect(result.items).toHaveLength(0);
  });
});
