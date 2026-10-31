import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
  withTenant: <T extends (...args: unknown[]) => unknown>(action: T) => action,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/telegram/permissions', () => ({
  resolveAllowedResources: vi.fn(),
}));

const { mockFinding, mockFindingEvent, mockTransaction } = vi.hoisted(() => {
  const finding = {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  };
  const findingEvent = { create: vi.fn() };
  const transaction = vi.fn(
    async (cb: (tx: { finding: typeof finding; findingEvent: typeof findingEvent }) => Promise<unknown>) =>
      cb({ finding, findingEvent }),
  );
  return { mockFinding: finding, mockFindingEvent: findingEvent, mockTransaction: transaction };
});

vi.mock('@/lib/core/prisma', () => ({
  prisma: {
    finding: mockFinding,
    findingEvent: mockFindingEvent,
    $transaction: mockTransaction,
  },
}));

import {
  listMyFindings,
  claimFinding,
  resolveFinding,
  snoozeFinding,
} from '../finding-actions';
import { requireAuth } from '@/lib/tools/auth-checks';
import { resolveAllowedResources } from '@/lib/telegram/permissions';

const SESSION = { user: { id: 'user-1' } };

describe('listMyFindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    mockFinding.findMany.mockResolvedValue([]);
  });

  it('keeps only findings the user can open, using prefix semantics', async () => {
    vi.mocked(resolveAllowedResources).mockResolvedValue(['/finance']);
    mockFinding.findMany.mockResolvedValue([
      { id: 'ar', requiredResources: ['/sales/invoices', '/finance/invoices'] },
      { id: 'stock', requiredResources: ['/warehouse/inventory'] },
      { id: 'journal', requiredResources: ['/finance/journals'] },
    ]);

    const result = await listMyFindings();

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Array<{ id: string }>).map((f) => f.id)).toEqual(['ar', 'journal']);
    }
  });

  it('bounds the fetch since filtering happens in memory', async () => {
    vi.mocked(resolveAllowedResources).mockResolvedValue(['/finance']);

    await listMyFindings();

    expect(mockFinding.findMany.mock.calls[0][0].take).toBe(500);
  });

  it('does not filter by requiredResources for ALL access', async () => {
    vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');

    await listMyFindings();

    const call = mockFinding.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('requiredResources');
  });

  it('defaults to UNCLAIMED/CLAIMED/SNOOZED statuses', async () => {
    vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');

    await listMyFindings();

    expect(mockFinding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['UNCLAIMED', 'CLAIMED', 'SNOOZED'] },
        }),
      }),
    );
  });

  it('honors an explicit statuses filter (e.g. history view)', async () => {
    vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');

    await listMyFindings({ statuses: ['RESOLVED'] });

    expect(mockFinding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['RESOLVED'] } }),
      }),
    );
  });
});

describe('claimFinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');
  });

  it('claims an UNCLAIMED finding and logs a CLAIMED event', async () => {
    mockFinding.findUnique.mockResolvedValue({
      requiredResources: ['/production/orders'],
    });
    mockFinding.updateMany.mockResolvedValue({ count: 1 });
    mockFinding.findUniqueOrThrow.mockResolvedValue({
      id: 'f-1',
      status: 'CLAIMED',
    });

    const result = await claimFinding('f-1');

    expect(result.success).toBe(true);
    expect(mockFinding.updateMany).toHaveBeenCalledWith({
      where: { id: 'f-1', status: 'UNCLAIMED' },
      data: expect.objectContaining({
        status: 'CLAIMED',
        claimedById: 'user-1',
      }),
    });
    expect(mockFindingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        findingId: 'f-1',
        action: 'CLAIMED',
        actorId: 'user-1',
        fromStatus: 'UNCLAIMED',
        toStatus: 'CLAIMED',
      }),
    });
  });

  it('returns a CONFLICT failure when the finding was already claimed by someone else (race)', async () => {
    mockFinding.findUnique.mockResolvedValue({
      requiredResources: ['/production/orders'],
    });
    mockFinding.updateMany.mockResolvedValue({ count: 0 });

    const result = await claimFinding('f-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('CONFLICT');
    }
    expect(mockFindingEvent.create).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the finding does not exist', async () => {
    mockFinding.findUnique.mockResolvedValue(null);

    const result = await claimFinding('missing');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND');
    }
  });

  it('rejects a user without access to the finding resource', async () => {
    mockFinding.findUnique.mockResolvedValue({
      requiredResources: ['/finance/invoices'],
    });
    vi.mocked(resolveAllowedResources).mockResolvedValue([
      '/production/orders',
    ]);

    const result = await claimFinding('f-1');

    expect(result.success).toBe(false);
    expect(mockFinding.updateMany).not.toHaveBeenCalled();
  });
});

describe('resolveFinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');
  });

  it('resolves an open finding with a note', async () => {
    mockFinding.findUnique.mockResolvedValue({
      status: 'CLAIMED',
      requiredResources: ['/warehouse/inventory'],
      detector: 'manual_review',
    });
    mockFinding.update.mockResolvedValue({ id: 'f-1', status: 'RESOLVED' });

    const result = await resolveFinding('f-1', 'Sudah restock manual');

    expect(result.success).toBe(true);
    expect(mockFinding.update).toHaveBeenCalledWith({
      where: { id: 'f-1' },
      data: expect.objectContaining({
        status: 'RESOLVED',
        resolvedById: 'user-1',
        resolutionNote: 'Sudah restock manual',
        autoResolved: false,
      }),
    });
    expect(mockFindingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'RESOLVED',
        fromStatus: 'CLAIMED',
        toStatus: 'RESOLVED',
      }),
    });
  });

  it('stores a null resolutionNote when no note is given', async () => {
    mockFinding.findUnique.mockResolvedValue({
      status: 'UNCLAIMED',
      requiredResources: ['/warehouse/inventory'],
      detector: 'manual_review',
    });
    mockFinding.update.mockResolvedValue({ id: 'f-1', status: 'RESOLVED' });

    await resolveFinding('f-1');

    expect(mockFinding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resolutionNote: null }),
      }),
    );
  });

  it('returns CONFLICT when the finding is already resolved', async () => {
    mockFinding.findUnique.mockResolvedValue({
      status: 'RESOLVED',
      requiredResources: ['/warehouse/inventory'],
    });

    const result = await resolveFinding('f-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('CONFLICT');
    }
    expect(mockFinding.update).not.toHaveBeenCalled();
  });

  it('refuses a manual resolve on a condition detector (would reopen next sync)', async () => {
    mockFinding.findUnique.mockResolvedValue({
      status: 'CLAIMED',
      requiredResources: ['/purchasing/invoices'],
      detector: 'overdue_ap',
    });

    const result = await resolveFinding('f-1', 'sudah saya telepon');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Tunda');
    }
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('checks permission before revealing the condition-detector rule', async () => {
    vi.mocked(resolveAllowedResources).mockResolvedValue(['/sales/orders']);
    mockFinding.findUnique.mockResolvedValue({
      status: 'CLAIMED',
      requiredResources: ['/purchasing/invoices'],
      detector: 'overdue_ap',
    });

    const result = await resolveFinding('f-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('izin');
    }
  });
});

describe('snoozeFinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');
  });

  it('snoozes with a valid day count and sets snoozedUntil', async () => {
    mockFinding.findUnique.mockResolvedValue({
      status: 'UNCLAIMED',
      requiredResources: ['/warehouse/inventory'],
    });
    mockFinding.update.mockResolvedValue({ id: 'f-1', status: 'SNOOZED' });

    const result = await snoozeFinding('f-1', 3, '  janji bayar Jumat  ');

    expect(result.success).toBe(true);
    expect(mockFinding.update).toHaveBeenCalledWith({
      where: { id: 'f-1' },
      data: { status: 'SNOOZED', snoozedUntil: expect.any(Date) },
    });
    expect(mockFindingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'SNOOZED', note: '3 hari: janji bayar Jumat' }),
    });
  });

  it.each([0, 15, Number.NaN])(
    'rejects an out-of-range day count: %s',
    async (days) => {
      const result = await snoozeFinding('f-1', days, 'catatan valid');
      expect(result.success).toBe(false);
      expect(mockFinding.findUnique).not.toHaveBeenCalled();
    },
  );

  it('returns CONFLICT when the finding is already resolved', async () => {
    mockFinding.findUnique.mockResolvedValue({
      status: 'RESOLVED',
      requiredResources: ['/warehouse/inventory'],
    });

    const result = await snoozeFinding('f-1', 3, 'catatan valid');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('CONFLICT');
    }
  });

  it.each(['', '  ', 'ok', 'x'.repeat(501)])(
    'requires a 3-500 character note: %j',
    async (note) => {
      const result = await snoozeFinding('f-1', 3, note);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Catatan');
      }
      expect(mockFinding.findUnique).not.toHaveBeenCalled();
    },
  );
});
