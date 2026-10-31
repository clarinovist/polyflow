import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
  getMainPrisma: vi.fn(),
  getTenantDb: vi.fn(),
}));

vi.mock('@/lib/telegram/digest/run-detectors', () => ({
  runEntitledDetectors: vi.fn(),
}));

vi.mock('../finding-sync', () => ({
  syncFindings: vi.fn(),
}));

import { runFindingsCycle } from '../findings-cycle';
import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import { runEntitledDetectors } from '@/lib/telegram/digest/run-detectors';
import { syncFindings } from '../finding-sync';
import type { DetectionResult } from '@/lib/telegram/digest/detection-types';

const tenants = [
  { id: 't-a', subdomain: 'tenant-a', dbUrl: 'postgresql://a' },
  { id: 't-b', subdomain: 'tenant-b', dbUrl: 'postgresql://b' },
  { id: 't-c', subdomain: 'tenant-c', dbUrl: 'postgresql://c' },
];

const detection: DetectionResult[] = [
  {
    detector: 'overdue_ap',
    status: 'ok',
    requiredResources: ['/purchasing/invoices'],
    items: [
      {
        entityKey: 'overdue_ap:pi-1',
        entityType: 'PurchaseInvoice',
        entityId: 'pi-1',
        severity: 'warning',
        headline: 'Invoice PI-1',
      },
    ],
  },
  {
    detector: 'critical_stock',
    status: 'skipped',
    error: 'module INVENTORY not entitled',
    requiredResources: ['/warehouse/inventory'],
    items: [],
  },
];

const syncOutcome = {
  created: ['f-1'],
  reopened: [],
  updated: [],
  unsnoozed: [],
  severityRaised: [],
  autoResolved: [],
  skippedDetectors: ['critical_stock'],
};

describe('runFindingsCycle', () => {
  const findMany = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    findMany.mockResolvedValue(tenants);
    vi.mocked(getMainPrisma).mockReturnValue({ tenant: { findMany } } as never);
    vi.mocked(getTenantDb).mockImplementation((url: string) => ({ url }) as never);
    vi.mocked(runEntitledDetectors).mockResolvedValue(detection);
    vi.mocked(syncFindings).mockResolvedValue(syncOutcome);
  });

  it('does nothing for any tenant when no mode is configured', async () => {
    const result = await runFindingsCycle({});

    expect(result.tenants.map((t) => t.mode)).toEqual(['off', 'off', 'off']);
    expect(runEntitledDetectors).not.toHaveBeenCalled();
    expect(syncFindings).not.toHaveBeenCalled();
  });

  it('loads only ACTIVE tenants', async () => {
    await runFindingsCycle({});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    );
  });

  it('syncs observe tenants as baseline and notify tenants with SLA, each on its own client', async () => {
    const result = await runFindingsCycle({
      FINDINGS_OBSERVE_TENANTS: 'tenant-a',
      FINDINGS_NOTIFY_TENANTS: 'tenant-b',
    });

    expect(result.tenants.map((t) => [t.tenant, t.mode])).toEqual([
      ['tenant-a', 'observe'],
      ['tenant-b', 'notify'],
      ['tenant-c', 'off'],
    ]);
    expect(runEntitledDetectors).toHaveBeenNthCalledWith(1, 't-a', { url: 'postgresql://a' });
    expect(runEntitledDetectors).toHaveBeenNthCalledWith(2, 't-b', { url: 'postgresql://b' });
    expect(syncFindings).toHaveBeenNthCalledWith(1, { url: 'postgresql://a' }, detection, {
      baseline: true,
    });
    expect(syncFindings).toHaveBeenNthCalledWith(2, { url: 'postgresql://b' }, detection, {
      baseline: false,
    });
  });

  it('reports per-detector status and sync counts for the cron log', async () => {
    const result = await runFindingsCycle({ FINDINGS_OBSERVE_TENANTS: 'tenant-a' });

    expect(result.tenants[0]).toEqual({
      tenant: 'tenant-a',
      mode: 'observe',
      detectors: [
        { detector: 'overdue_ap', status: 'ok', items: 1 },
        {
          detector: 'critical_stock',
          status: 'skipped',
          items: 0,
          error: 'module INVENTORY not entitled',
        },
      ],
      sync: {
        created: 1,
        reopened: 0,
        updated: 0,
        unsnoozed: 0,
        severityRaised: 0,
        autoResolved: 0,
        skippedDetectors: ['critical_stock'],
      },
    });
  });

  it('keeps going when one tenant fails', async () => {
    vi.mocked(syncFindings)
      .mockRejectedValueOnce(new Error('tenant-a db down'))
      .mockResolvedValueOnce(syncOutcome);

    const result = await runFindingsCycle({
      FINDINGS_OBSERVE_TENANTS: 'tenant-a,tenant-b',
    });

    expect(result.tenants[0]).toEqual({
      tenant: 'tenant-a',
      mode: 'observe',
      error: 'tenant-a db down',
    });
    expect(result.tenants[1].sync?.created).toBe(1);
  });
});
