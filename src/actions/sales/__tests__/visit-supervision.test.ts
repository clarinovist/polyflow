import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
  prisma: {},
}));

vi.mock('@/lib/auth/sales-access', () => ({
  requireSalesAccess: vi.fn().mockResolvedValue({
    user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
  }),
  requireSalesManager: vi.fn().mockResolvedValue({
    user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
  }),
}));

vi.mock('@/lib/utils/utils', () => ({
  serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/core/tenant', () => ({
  withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', async () => {
  const actual = await vi.importActual('@/lib/errors/errors') as any;
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

vi.mock('@/services/sales/visit-supervision-service', () => ({
  listTeamVisits: vi.fn().mockResolvedValue({ visits: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }),
  getTeamComplianceSummary: vi.fn().mockResolvedValue([]),
  reviewVisit: vi.fn().mockResolvedValue({ id: 'v1', reviewStatus: 'APPROVED' }),
}));

import {
  listTeamVisits,
  getTeamComplianceSummary,
  reviewVisitAction,
} from '../visit-supervision';
import { requireSalesAccess, requireSalesManager } from '@/lib/auth/sales-access';

describe('visit-supervision actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSalesAccess).mockResolvedValue({
      user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
    } as any);
    vi.mocked(requireSalesManager).mockResolvedValue({
      user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
    } as any);
  });

  it('listTeamVisits allows SALES', async () => {
    const res = await listTeamVisits({
      from: new Date(),
      to: new Date(),
    } as never);
    expect(res!.success).toBe(true);
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it('listTeamVisits rejects when requireSalesAccess fails', async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error('Unauthorized'));
    const res = await listTeamVisits({
      from: new Date(),
      to: new Date(),
    } as never);
    expect(res!.success).toBe(false);
  });

  it('getTeamComplianceSummary allows SALES', async () => {
    const res = await getTeamComplianceSummary(
      '2026-08-01',
      '2026-08-07',
    );
    expect(res!.success).toBe(true);
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it('getTeamComplianceSummary rejects unauthorized', async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error('Unauthorized'));
    const res = await getTeamComplianceSummary('2026-08-01', '2026-08-07');
    expect(res!.success).toBe(false);
  });

  it('reviewVisitAction allows ADMIN', async () => {
    const res = await reviewVisitAction('v1', 'APPROVED');
    expect(res!.success).toBe(true);
    expect(requireSalesManager).toHaveBeenCalled();
  });

  it('reviewVisitAction allows MARKETING', async () => {
    vi.mocked(requireSalesManager).mockResolvedValue({
      user: { id: 'm1', role: 'MARKETING', roles: ['MARKETING'] },
    } as any);
    const res = await reviewVisitAction('v1', 'REJECTED', 'not valid');
    expect(res!.success).toBe(true);
  });

  it('reviewVisitAction rejects SALES (must be manager)', async () => {
    vi.mocked(requireSalesManager).mockRejectedValue(
      new Error('Unauthorized: Hanya admin atau marketing'),
    );
    const res = await reviewVisitAction('v1', 'APPROVED');
    expect(res!.success).toBe(false);
  });

  it('reviewVisitAction rejects when sales-access fails', async () => {
    // SALES role calling review (should require manager)
    vi.mocked(requireSalesManager).mockRejectedValue(new Error('Unauthorized'));
    const res = await reviewVisitAction('v1', 'APPROVED');
    expect(res!.success).toBe(false);
  });
});
