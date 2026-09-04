import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/findings/finding-routing', () => ({
  resolveUsersForResources: vi.fn().mockResolvedValue([]),
}));

import { publishNotes, notifyPublishedNotes } from '../note-publish';
import { resolveUsersForResources } from '@/lib/findings/finding-routing';
import type { ComposedNote } from '../note-composer';

function makeNote(overrides: Partial<ComposedNote> = {}): ComposedNote {
  return {
    title: 'Stok karung kritis',
    body: 'Karung tinggal 5.',
    suggestedSteps: ['Order bahan'],
    priority: 'NORMAL',
    requiredResources: ['/warehouse/inventory'],
    sourceDetectors: ['critical_stock'],
    sourceFingerprints: ['critical_stock:p-1'],
    ...overrides,
  };
}

function makeTenantDb(openMatch: { id: string } | null = null) {
  return {
    ceoNote: {
      findFirst: vi.fn().mockResolvedValue(openMatch),
      update: vi.fn().mockImplementation((args: Record<string, unknown>) =>
        Promise.resolve({ id: (args.where as { id: string }).id }),
      ),
      create: vi.fn().mockImplementation((args: Record<string, unknown>) =>
        Promise.resolve({ id: 'new-1', ...(args.data as object) }),
      ),
      findMany: vi.fn().mockResolvedValue([]),
    },
    notification: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('publishNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveUsersForResources).mockResolvedValue(['user-1']);
  });

  it('updates the open note instead of duplicating on recurrence', async () => {
    const tenantDb = makeTenantDb({ id: 'open-1' });
    const outcome = await publishNotes(tenantDb as never, [makeNote()], {
      aiModel: 'm',
    });
    expect(outcome).toEqual({ created: [], updated: ['open-1'] });
    expect(tenantDb.ceoNote.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'open-1' } }),
    );
    expect(tenantDb.ceoNote.create).not.toHaveBeenCalled();
  });

  it('creates DRAFT for critical and PUBLISHED for normal notes', async () => {
    const tenantDb = makeTenantDb(null);
    const outcome = await publishNotes(
      tenantDb as never,
      [makeNote({ priority: 'CRITICAL' }), makeNote()],
      { aiModel: 'm' },
    );
    expect(outcome.created).toHaveLength(2);
    expect(tenantDb.ceoNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT', publishedAt: null }),
      }),
    );
    expect(tenantDb.ceoNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PUBLISHED',
          assignedUserIds: ['user-1'],
        }),
      }),
    );
  });

  it('notifies assignees of published notes only', async () => {
    const tenantDb = makeTenantDb(null);
    tenantDb.ceoNote.findMany = vi.fn().mockResolvedValue([
      {
        id: 'new-1',
        title: 'T',
        body: 'B',
        assignedUserIds: ['user-1', 'user-2'],
      },
    ]);
    const sent = await notifyPublishedNotes(tenantDb as never, ['new-1']);
    expect(sent).toBe(2);
    expect(tenantDb.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'user-1', link: '/ceo-notes/new-1' }),
        expect.objectContaining({ userId: 'user-2' }),
      ],
    });
  });

  it('sends nothing when note has no assignees', async () => {
    const tenantDb = makeTenantDb(null);
    tenantDb.ceoNote.findMany = vi.fn().mockResolvedValue([
      { id: 'new-1', title: 'T', body: 'B', assignedUserIds: [] },
    ]);
    const sent = await notifyPublishedNotes(tenantDb as never, ['new-1']);
    expect(sent).toBe(0);
    expect(tenantDb.notification.createMany).not.toHaveBeenCalled();
  });
});
