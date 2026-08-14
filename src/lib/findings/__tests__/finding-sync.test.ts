import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncFindings } from '../finding-sync';
import type { DetectionResult } from '@/lib/telegram/digest/detection-types';

type FakeFinding = {
  id: string;
  fingerprint: string;
  detector: string;
  severity: 'WARNING' | 'CRITICAL';
  status: 'UNCLAIMED' | 'CLAIMED' | 'RESOLVED' | 'SNOOZED';
  headline: string;
  detail?: string | null;
  requiredResources: string[];
  entityType?: string | null;
  entityId?: string | null;
  claimedById?: string | null;
  claimedAt?: Date | null;
  resolvedById?: string | null;
  resolvedAt?: Date | null;
  resolutionNote?: string | null;
  autoResolved: boolean;
  slaDueAt?: Date | null;
  escalatedAt?: Date | null;
  lastSeenAt?: Date;
  occurrences: number;
};

function makeFakeTenantDb(seed: FakeFinding[] = []) {
  const store = new Map<string, FakeFinding>();
  for (const f of seed) store.set(f.id, f);
  let counter = 0;

  const finding = {
    findUnique: vi.fn(async ({ where }: { where: { fingerprint: string } }) => {
      return [...store.values()].find((f) => f.fingerprint === where.fingerprint) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      counter += 1;
      const id = `f-${counter}`;
      const { events: _events, ...rest } = data;
      const record = { id, occurrences: 1, autoResolved: false, ...rest } as FakeFinding;
      store.set(id, record);
      return record;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const existing = store.get(where.id);
        if (!existing) throw new Error(`not found: ${where.id}`);
        const { events: _events, occurrences, ...rest } = data;
        const updated: FakeFinding = { ...existing, ...(rest as Partial<FakeFinding>) };
        if (
          occurrences &&
          typeof occurrences === 'object' &&
          'increment' in occurrences
        ) {
          updated.occurrences = existing.occurrences + (occurrences as { increment: number }).increment;
        }
        store.set(where.id, updated);
        return updated;
      },
    ),
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { detector: string; status: { in: string[] } };
      }) => {
        return [...store.values()].filter(
          (f) => f.detector === where.detector && where.status.in.includes(f.status),
        );
      },
    ),
  };

  return { tenantDb: { finding } as unknown as import('@prisma/client').PrismaClient, store };
}

function detectionResult(overrides: Partial<DetectionResult> = {}): DetectionResult {
  return {
    detector: 'production_no_progress',
    status: 'ok',
    requiredResources: ['/production/orders'],
    items: [],
    ...overrides,
  };
}

describe('syncFindings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a new finding with fingerprint and SLA derived from severity', async () => {
    const { tenantDb, store } = makeFakeTenantDb();
    const results = [
      detectionResult({
        items: [
          {
            entityKey: 'production_no_progress:po-1',
            entityType: 'ProductionOrder',
            entityId: 'po-1',
            severity: 'warning',
            headline: 'SPK SPK-001',
            detail: '30 jam tanpa progres',
          },
        ],
      }),
    ];

    const outcome = await syncFindings(tenantDb, results);

    expect(outcome.created).toHaveLength(1);
    const created = [...store.values()][0];
    expect(created.fingerprint).toBe('production_no_progress:po-1');
    expect(created.status).toBe('UNCLAIMED');
    expect(created.slaDueAt).toEqual(new Date('2026-08-17T00:00:00Z')); // WARNING = +72h
  });

  it('uses a 24h SLA for critical severity', async () => {
    const { tenantDb, store } = makeFakeTenantDb();
    const results = [
      detectionResult({
        detector: 'critical_stock',
        requiredResources: ['/warehouse/inventory'],
        items: [
          {
            entityKey: 'critical_stock:p-1',
            entityType: 'Product',
            entityId: 'p-1',
            severity: 'critical',
            headline: 'Karung: 5 < 20',
          },
        ],
      }),
    ];

    await syncFindings(tenantDb, results);
    const created = [...store.values()][0];
    expect(created.slaDueAt).toEqual(new Date('2026-08-15T00:00:00Z')); // CRITICAL = +24h
  });

  it('refreshes headline/lastSeenAt on a still-open finding without touching status or claim', async () => {
    const { tenantDb, store } = makeFakeTenantDb([
      {
        id: 'f-1',
        fingerprint: 'production_no_progress:po-1',
        detector: 'production_no_progress',
        severity: 'WARNING',
        status: 'CLAIMED',
        headline: 'old headline',
        requiredResources: ['/production/orders'],
        claimedById: 'user-1',
        autoResolved: false,
        occurrences: 1,
      },
    ]);
    const results = [
      detectionResult({
        items: [
          {
            entityKey: 'production_no_progress:po-1',
            entityType: 'ProductionOrder',
            entityId: 'po-1',
            severity: 'warning',
            headline: 'new headline',
          },
        ],
      }),
    ];

    const outcome = await syncFindings(tenantDb, results);

    expect(outcome.updated).toEqual(['f-1']);
    const updated = store.get('f-1')!;
    expect(updated.headline).toBe('new headline');
    expect(updated.status).toBe('CLAIMED');
    expect(updated.claimedById).toBe('user-1');
  });

  it('reopens a resolved finding that recurs, bumping occurrences and clearing ownership', async () => {
    const { tenantDb, store } = makeFakeTenantDb([
      {
        id: 'f-1',
        fingerprint: 'critical_stock:p-1',
        detector: 'critical_stock',
        severity: 'CRITICAL',
        status: 'RESOLVED',
        headline: 'old',
        requiredResources: ['/warehouse/inventory'],
        resolvedById: 'user-2',
        resolvedAt: new Date('2026-08-10T00:00:00Z'),
        autoResolved: true,
        occurrences: 1,
      },
    ]);
    const results = [
      detectionResult({
        detector: 'critical_stock',
        requiredResources: ['/warehouse/inventory'],
        items: [
          {
            entityKey: 'critical_stock:p-1',
            entityType: 'Product',
            entityId: 'p-1',
            severity: 'critical',
            headline: 'Karung low again',
          },
        ],
      }),
    ];

    const outcome = await syncFindings(tenantDb, results);

    expect(outcome.reopened).toEqual(['f-1']);
    const reopened = store.get('f-1')!;
    expect(reopened.status).toBe('UNCLAIMED');
    expect(reopened.occurrences).toBe(2);
    expect(reopened.resolvedById).toBeNull();
    expect(reopened.autoResolved).toBe(false);
  });

  it('auto-resolves an open finding whose detector ran clean but no longer reports it', async () => {
    const { tenantDb, store } = makeFakeTenantDb([
      {
        id: 'f-1',
        fingerprint: 'production_no_progress:po-old',
        detector: 'production_no_progress',
        severity: 'WARNING',
        status: 'UNCLAIMED',
        headline: 'stale',
        requiredResources: ['/production/orders'],
        autoResolved: false,
        occurrences: 1,
      },
    ]);
    const results = [detectionResult({ items: [] })]; // ran clean, found nothing

    const outcome = await syncFindings(tenantDb, results);

    expect(outcome.autoResolved).toEqual(['f-1']);
    const resolved = store.get('f-1')!;
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.autoResolved).toBe(true);
  });

  it('does NOT auto-resolve when the detector failed — the core regression guard', async () => {
    const { tenantDb, store } = makeFakeTenantDb([
      {
        id: 'f-1',
        fingerprint: 'production_no_progress:po-old',
        detector: 'production_no_progress',
        severity: 'WARNING',
        status: 'UNCLAIMED',
        headline: 'stale',
        requiredResources: ['/production/orders'],
        autoResolved: false,
        occurrences: 1,
      },
    ]);
    const results = [
      detectionResult({ status: 'failed', error: 'DB down', items: [] }),
    ];

    const outcome = await syncFindings(tenantDb, results);

    expect(outcome.autoResolved).toHaveLength(0);
    expect(outcome.skippedDetectors).toEqual(['production_no_progress']);
    const untouched = store.get('f-1')!;
    expect(untouched.status).toBe('UNCLAIMED');
  });

  it('does NOT auto-resolve when the detector run was truncated', async () => {
    const { tenantDb, store } = makeFakeTenantDb([
      {
        id: 'f-1',
        fingerprint: 'critical_stock:p-missing',
        detector: 'critical_stock',
        severity: 'CRITICAL',
        status: 'UNCLAIMED',
        headline: 'stale',
        requiredResources: ['/warehouse/inventory'],
        autoResolved: false,
        occurrences: 1,
      },
    ]);
    const results = [
      detectionResult({
        detector: 'critical_stock',
        requiredResources: ['/warehouse/inventory'],
        status: 'truncated',
        items: [
          {
            entityKey: 'critical_stock:p-other',
            entityType: 'Product',
            entityId: 'p-other',
            severity: 'critical',
            headline: 'a different product',
          },
        ],
      }),
    ];

    const outcome = await syncFindings(tenantDb, results);

    expect(outcome.autoResolved).toHaveLength(0);
    expect(outcome.skippedDetectors).toEqual(['critical_stock']);
    expect(store.get('f-1')!.status).toBe('UNCLAIMED');
  });

  it('only auto-resolves findings scoped to the detector that ran, not other detectors', async () => {
    const { tenantDb, store } = makeFakeTenantDb([
      {
        id: 'f-1',
        fingerprint: 'production_no_progress:po-old',
        detector: 'production_no_progress',
        severity: 'WARNING',
        status: 'UNCLAIMED',
        headline: 'stale production finding',
        requiredResources: ['/production/orders'],
        autoResolved: false,
        occurrences: 1,
      },
      {
        id: 'f-2',
        fingerprint: 'critical_stock:p-old',
        detector: 'critical_stock',
        severity: 'CRITICAL',
        status: 'UNCLAIMED',
        headline: 'stale stock finding',
        requiredResources: ['/warehouse/inventory'],
        autoResolved: false,
        occurrences: 1,
      },
    ]);
    // Only production_no_progress ran this cycle (e.g. critical_stock's
    // module wasn't entitled) — critical_stock's finding must be untouched.
    const results = [detectionResult({ items: [] })];

    const outcome = await syncFindings(tenantDb, results);

    expect(outcome.autoResolved).toEqual(['f-1']);
    expect(store.get('f-2')!.status).toBe('UNCLAIMED');
  });
});
