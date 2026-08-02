import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
  prisma: {
    salesVisit: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: 'v1', reviewStatus: 'APPROVED' }),
    },
    salesRoutePlan: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/lib/tools/audit', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/core/prisma';
import {
  listTeamVisits,
  getTeamComplianceSummary,
  reviewVisit,
} from '../visit-supervision-service';
import { logActivity } from '@/lib/tools/audit';

describe('visit-supervision-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listTeamVisits', () => {
    it('default pagination pageSize 50 page 1', async () => {
      vi.mocked(prisma.salesVisit.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.salesVisit.count).mockResolvedValue(0);
      const res = await listTeamVisits({
        from: new Date('2026-08-01'),
        to: new Date('2026-08-02'),
      });
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(50);
      expect(res.totalPages).toBe(0);
      expect(prisma.salesVisit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });

    it('pagination page 2 and filter userId', async () => {
      vi.mocked(prisma.salesVisit.findMany).mockResolvedValue([
        { id: 'v1' },
      ] as never);
      vi.mocked(prisma.salesVisit.count).mockResolvedValue(51);
      const res = await listTeamVisits({
        from: new Date('2026-08-01'),
        to: new Date('2026-08-02'),
        userId: 'u1',
        page: 2,
        pageSize: 10,
      });
      expect(res.page).toBe(2);
      expect(res.totalPages).toBe(6);
      const callArg = vi.mocked(prisma.salesVisit.findMany).mock.calls[0][0] as any;
      expect(callArg.where.userId).toBe('u1');
      expect(callArg.skip).toBe(10);
    });

    it('filter isExtraCall and reviewStatus and customerId include relations ordered by checkInTime desc', async () => {
      vi.mocked(prisma.salesVisit.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.salesVisit.count).mockResolvedValue(0);
      await listTeamVisits({
        from: new Date('2026-08-01'),
        to: new Date('2026-08-02'),
        customerId: 'c1',
        isExtraCall: true,
        reviewStatus: 'PENDING',
      });
      const arg = vi.mocked(prisma.salesVisit.findMany).mock.calls[0][0] as any;
      expect(arg.where.customerId).toBe('c1');
      expect(arg.where.isExtraCall).toBe(true);
      expect(arg.where.reviewStatus).toBe('PENDING');
      expect(arg.include.customer).toBeDefined();
      expect(arg.include.user).toBeDefined();
      expect(arg.include.routePlanItem).toBeDefined();
      expect(arg.orderBy).toEqual({ checkInTime: 'desc' });
    });

    it('clamps pageSize max 200', async () => {
      vi.mocked(prisma.salesVisit.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.salesVisit.count).mockResolvedValue(0);
      await listTeamVisits({
        from: new Date('2026-08-01'),
        to: new Date('2026-08-02'),
        pageSize: 999,
      });
      const arg = vi.mocked(prisma.salesVisit.findMany).mock.calls[0][0] as any;
      expect(arg.take).toBe(200);
    });
  });

  describe('getTeamComplianceSummary', () => {
    it('aggregates assigned/visited/extra and uses calculateComplianceRate', async () => {
      vi.mocked(prisma.salesRoutePlan.findMany).mockResolvedValue([
        {
          userId: 'u1',
          user: { name: 'Alex' },
          items: [{ id: 'i1' }, { id: 'i2' }],
        },
        {
          userId: 'u1',
          user: { name: 'Alex' },
          items: [{ id: 'i3' }],
        },
        {
          userId: 'u2',
          user: { name: 'Budi' },
          items: [],
        },
      ] as never);
      vi.mocked(prisma.salesVisit.groupBy)
        .mockResolvedValueOnce([
          { userId: 'u1', _count: { id: 2 } },
          { userId: 'u2', _count: { id: 1 } },
        ] as never)
        .mockResolvedValueOnce([
          { userId: 'u1', _count: { id: 1 } },
        ] as never);

      const rows = await getTeamComplianceSummary(
        new Date('2026-08-01'),
        new Date('2026-08-07'),
      );
      // u1 assigned 3, visited 2, extra 1 → compliance (2-1)/3=33
      const u1 = rows.find((r) => r.userId === 'u1')!;
      expect(u1.assigned).toBe(3);
      expect(u1.visited).toBe(2);
      expect(u1.extraCalls).toBe(1);
      expect(u1.compliance).toBe(33);
      // u2 assigned 0, visited 1, extra 0 → compliance 0 (not NaN)
      const u2 = rows.find((r) => r.userId === 'u2')!;
      expect(u2.assigned).toBe(0);
      expect(u2.compliance).toBe(0);
    });

    it('assigned 0 does not divide-by-zero (from spec)', async () => {
      vi.mocked(prisma.salesRoutePlan.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.salesVisit.groupBy)
        .mockResolvedValueOnce([{ userId: 'u9', _count: { id: 3 } }] as never)
        .mockResolvedValueOnce([] as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'u9', name: 'No Plan' },
      ] as never);

      const rows = await getTeamComplianceSummary(
        new Date('2026-08-01'),
        new Date('2026-08-02'),
      );
      expect(rows[0].assigned).toBe(0);
      expect(rows[0].compliance).toBe(0);
      expect(Number.isNaN(rows[0].compliance)).toBe(false);
    });

    it('filters by userId when provided', async () => {
      vi.mocked(prisma.salesRoutePlan.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.salesVisit.groupBy)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([] as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: 'Solo' } as never);

      const rows = await getTeamComplianceSummary(
        new Date('2026-08-01'),
        new Date('2026-08-02'),
        'uSolo',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe('uSolo');
      const whereArg = vi.mocked(prisma.salesRoutePlan.findMany).mock
        .calls[0][0] as any;
      expect(whereArg.where.userId).toBe('uSolo');
    });

    it('excludes REJECTED from visited counts per Q3', async () => {
      vi.mocked(prisma.salesRoutePlan.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.salesVisit.groupBy)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([] as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      await getTeamComplianceSummary(
        new Date('2026-08-01'),
        new Date('2026-08-02'),
      );
      const whereUsed = vi.mocked(prisma.salesVisit.groupBy).mock.calls[0][0].where as any;
      expect(whereUsed.reviewStatus).toEqual({ not: 'REJECTED' });
    });
  });

  describe('reviewVisit', () => {
    it('success APPROVED with fromStatus/toStatus in audit log', async () => {
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue({
        id: 'v1',
        reviewStatus: 'PENDING',
      } as never);

      const updated = await reviewVisit('v1', 'APPROVED', 'mgr1', 'ok');
      expect(updated).toBeDefined();
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'mgr1',
          action: 'VISIT_APPROVED',
          fromStatus: 'PENDING',
          toStatus: 'APPROVED',
        }),
      );
    });

    it('success REJECTED', async () => {
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue({
        id: 'v1',
        reviewStatus: 'PENDING',
      } as never);
      await reviewVisit('v1', 'REJECTED', 'mgr1');
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ toStatus: 'REJECTED' }),
      );
    });

    it('fails if visit not found', async () => {
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue(null);
      await expect(reviewVisit('missing', 'APPROVED', 'mgr1')).rejects.toThrow();
    });

    it('fails if already reviewed (not PENDING)', async () => {
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue({
        id: 'v1',
        reviewStatus: 'APPROVED',
      } as never);
      await expect(reviewVisit('v1', 'APPROVED', 'mgr1')).rejects.toThrow(
        /sudah direview/i,
      );
    });
  });
});
