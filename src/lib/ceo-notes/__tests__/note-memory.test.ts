import { describe, it, expect, vi } from 'vitest';

import { readNoteMemory, formatMemoryForPrompt } from '../note-memory';

function makeTenantDb(openNotes: unknown[] = [], pastNotes: unknown[] = []) {
  return {
    ceoNote: {
      findMany: vi.fn().mockImplementation((args: Record<string, unknown>) => {
        const where = args.where as { status: { in: string[] } };
        if (where.status.in.includes('PUBLISHED')) {
          return Promise.resolve(openNotes);
        }
        return Promise.resolve(pastNotes);
      }),
    },
  };
}

describe('readNoteMemory', () => {
  it('returns empty memory when no notes exist', async () => {
    const tenantDb = makeTenantDb();
    const memory = await readNoteMemory(tenantDb as never, ['x:1']);
    expect(memory.openRecurrences).toEqual([]);
    expect(memory.patternLines).toEqual([]);
    expect(formatMemoryForPrompt(memory)).toContain('Belum ada ingatan');
  });

  it('detects open notes with overlapping fingerprints', async () => {
    const tenantDb = makeTenantDb([
      {
        id: 'n-1',
        title: 'Stok karung kritis',
        occurrences: 2,
        sourceFingerprints: ['critical_stock:p-1', 'critical_stock:p-2'],
      },
      {
        id: 'n-2',
        title: 'Lainnya',
        occurrences: 1,
        sourceFingerprints: ['stuck_so:other'],
      },
    ]);
    const memory = await readNoteMemory(tenantDb as never, [
      'critical_stock:p-1',
    ]);
    expect(memory.openRecurrences).toHaveLength(1);
    expect(memory.openRecurrences[0]).toMatchObject({
      noteId: 'n-1',
      occurrences: 2,
      fingerprints: ['critical_stock:p-1'],
    });
    const text = formatMemoryForPrompt(memory);
    expect(text).toContain('JANGAN buat catatan baru');
  });

  it('aggregates 30-day patterns per detector', async () => {
    const now = new Date();
    const tenantDb = makeTenantDb([], [
      {
        sourceDetectors: ['overdue_ar'],
        sourceFingerprints: ['overdue_ar:i-1'],
        status: 'RESOLVED',
        createdAt: new Date(now.getTime() - 4 * 86_400_000),
        resolvedAt: new Date(now.getTime() - 1 * 86_400_000),
      },
      {
        sourceDetectors: ['overdue_ar'],
        sourceFingerprints: ['overdue_ar:i-2'],
        status: 'DISCARDED',
        createdAt: new Date(now.getTime() - 2 * 86_400_000),
        resolvedAt: null,
      },
    ]);
    const memory = await readNoteMemory(tenantDb as never, ['x:9']);
    expect(memory.patternLines).toHaveLength(1);
    expect(memory.patternLines[0]).toContain('overdue_ar');
    expect(memory.patternLines[0]).toContain('muncul 2x');
    expect(memory.patternLines[0]).toContain('selesai 1x');
  });
});
