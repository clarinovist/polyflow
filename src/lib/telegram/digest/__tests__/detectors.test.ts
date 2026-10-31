import { describe, it, expect, vi } from 'vitest';
import {
  detectCriticalStock,
  detectStuckSalesOrders,
  detectOverdueAr,
  detectOverdueAp,
  detectProductionNoProgress,
  daysOverdue,
  overdueSeverity,
} from '../detectors';

function makeTenantDb(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    productionOrder: { findMany: vi.fn().mockResolvedValue([]) },
    productVariant: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

const RM = { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' };
const FG = { locationType: 'INTERNAL', locationPurpose: 'FINISHED_GOOD' };
const WIP = { locationType: 'INTERNAL', locationPurpose: 'WIP' };
const CUSTOMER_OWNED = { locationType: 'CUSTOMER_OWNED', locationPurpose: 'RAW_MATERIAL' };

function variant(
  id: string,
  minStockAlert: number | null,
  inventories: Array<{ quantity: number; location: Record<string, string> }>,
) {
  return { id, name: `Variant ${id}`, minStockAlert, inventories };
}

function stockDb(variants: unknown[]) {
  return makeTenantDb({
    productVariant: { findMany: vi.fn().mockResolvedValue(variants) },
  });
}

describe('detectCriticalStock', () => {
  it('flags a variant whose alert-location stock is below its minimum, keyed by variant', async () => {
    const tenantDb = stockDb([
      variant('v-1', 20, [{ quantity: 12, location: RM }]),
    ]);

    const result = await detectCriticalStock(tenantDb as never);
    expect(result.status).toBe('ok');
    expect(result.detector).toBe('critical_stock');
    expect(result.requiredResources).toEqual(['/warehouse/inventory']);
    expect(result.items).toEqual([
      expect.objectContaining({
        entityKey: 'critical_stock:v-1',
        entityType: 'ProductVariant',
        entityId: 'v-1',
        severity: 'warning',
        headline: 'Variant v-1: 12 < 20',
      }),
    ]);
  });

  it('only counts internal RAW_MATERIAL and FINISHED_GOOD locations (legacy definition)', async () => {
    const tenantDb = stockDb([
      // 5 in RM + 5 in FG = 10 < 20 → flagged; WIP and customer-owned stock ignored.
      variant('v-1', 20, [
        { quantity: 5, location: RM },
        { quantity: 5, location: FG },
        { quantity: 100, location: WIP },
        { quantity: 100, location: CUSTOMER_OWNED },
      ]),
    ]);

    const result = await detectCriticalStock(tenantDb as never);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].headline).toBe('Variant v-1: 10 < 20');
  });

  it('marks critical at or below half the minimum', async () => {
    const tenantDb = stockDb([
      variant('half', 20, [{ quantity: 10, location: RM }]),
      variant('above-half', 20, [{ quantity: 11, location: RM }]),
    ]);

    const result = await detectCriticalStock(tenantDb as never);
    const severity = Object.fromEntries(result.items.map((i) => [i.entityId, i.severity]));
    expect(severity).toEqual({ half: 'critical', 'above-half': 'warning' });
  });

  it('skips variants at zero, at/above minimum, or with only non-alert stock (legacy definition)', async () => {
    const tenantDb = stockDb([
      variant('zero', 20, [{ quantity: 0, location: RM }]),
      variant('at-min', 20, [{ quantity: 20, location: RM }]),
      variant('wip-only', 20, [{ quantity: 3, location: WIP }]),
      variant('no-min', null, [{ quantity: 1, location: RM }]),
    ]);

    const result = await detectCriticalStock(tenantDb as never);
    expect(result.items).toHaveLength(0);
  });

  it('queries only non-archived variants with a minimum set', async () => {
    const tenantDb = stockDb([]);
    await detectCriticalStock(tenantDb as never);
    const args = tenantDb.productVariant.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ minStockAlert: { not: null }, archivedAt: null });
  });

  it('reports truncated when the candidate scan hits the fetch cap', async () => {
    const variants = Array.from({ length: 500 }, (_, i) =>
      variant(`v-${i}`, 20, [{ quantity: 30, location: RM }]),
    );
    const result = await detectCriticalStock(stockDb(variants) as never);
    expect(result.status).toBe('truncated');
  });

  it('reports status failed (not empty items) on DB error', async () => {
    const tenantDb = makeTenantDb({
      productVariant: { findMany: vi.fn().mockRejectedValue(new Error('DB error')) },
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

const NOW = new Date('2026-10-31T03:00:00Z'); // 10:00 WIB

describe('daysOverdue / overdueSeverity', () => {
  it('counts whole days past due and never goes negative', () => {
    expect(daysOverdue(new Date('2026-10-30T03:00:00Z'), NOW)).toBe(1);
    expect(daysOverdue(new Date('2026-11-05T00:00:00Z'), NOW)).toBe(0);
    expect(daysOverdue(null, NOW)).toBe(0);
  });

  it('is warning up to 30 days and critical beyond', () => {
    expect(overdueSeverity(30)).toBe('warning');
    expect(overdueSeverity(31)).toBe('critical');
  });
});

describe('detectOverdueAr', () => {
  it('returns one item per invoice with customer, aging and outstanding', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          invoiceId: 'inv-1',
          invoiceNumber: 'INV-001',
          totalAmount: 1000000,
          paidAmount: 500000,
          creditedAmount: 0,
          priceAdjustmentAmount: 0,
          dueDate: new Date('2026-10-21T03:00:00Z'),
          soNumber: 'SO-001',
          customerName: 'Synthetic Customer',
        },
      ]),
    });

    const result = await detectOverdueAr(tenantDb as never, NOW);
    expect(result.status).toBe('ok');
    expect(result.detector).toBe('overdue_ar');
    expect(result.requiredResources).toEqual(['/sales/invoices', '/finance/invoices']);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      entityKey: 'overdue_ar:inv-1',
      entityId: 'inv-1',
      severity: 'warning',
    });
    expect(result.items[0].headline).toContain('INV-001');
    expect(result.items[0].headline).toContain('Synthetic Customer');
    expect(result.items[0].detail).toContain('10 hari');
    expect(result.items[0].detail).toContain('Rp 500.000');
  });

  it('marks invoices more than 30 days overdue as critical', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          invoiceId: 'inv-old',
          invoiceNumber: 'INV-OLD',
          totalAmount: 100,
          paidAmount: 0,
          creditedAmount: 0,
          priceAdjustmentAmount: 0,
          dueDate: new Date('2026-09-01T00:00:00Z'),
          soNumber: null,
          customerName: null,
        },
      ]),
    });

    const result = await detectOverdueAr(tenantDb as never, NOW);
    expect(result.items[0].severity).toBe('critical');
    expect(result.items[0].headline).toContain('Tanpa customer');
  });

  it('returns no items when no overdue', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectOverdueAr(tenantDb as never, NOW);
    expect(result.status).toBe('ok');
    expect(result.items).toHaveLength(0);
  });

  it('reports status failed on DB error', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const result = await detectOverdueAr(tenantDb as never, NOW);
    expect(result.status).toBe('failed');
    expect(result.items).toHaveLength(0);
  });
});

describe('detectOverdueAp', () => {
  it('returns one item per purchase invoice with supplier and aging', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          invoiceId: 'pinv-1',
          invoiceNumber: 'PI-001',
          totalAmount: 2000000,
          paidAmount: 0,
          dueDate: new Date('2026-09-15T00:00:00Z'),
          poNumber: 'PO-001',
          supplierName: 'Synthetic Supplier',
        },
      ]),
    });

    const result = await detectOverdueAp(tenantDb as never, NOW);
    expect(result.status).toBe('ok');
    expect(result.detector).toBe('overdue_ap');
    expect(result.requiredResources).toEqual(['/purchasing/invoices', '/finance/invoices']);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ entityId: 'pinv-1', severity: 'critical' });
    expect(result.items[0].headline).toContain('PI-001');
    expect(result.items[0].headline).toContain('Synthetic Supplier');
  });

  it('uses the start of the WIB business day as the due boundary (legacy parity)', async () => {
    const tenantDb = makeTenantDb();
    await detectOverdueAp(tenantDb as never, NOW);
    const sql = tenantDb.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    // 2026-10-31 10:00 WIB → business day starts 2026-10-31 00:00 WIB = 2026-10-30T17:00Z.
    expect(sql.values[0]).toEqual(new Date('2026-10-30T17:00:00.000Z'));
  });

  it('returns no items when no overdue', async () => {
    const tenantDb = makeTenantDb();
    const result = await detectOverdueAp(tenantDb as never, NOW);
    expect(result.status).toBe('ok');
    expect(result.items).toHaveLength(0);
  });

  it('reports status failed on DB error', async () => {
    const tenantDb = makeTenantDb({
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const result = await detectOverdueAp(tenantDb as never, NOW);
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
