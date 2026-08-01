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
  it('returns findings when products are low', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        { product: 'Karung', qty: 5, threshold: 20 },
        { product: 'Gula', qty: 2, threshold: 10 },
      ]),
    });

    const result = await detectCriticalStock(tenantDb as never);
    expect(result).toHaveLength(2);
    expect(result[0].detector).toBe('critical_stock');
    expect(result[0].severity).toBe('critical');
    expect(result[0].requiredResources).toEqual(['/warehouse/inventory']);
  });

  it('returns empty when no critical stock', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectCriticalStock(tenantDb as never);
    expect(result).toHaveLength(0);
  });

  it('caps at 5 items with truncation message', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      product: `Product ${i}`,
      qty: i,
      threshold: 20,
    }));
    const tenantDb = makeTenantDb({ $queryRaw: vi.fn().mockResolvedValue(rows) });

    const result = await detectCriticalStock(tenantDb as never);
    expect(result).toHaveLength(5);
    expect(result[0].headline).toContain('7 produk');
    expect(result[0].detail).toContain('2 lainnya');
  });

  it('returns empty on DB error', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB error')),
    });

    const result = await detectCriticalStock(tenantDb as never);
    expect(result).toHaveLength(0);
  });
});

describe('detectStuckSalesOrders', () => {
  it('returns findings for old orders', async () => {
    const oldDate = new Date(Date.now() - 5 * 86_400_000);
    const tenantDb = makeTenantDb({
      salesOrder: {
        findMany: vi.fn().mockResolvedValue([
          { orderNumber: 'SO-001', customer: { name: 'ACME' }, orderDate: oldDate },
        ]),
      },
    });

    const result = await detectStuckSalesOrders(tenantDb as never);
    expect(result).toHaveLength(1);
    expect(result[0].detector).toBe('stuck_so');
    expect(result[0].headline).toContain('SO-001');
    expect(result[0].detail).toContain('hari');
  });

  it('returns empty when no stuck orders', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectStuckSalesOrders(tenantDb as never);
    expect(result).toHaveLength(0);
  });

  it('returns empty on DB error', async () => {
    const tenantDb = makeTenantDb({
      salesOrder: { findMany: vi.fn().mockRejectedValue(new Error('DB error')) },
    });
    const result = await detectStuckSalesOrders(tenantDb as never);
    expect(result).toHaveLength(0);
  });
});

describe('detectOverdueAr', () => {
  it('returns findings for overdue invoices', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          invoiceNumber: 'INV-001',
          totalAmount: 1000000,
          paidAmount: 500000,
          dueDate: new Date('2026-07-01'),
          soNumber: 'SO-001',
        },
      ]),
    });

    const result = await detectOverdueAr(tenantDb as never);
    expect(result).toHaveLength(1);
    expect(result[0].detector).toBe('overdue_ar');
    expect(result[0].severity).toBe('critical');
    expect(result[0].headline).toContain('INV-001');
    expect(result[0].detail).toContain('Rp');
  });

  it('returns empty when no overdue', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectOverdueAr(tenantDb as never);
    expect(result).toHaveLength(0);
  });
});

describe('detectOverdueAp', () => {
  it('returns findings for overdue purchase invoices', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          invoiceNumber: 'PI-001',
          totalAmount: 2000000,
          paidAmount: 0,
          dueDate: new Date('2026-07-01'),
          poNumber: 'PO-001',
        },
      ]),
    });

    const result = await detectOverdueAp(tenantDb as never);
    expect(result).toHaveLength(1);
    expect(result[0].detector).toBe('overdue_ap');
    expect(result[0].severity).toBe('critical');
    expect(result[0].headline).toContain('PI-001');
  });

  it('returns empty when no overdue', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectOverdueAp(tenantDb as never);
    expect(result).toHaveLength(0);
  });
});

describe('detectProductionNoProgress', () => {
  it('returns findings for orders with no recent execution', async () => {
    const oldDate = new Date(Date.now() - 30 * 3_600_000);
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        { id: 'po-1', orderNumber: 'SPK-001', lastActivity: oldDate, hoursSince: 30 },
      ]),
    });

    const result = await detectProductionNoProgress(tenantDb as never);
    expect(result).toHaveLength(1);
    expect(result[0].detector).toBe('production_no_progress');
    expect(result[0].severity).toBe('warning');
    expect(result[0].headline).toContain('SPK-001');
    expect(result[0].detail).toContain('jam');
  });

  it('returns findings for order with no execution at all', async () => {
    const oldDate = new Date(Date.now() - 48 * 3_600_000);
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        { id: 'po-2', orderNumber: 'SPK-002', lastActivity: oldDate, hoursSince: 48 },
      ]),
    });

    const result = await detectProductionNoProgress(tenantDb as never);
    expect(result).toHaveLength(1);
    expect(result[0].headline).toContain('SPK-002');
  });

  it('returns empty when all orders are progressing', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectProductionNoProgress(tenantDb as never);
    expect(result).toHaveLength(0);
  });

  it('caps at 5 items with truncation message', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      id: `po-${i}`,
      orderNumber: `SPK-${String(i).padStart(3, '0')}`,
      lastActivity: new Date(Date.now() - 30 * 3_600_000),
      hoursSince: 30,
    }));
    const tenantDb = makeTenantDb({ $queryRaw: vi.fn().mockResolvedValue(rows) });

    const result = await detectProductionNoProgress(tenantDb as never);
    expect(result).toHaveLength(5);
    expect(result[0].headline).toContain('7');
    expect(result[0].detail).toContain('lainnya');
  });

  it('returns empty on DB error', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const result = await detectProductionNoProgress(tenantDb as never);
    expect(result).toHaveLength(0);
  });
});
