import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/telegram/send-message', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/lib/telegram/quiet-hours', () => ({
  isInQuietHours: vi.fn().mockReturnValue(false),
}));

import { remindAndEscalateNotes } from '../note-reminder';
import { sendTelegramMessage } from '@/lib/telegram/send-message';

function makeTenantDb(opts: {
  unclaimed?: unknown[];
  overdue?: unknown[];
  identities?: unknown[];
  users?: unknown[];
  roles?: unknown[];
  prefs?: unknown[];
} = {}) {
  return {
    ceoNote: {
      findMany: vi.fn().mockImplementation((args: Record<string, unknown>) => {
        const where = args.where as Record<string, unknown>;
        if (where.status === 'PUBLISHED') {
          return Promise.resolve(opts.unclaimed ?? []);
        }
        return Promise.resolve(opts.overdue ?? []);
      }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ceoNoteEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    notification: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    telegramIdentity: {
      findMany: vi.fn().mockResolvedValue(opts.identities ?? []),
    },
    user: {
      findMany: vi.fn().mockResolvedValue(opts.users ?? []),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue(opts.roles ?? []),
    },
    telegramNotificationPreference: {
      findMany: vi.fn().mockResolvedValue(opts.prefs ?? []),
    },
  };
}

describe('remindAndEscalateNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reminds assignees of notes unclaimed for over a day', async () => {
    const tenantDb = makeTenantDb({
      unclaimed: [
        { id: 'n-1', title: 'Stok', assignedUserIds: ['user-1'] },
        { id: 'n-2', title: 'Tanpa penerima', assignedUserIds: [] },
      ],
    });
    const outcome = await remindAndEscalateNotes(
      tenantDb as never,
      new Date('2026-09-04T10:00:00+07:00'),
    );
    expect(outcome.reminded).toEqual(['n-1']);
    expect(tenantDb.notification.createMany).toHaveBeenCalledTimes(1);
    expect(tenantDb.ceoNote.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'n-1' } }),
    );
  });

  it('escalates overdue notes with dueAt to owners via telegram', async () => {
    const tenantDb = makeTenantDb({
      overdue: [
        {
          id: 'n-9',
          title: 'Invoice jumbo',
          status: 'PUBLISHED',
          claimedById: null,
        },
      ],
      identities: [{ userId: 'admin-1', telegramChatId: 'chat-1' }],
      users: [{ id: 'admin-1', role: 'ADMIN', isSuperAdmin: false }],
    });
    const outcome = await remindAndEscalateNotes(
      tenantDb as never,
      new Date('2026-09-04T10:00:00+07:00'),
    );
    expect(outcome.escalated).toEqual(['n-9']);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(tenantDb.ceoNote.updateMany).toHaveBeenCalled();
  });

  it('defers escalation when there is nothing overdue', async () => {
    const tenantDb = makeTenantDb();
    const outcome = await remindAndEscalateNotes(
      tenantDb as never,
      new Date('2026-09-04T10:00:00+07:00'),
    );
    expect(outcome).toEqual({ reminded: [], escalated: [] });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
