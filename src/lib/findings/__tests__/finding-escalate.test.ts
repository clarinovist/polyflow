import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/telegram/send-message', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue({ ok: true, messageId: 1 }),
}));

import { escalateOverdueFindings } from '../finding-escalate';
import { sendTelegramMessage } from '@/lib/telegram/send-message';

const NOW = new Date('2026-08-14T00:00:00+07:00');

function overdueFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f-1',
    detector: 'critical_stock',
    severity: 'CRITICAL',
    status: 'UNCLAIMED',
    headline: 'Karung: 5 < 20',
    detail: null,
    claimedById: null,
    slaDueAt: new Date('2026-08-13T00:00:00+07:00'),
    ...overrides,
  };
}

function ownerIdentity(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'owner-1',
    telegramChatId: 'chat-owner-1',
    ...overrides,
  };
}

function makeTenantDb(overrides: Record<string, unknown> = {}) {
  return {
    finding: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    findingEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    telegramIdentity: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    telegramNotificationPreference: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

describe('escalateOverdueFindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when there are no overdue findings', async () => {
    const tenantDb = makeTenantDb();
    const outcome = await escalateOverdueFindings(tenantDb as never, NOW);

    expect(outcome).toEqual({ escalated: [], ownerRecipients: 0 });
    expect(tenantDb.telegramIdentity.findMany).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('queries only UNCLAIMED/CLAIMED findings past SLA that have not been escalated yet', async () => {
    const tenantDb = makeTenantDb();
    await escalateOverdueFindings(tenantDb as never, NOW);

    expect(tenantDb.finding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['UNCLAIMED', 'CLAIMED'] },
          slaDueAt: { lt: NOW },
          escalatedAt: null,
        },
      }),
    );
  });

  it('defers escalation when there are overdue findings but no reachable owner', async () => {
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([overdueFinding()]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      telegramIdentity: { findMany: vi.fn().mockResolvedValue([]) }, // no one linked
    });

    const outcome = await escalateOverdueFindings(tenantDb as never, NOW);

    expect(outcome).toEqual({ escalated: [], ownerRecipients: 0 });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(tenantDb.finding.updateMany).not.toHaveBeenCalled();
  });

  it('defers escalation (does not mark escalatedAt) when the only owner is in quiet hours', async () => {
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([overdueFinding()]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      telegramIdentity: {
        findMany: vi.fn().mockResolvedValue([ownerIdentity()]),
      },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'owner-1', role: 'ADMIN', isSuperAdmin: false }]),
      },
      telegramNotificationPreference: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'owner-1',
            timezone: 'Asia/Jakarta',
            quietHoursStart: 0,
            quietHoursEnd: 6,
          },
        ]),
      },
    });

    // NOW is 2026-08-14T00:00:00+07:00 -> hour 0, inside [0,6) quiet window
    const outcome = await escalateOverdueFindings(tenantDb as never, NOW);

    expect(outcome).toEqual({ escalated: [], ownerRecipients: 0 });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(tenantDb.finding.updateMany).not.toHaveBeenCalled();
  });

  it('notifies a reachable ADMIN owner and marks the finding escalated', async () => {
    const finding = overdueFinding();
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([finding]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      telegramIdentity: {
        findMany: vi.fn().mockResolvedValue([ownerIdentity()]),
      },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'owner-1', role: 'ADMIN', isSuperAdmin: false }]),
      },
    });

    const outcome = await escalateOverdueFindings(tenantDb as never, NOW);

    expect(outcome).toEqual({ escalated: ['f-1'], ownerRecipients: 1 });
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      'chat-owner-1',
      expect.stringContaining('Karung: 5 < 20'),
    );
    expect(tenantDb.finding.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['f-1'] } },
      data: { escalatedAt: NOW },
    });
    expect(tenantDb.findingEvent.create).toHaveBeenCalledWith({
      data: {
        findingId: 'f-1',
        action: 'ESCALATED',
        fromStatus: 'UNCLAIMED',
        toStatus: 'UNCLAIMED',
      },
    });
  });

  it('includes superadmins as owners even without an ADMIN role', async () => {
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([overdueFinding()]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      telegramIdentity: {
        findMany: vi.fn().mockResolvedValue([ownerIdentity()]),
      },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'owner-1', role: 'WAREHOUSE', isSuperAdmin: true }]),
      },
    });

    const outcome = await escalateOverdueFindings(tenantDb as never, NOW);
    expect(outcome.ownerRecipients).toBe(1);
  });

  it('includes a user who is ADMIN only via secondary UserRole', async () => {
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([overdueFinding()]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      telegramIdentity: {
        findMany: vi.fn().mockResolvedValue([ownerIdentity()]),
      },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'owner-1', role: 'WAREHOUSE', isSuperAdmin: false }]),
      },
      userRole: {
        findMany: vi.fn().mockResolvedValue([{ userId: 'owner-1' }]),
      },
    });

    const outcome = await escalateOverdueFindings(tenantDb as never, NOW);
    expect(outcome.ownerRecipients).toBe(1);
  });

  it('excludes a linked user who is not an owner (plain staff role)', async () => {
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([overdueFinding()]),
      },
      telegramIdentity: {
        findMany: vi.fn().mockResolvedValue([ownerIdentity()]),
      },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'owner-1', role: 'WAREHOUSE', isSuperAdmin: false }]),
      },
    });

    const outcome = await escalateOverdueFindings(tenantDb as never, NOW);
    expect(outcome).toEqual({ escalated: [], ownerRecipients: 0 });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('includes the claimant name in the message for a CLAIMED overdue finding', async () => {
    const finding = overdueFinding({
      status: 'CLAIMED',
      claimedById: 'staff-1',
    });
    const tenantDb = makeTenantDb({
      finding: {
        findMany: vi.fn().mockResolvedValue([finding]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      telegramIdentity: {
        findMany: vi.fn().mockResolvedValue([ownerIdentity()]),
      },
      user: {
        findMany: vi
          .fn()
          .mockImplementation(
            async ({ where }: { where: { id: { in: string[] } } }) => {
              if (where.id.in.includes('owner-1')) {
                return [{ id: 'owner-1', role: 'ADMIN', isSuperAdmin: false }];
              }
              if (where.id.in.includes('staff-1')) {
                return [{ id: 'staff-1', name: 'Budi', email: 'budi@x.com' }];
              }
              return [];
            },
          ),
      },
    });

    await escalateOverdueFindings(tenantDb as never, NOW);

    expect(sendTelegramMessage).toHaveBeenCalledWith(
      'chat-owner-1',
      expect.stringContaining('Diklaim oleh Budi'),
    );
  });
});
