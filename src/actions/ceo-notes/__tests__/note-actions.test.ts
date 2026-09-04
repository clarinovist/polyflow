import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
  withTenant: <T extends (...args: unknown[]) => unknown>(action: T) => action,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock('@/lib/telegram/permissions', () => ({
  resolveAllowedResources: vi.fn(),
}));

const { mockNote, mockEvent, mockComment, mockNotif, mockTx } = vi.hoisted(
  () => {
    const note = {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    };
    const event = { create: vi.fn() };
    const comment = { create: vi.fn() };
    const notif = { createMany: vi.fn() };
    const tx = vi.fn(
      async (cb: (t: Record<string, unknown>) => Promise<unknown>) =>
        cb({ ceoNote: note, ceoNoteEvent: event, ceoNoteComment: comment, notification: notif }),
    );
    return {
      mockNote: note,
      mockEvent: event,
      mockComment: comment,
      mockNotif: notif,
      mockTx: tx,
    };
  },
);

vi.mock('@/lib/core/prisma', () => ({
  prisma: {
    ceoNote: mockNote,
    ceoNoteEvent: mockEvent,
    ceoNoteComment: mockComment,
    notification: mockNotif,
    $transaction: mockTx,
  },
}));

import {
  listMyNotes,
  approveNote,
  claimNote,
  resolveNote,
  blockNote,
  commentOnNote,
  discardNote,
} from '../note-actions';
import { requireAuth, requireRole } from '@/lib/tools/auth-checks';
import { resolveAllowedResources } from '@/lib/telegram/permissions';

const SESSION = { user: { id: 'user-1' } };

describe('listMyNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');
    mockNote.findMany.mockResolvedValue([]);
  });

  it('shows notes assigned to me or matching my resources', async () => {
    vi.mocked(resolveAllowedResources).mockResolvedValue([
      '/warehouse/inventory',
    ]);
    await listMyNotes();
    expect(mockNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { assignedUserIds: { has: 'user-1' } },
          ]),
        }),
      }),
    );
  });

  it('defaults to PUBLISHED/CLAIMED statuses', async () => {
    await listMyNotes();
    expect(mockNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PUBLISHED', 'CLAIMED'] },
        }),
      }),
    );
  });
});

describe('approveNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    vi.mocked(requireRole).mockResolvedValue(undefined as never);
  });

  it('publishes a draft and notifies assignees', async () => {
    mockNote.findUnique.mockResolvedValue({
      status: 'DRAFT',
      assignedUserIds: ['user-2'],
      title: 'T',
      body: 'B',
    });
    mockNote.update.mockResolvedValue({ id: 'n-1' });

    const res = await approveNote('n-1');
    expect(res.success).toBe(true);
    expect(mockNote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n-1' },
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
    expect(mockNotif.createMany).toHaveBeenCalled();
  });

  it('rejects approving a non-draft', async () => {
    mockNote.findUnique.mockResolvedValue({
      status: 'PUBLISHED',
      assignedUserIds: [],
      title: 'T',
      body: 'B',
    });
    const res = await approveNote('n-1');
    expect(res.success).toBe(false);
  });
});

describe('claimNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');
  });

  it('claims a published note with optimistic locking', async () => {
    mockNote.findUnique.mockResolvedValue({ requiredResources: [] });
    mockNote.updateMany.mockResolvedValue({ count: 1 });
    mockNote.findUniqueOrThrow.mockResolvedValue({ id: 'n-1' });

    const res = await claimNote('n-1');
    expect(res.success).toBe(true);
    expect(mockNote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n-1', status: 'PUBLISHED' },
      }),
    );
  });

  it('fails when already claimed by someone else', async () => {
    mockNote.findUnique.mockResolvedValue({ requiredResources: [] });
    mockNote.updateMany.mockResolvedValue({ count: 0 });

    const res = await claimNote('n-1');
    expect(res.success).toBe(false);
  });
});

describe('resolveNote and blockNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');
  });

  it('resolves an open note with an optional note', async () => {
    mockNote.findUnique.mockResolvedValue({
      status: 'CLAIMED',
      requiredResources: [],
    });
    mockNote.update.mockResolvedValue({ id: 'n-1' });

    const res = await resolveNote('n-1', 'beres');
    expect(res.success).toBe(true);
    expect(mockNote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RESOLVED',
          resolutionNote: 'beres',
        }),
      }),
    );
  });

  it('blocks a note and stores the reason as first comment', async () => {
    mockNote.findUnique.mockResolvedValue({
      status: 'CLAIMED',
      requiredResources: [],
    });
    mockNote.update.mockResolvedValue({ id: 'n-1' });

    const res = await blockNote('n-1', 'stok belum datang');
    expect(res.success).toBe(true);
    expect(mockNote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'BLOCKED' } }),
    );
    expect(mockComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: 'stok belum datang' }),
      }),
    );
  });

  it('requires a reason when blocking', async () => {
    const res = await blockNote('n-1', '  ');
    expect(res.success).toBe(false);
    expect(mockNote.update).not.toHaveBeenCalled();
  });
});

describe('commentOnNote and discardNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    vi.mocked(requireRole).mockResolvedValue(undefined as never);
    vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');
  });

  it('adds a comment to an open note', async () => {
    mockNote.findUnique.mockResolvedValue({
      status: 'BLOCKED',
      requiredResources: [],
    });
    mockComment.create.mockResolvedValue({ id: 'c-1' });

    const res = await commentOnNote('n-1', 'oke, saya bantu');
    expect(res.success).toBe(true);
  });

  it('rejects empty comments', async () => {
    const res = await commentOnNote('n-1', '  ');
    expect(res.success).toBe(false);
  });

  it('discards an open note', async () => {
    mockNote.findUnique.mockResolvedValue({ status: 'DRAFT' });
    mockNote.update.mockResolvedValue({ id: 'n-1' });

    const res = await discardNote('n-1');
    expect(res.success).toBe(true);
    expect(mockNote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DISCARDED' } }),
    );
  });
});
