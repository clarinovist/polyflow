import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
  prisma: {
    salesVisit: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-1', ...args.data }),
      ),
    },
    salesRoutePlanItem: { update: vi.fn().mockResolvedValue({ id: 'rpi-1' }) },
  },
}));

vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

vi.mock('@/lib/auth/sales-access', () => ({
  requireSalesAccess: vi.fn().mockResolvedValue({
    user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
  }),
}));

vi.mock('@/lib/utils/utils', () => ({
  serializeData: (d: unknown) => d,
}));
vi.mock('@/lib/core/tenant', () => ({
  withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/errors/errors', async () => {
  const actual = (await vi.importActual('@/lib/errors/errors')) as any;
  return {
    ...actual,
    safeAction: async (fn: () => Promise<unknown>) => {
      try {
        const data = await fn();
        return { success: true, data };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  };
});

import { prisma } from '@/lib/core/prisma';
import { syncVisitLogs } from '@/services/sales/field-visit-service';

describe('visits sync — reviewStatus idempotency (gap-02)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sync ulang visit yang sudah APPROVED tidak reset ke PENDING/NOT_REQUIRED', async () => {
    // existing APPROVED
    vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue({
      id: 'existing',
      reviewStatus: 'APPROVED',
    } as never);

    const createSpy = vi.mocked(prisma.salesVisit.create);

    const results = await syncVisitLogs('u1', [
      {
        clientVisitId: 'cv-approved',
        customerId: 'cus-1',
        checkInTime: new Date().toISOString(),
        checkOutTime: new Date().toISOString(),
        durationSeconds: 60,
        latitude: -6.2,
        longitude: 106.8,
        distance: 10,
        notes: null,
        photoUrl: null,
        isExtraCall: true,
        extraReason: 'TOKO_BARU',
      },
    ]);

    expect(results[0].success).toBe(true);
    expect(results[0].visitId).toBe('existing');
    // must NOT call create (idempotent) and must NOT overwrite reviewStatus
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('new sync TOKO_BARU → PENDING, DEKAT_RUTE → NOT_REQUIRED, non-EC → NOT_REQUIRED (Q1)', async () => {
    vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue(null);
    const createMock = vi.mocked(prisma.salesVisit.create);
    createMock.mockResolvedValue({ id: 'new-1' } as never);

    // TOKO_BARU → PENDING
    await syncVisitLogs('u1', [
      {
        clientVisitId: 'cv-1',
        customerId: 'cus-1',
        checkInTime: new Date().toISOString(),
        checkOutTime: new Date().toISOString(),
        durationSeconds: 60,
        latitude: -6.2,
        longitude: 106.8,
        distance: 10,
        notes: null,
        photoUrl: null,
        isExtraCall: true,
        extraReason: 'TOKO_BARU',
      },
    ]);
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewStatus: 'PENDING' }),
      }),
    );

    // DEKAT_RUTE → NOT_REQUIRED
    await syncVisitLogs('u1', [
      {
        clientVisitId: 'cv-2',
        customerId: 'cus-1',
        checkInTime: new Date().toISOString(),
        checkOutTime: new Date().toISOString(),
        durationSeconds: 60,
        latitude: -6.2,
        longitude: 106.8,
        distance: 10,
        notes: null,
        photoUrl: null,
        isExtraCall: true,
        extraReason: 'DEKAT_RUTE',
      },
    ]);
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewStatus: 'NOT_REQUIRED' }),
      }),
    );

    // non-EC → NOT_REQUIRED
    await syncVisitLogs('u1', [
      {
        clientVisitId: 'cv-3',
        customerId: 'cus-1',
        checkInTime: new Date().toISOString(),
        checkOutTime: new Date().toISOString(),
        durationSeconds: 60,
        latitude: -6.2,
        longitude: 106.8,
        distance: 10,
        notes: null,
        photoUrl: null,
        isExtraCall: false,
      },
    ]);
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewStatus: 'NOT_REQUIRED' }),
      }),
    );

    // PERMINTAAN_DADAKAN → PENDING
    await syncVisitLogs('u1', [
      {
        clientVisitId: 'cv-4',
        customerId: 'cus-1',
        checkInTime: new Date().toISOString(),
        checkOutTime: new Date().toISOString(),
        durationSeconds: 60,
        latitude: -6.2,
        longitude: 106.8,
        distance: 10,
        notes: null,
        photoUrl: null,
        isExtraCall: true,
        extraReason: 'PERMINTAAN_DADAKAN',
      },
    ]);
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewStatus: 'PENDING' }),
      }),
    );
  });
});
