import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/bot/help-articles', () => ({
  listPublishedArticles: vi.fn().mockResolvedValue([]),
}));

vi.mock('../finding-routing', () => ({
  resolveUsersForResources: vi.fn().mockResolvedValue([]),
}));

import { notifyNewFindings } from '../finding-notify';
import { listPublishedArticles } from '@/lib/bot/help-articles';
import { resolveUsersForResources } from '../finding-routing';

function makeTenantDb(overrides: Record<string, unknown> = {}) {
  return {
    finding: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    notification: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  };
}

describe('notifyNewFindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPublishedArticles).mockResolvedValue([]);
    vi.mocked(resolveUsersForResources).mockResolvedValue([]);
  });

  it('does nothing and skips all queries when findingIds is empty', async () => {
    const tenantDb = makeTenantDb();
    const outcome = await notifyNewFindings(tenantDb as never, []);
    expect(outcome).toEqual({ findingsProcessed: 0, notificationsSent: 0 });
    expect(tenantDb.finding.findMany).not.toHaveBeenCalled();
  });

  it('creates one notification per eligible user for a new finding', async () => {
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'f-1',
            detector: 'critical_stock',
            headline: 'Karung: 5 < 20',
            detail: null,
            requiredResources: ['/warehouse/inventory'],
            entityType: 'Product',
            entityId: 'p-1',
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      notification: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    });
    vi.mocked(resolveUsersForResources).mockResolvedValue(['user-1', 'user-2']);

    const outcome = await notifyNewFindings(tenantDb as never, ['f-1']);

    expect(outcome).toEqual({ findingsProcessed: 1, notificationsSent: 2 });
    expect(tenantDb.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user-1',
          type: 'LOW_STOCK',
          title: 'Karung: 5 < 20',
          link: '/findings/f-1',
        }),
        expect.objectContaining({ userId: 'user-2', type: 'LOW_STOCK' }),
      ],
    });
  });

  it('maps production_no_progress to PRODUCTION_STALLED', async () => {
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'f-2',
            detector: 'production_no_progress',
            headline: 'SPK SPK-001',
            detail: '30 jam tanpa progres',
            requiredResources: ['/production/orders'],
            entityType: 'ProductionOrder',
            entityId: 'po-1',
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    vi.mocked(resolveUsersForResources).mockResolvedValue(['user-1']);

    await notifyNewFindings(tenantDb as never, ['f-2']);

    expect(tenantDb.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ type: 'PRODUCTION_STALLED' })],
    });
  });

  it('skips creating notifications when no user is eligible', async () => {
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'f-1',
            detector: 'critical_stock',
            headline: 'x',
            detail: null,
            requiredResources: ['/warehouse/inventory'],
            entityType: null,
            entityId: null,
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    vi.mocked(resolveUsersForResources).mockResolvedValue([]);

    const outcome = await notifyNewFindings(tenantDb as never, ['f-1']);

    expect(outcome.notificationsSent).toBe(0);
    expect(tenantDb.notification.createMany).not.toHaveBeenCalled();
  });

  it('attaches the top help article slug for the detector module', async () => {
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'f-1',
            detector: 'critical_stock',
            headline: 'x',
            detail: null,
            requiredResources: ['/warehouse/inventory'],
            entityType: null,
            entityId: null,
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    vi.mocked(listPublishedArticles).mockResolvedValue([
      { slug: 'panduan-stok-kritis' },
    ] as never);

    await notifyNewFindings(tenantDb as never, ['f-1']);

    expect(listPublishedArticles).toHaveBeenCalledWith({
      module: 'warehouse',
      limit: 1,
    });
    expect(tenantDb.finding.update).toHaveBeenCalledWith({
      where: { id: 'f-1' },
      data: { helpArticleSlug: 'panduan-stok-kritis' },
    });
  });

  it('does not block notification when the help-article lookup fails', async () => {
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'f-1',
            detector: 'critical_stock',
            headline: 'x',
            detail: null,
            requiredResources: ['/warehouse/inventory'],
            entityType: null,
            entityId: null,
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    vi.mocked(listPublishedArticles).mockRejectedValue(new Error('KB down'));
    vi.mocked(resolveUsersForResources).mockResolvedValue(['user-1']);

    const outcome = await notifyNewFindings(tenantDb as never, ['f-1']);

    expect(outcome.notificationsSent).toBe(1);
    expect(tenantDb.finding.update).not.toHaveBeenCalled();
  });
});
