import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/modules/tenant-entitlements', () => ({
  hasTenantModuleDirect: vi.fn(),
}));

vi.mock('../detectors', () => ({
  detectCriticalStock: vi.fn(),
  detectStuckSalesOrders: vi.fn(),
  detectOverdueAr: vi.fn(),
  detectOverdueAp: vi.fn(),
  detectMissingFinanceJournals: vi.fn(),
  detectProductionNoProgress: vi.fn(),
}));

import { runEntitledDetectors } from '../run-detectors';
import { hasTenantModuleDirect } from '@/lib/modules/tenant-entitlements';
import * as detectors from '../detectors';
import type { DetectionResult } from '../detection-types';

const tenantDb = {} as never;

function ok(detector: string): DetectionResult {
  return { detector, status: 'ok', requiredResources: [], items: [] };
}

function byDetector(results: DetectionResult[]) {
  return Object.fromEntries(results.map((r) => [r.detector, r]));
}

describe('runEntitledDetectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(hasTenantModuleDirect).mockResolvedValue(true);
    vi.mocked(detectors.detectCriticalStock).mockResolvedValue(ok('critical_stock'));
    vi.mocked(detectors.detectStuckSalesOrders).mockResolvedValue(ok('stuck_so'));
    vi.mocked(detectors.detectOverdueAr).mockResolvedValue(ok('overdue_ar'));
    vi.mocked(detectors.detectOverdueAp).mockResolvedValue(ok('overdue_ap'));
    vi.mocked(detectors.detectMissingFinanceJournals).mockResolvedValue(
      ok('missing_finance_journal'),
    );
    vi.mocked(detectors.detectProductionNoProgress).mockResolvedValue(
      ok('production_no_progress'),
    );
  });

  it('runs all six detectors against the given tenant client when entitled', async () => {
    const results = await runEntitledDetectors('t-1', tenantDb);

    expect(results.map((r) => r.status)).toEqual(Array(6).fill('ok'));
    expect(detectors.detectOverdueAr).toHaveBeenCalledWith(tenantDb);
  });

  it('marks detectors of a non-entitled module as skipped without running them', async () => {
    vi.mocked(hasTenantModuleDirect).mockImplementation(
      async (_tenantId, moduleKey) => moduleKey !== 'INVENTORY',
    );

    const results = byDetector(await runEntitledDetectors('t-1', tenantDb));

    expect(detectors.detectCriticalStock).not.toHaveBeenCalled();
    expect(results.critical_stock.status).toBe('skipped');
    expect(results.critical_stock.requiredResources).toEqual(['/warehouse/inventory']);
    expect(results.overdue_ar.status).toBe('ok');
  });

  it('gates overdue AP on PURCHASING, not FINANCE', async () => {
    vi.mocked(hasTenantModuleDirect).mockImplementation(
      async (_tenantId, moduleKey) => moduleKey !== 'PURCHASING',
    );

    const results = byDetector(await runEntitledDetectors('t-1', tenantDb));

    expect(results.overdue_ap.status).toBe('skipped');
    expect(results.overdue_ar.status).toBe('ok');
  });

  it('treats a failed entitlement check as skipped, never as ok', async () => {
    vi.mocked(hasTenantModuleDirect).mockRejectedValue(new Error('registry down'));

    const results = await runEntitledDetectors('t-1', tenantDb);

    expect(results.every((r) => r.status === 'skipped')).toBe(true);
    expect(results[0].error).toBe('entitlement check failed');
  });

  it('turns a detector that throws into a failed result instead of dropping it', async () => {
    vi.mocked(detectors.detectStuckSalesOrders).mockRejectedValue(new Error('boom'));

    const results = byDetector(await runEntitledDetectors('t-1', tenantDb));

    expect(results.stuck_so).toMatchObject({ status: 'failed', error: 'boom' });
    expect(results.stuck_so.requiredResources).toEqual(['/sales/orders']);
    expect(results.overdue_ap.status).toBe('ok');
  });
});
