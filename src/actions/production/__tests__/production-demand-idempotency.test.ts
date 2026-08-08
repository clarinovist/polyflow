import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  productionRoute: { findFirst: vi.fn() },
  productionOrder: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  bom: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    const error = new Error('NEXT_REDIRECT') as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
  }),
}));
vi.mock('@/lib/core/tenant', () => ({
  withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (data: unknown) => data }));
vi.mock('@/lib/config/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/services/production/fg-demand-service', () => ({
  listFgDemandBoard: vi.fn(),
}));
vi.mock('@/services/production/order-service', () => ({
  ProductionOrderService: {
    createOrder: vi.fn(async (data: Record<string, unknown>) => ({
      id: 'order-1',
      orderNumber: 'WO-TEST',
      status: 'DRAFT',
      ...data,
    })),
  },
}));
vi.mock('@/services/production/routing-run-service', () => ({
  ProductionRoutingRunService: {
    createRun: vi.fn(async (data: Record<string, unknown>) => ({
      id: 'run-1',
      runNumber: 'RUN-TEST',
      idempotencyKey: data.idempotencyKey,
      ...data,
    })),
  },
}));
vi.mock('@/lib/production/routing-feature-flag', () => ({
  isRoutingEnabled: vi.fn(async () => true),
}));

import { createSpkFromDemand } from '../production-demand';
import { auth } from '@/auth';
import { ProductionRoutingRunService } from '@/services/production/routing-run-service';

describe('createSpkFromDemand — G5 idempotency fallback key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', role: 'PRODUCTION' },
    } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'PRODUCTION' } as never);
    // Route exists → routed path
    mockPrisma.productionRoute.findFirst.mockResolvedValue({ id: 'route-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no idempotencyKey supplied -> createRun receives undefined, called twice in a row', async () => {
    // No vi.setSystemTime here: day/time is irrelevant to this contract now
    // (see plan §5 — the daily-bucket fallback was removed), so faking the
    // clock would only suggest a date dependency that no longer exists.
    await createSpkFromDemand({
      productVariantId: 'pv-1',
      plannedQuantity: 100,
      locationId: 'loc-1',
    });
    await createSpkFromDemand({
      productVariantId: 'pv-1',
      plannedQuantity: 100,
      locationId: 'loc-1',
    });

    const calls = vi.mocked(ProductionRoutingRunService.createRun).mock.calls;
    expect(calls.length).toBe(2);
    // No key fabricated — a caller that forgets to send idempotencyKey no
    // longer silently gets a stale run back "successfully"; `undefined`
    // flows straight through to createRun instead.
    expect(calls[0][0].idempotencyKey).toBeUndefined();
    expect(calls[1][0].idempotencyKey).toBeUndefined();
  });

  it('no idempotencyKey supplied, calls on different days -> still undefined both times (no date-based fallback)', async () => {
    vi.setSystemTime(new Date('2026-07-15T10:00:00Z'));
    await createSpkFromDemand({
      productVariantId: 'pv-1',
      plannedQuantity: 100,
      locationId: 'loc-1',
    });

    vi.setSystemTime(new Date('2026-07-16T10:00:00Z'));
    await createSpkFromDemand({
      productVariantId: 'pv-1',
      plannedQuantity: 100,
      locationId: 'loc-1',
    });

    const calls = vi.mocked(ProductionRoutingRunService.createRun).mock.calls;
    expect(calls.length).toBe(2);
    // Regression guard: the removed fallback bucketed by calendar day
    // (`demand-<variant>-<qty>-<location>-<YYYY-MM-DD>`), so crossing a day
    // boundary used to change the key. Assert each call independently —
    // NOT `calls[0][0].idempotencyKey === calls[1][0].idempotencyKey`, which
    // would trivially pass on two accidental `undefined`s and silently hide
    // the fallback coming back. Both must be undefined regardless of day.
    expect(calls[0][0].idempotencyKey).toBeUndefined();
    expect(calls[1][0].idempotencyKey).toBeUndefined();
  });

  it('client-supplied key is used as-is', async () => {
    vi.setSystemTime(new Date('2026-07-15T10:00:00Z'));
    await createSpkFromDemand({
      productVariantId: 'pv-1',
      plannedQuantity: 100,
      locationId: 'loc-1',
      idempotencyKey: 'custom-key-123',
    });

    const calls = vi.mocked(ProductionRoutingRunService.createRun).mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0].idempotencyKey).toBe('custom-key-123');
  });
});
