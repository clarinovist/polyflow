import type { PrismaClient } from '@prisma/client';

export type NoteMemory = {
    openRecurrences: Array<{
        noteId: string;
        title: string;
        occurrences: number;
        fingerprints: string[];
    }>;
    patternLines: string[];
};

const OPEN_STATUSES = ['PUBLISHED', 'CLAIMED', 'BLOCKED'] as const;
const MEMORY_DAYS = 30;
const MAX_PATTERN_LINES = 20;

function daysAgo(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
}

/**
 * Per-tenant memory for the CEO Notes brain. No new table — memory is the
 * note history itself: open notes with overlapping fingerprints (dedup +
 * recurrence signal) plus a 30-day aggregate of resolved/discarded notes
 * (repeat-pattern signal). Pure read, safe to call from cron.
 */
export async function readNoteMemory(
    tenantDb: PrismaClient,
    fingerprints: string[],
): Promise<NoteMemory> {
    const fingerprintSet = new Set(fingerprints);

    const openNotes = await tenantDb.ceoNote.findMany({
        where: { status: { in: [...OPEN_STATUSES] } },
        select: { id: true, title: true, occurrences: true, sourceFingerprints: true },
    });

    const openRecurrences = openNotes
        .filter((n) =>
            n.sourceFingerprints.some((f) => fingerprintSet.has(f)),
        )
        .map((n) => ({
            noteId: n.id,
            title: n.title,
            occurrences: n.occurrences,
            fingerprints: n.sourceFingerprints.filter((f) =>
                fingerprintSet.has(f),
            ),
        }));

    const since = daysAgo(MEMORY_DAYS);
    const past = await tenantDb.ceoNote.findMany({
        where: {
            status: { in: ['RESOLVED', 'DISCARDED'] },
            updatedAt: { gte: since },
        },
        select: {
            sourceDetectors: true,
            sourceFingerprints: true,
            status: true,
            createdAt: true,
            resolvedAt: true,
        },
    });

    const byDetector = new Map<string, { seen: number; resolved: number; daysToResolve: number[] }>();
    for (const n of past) {
        for (const d of n.sourceDetectors) {
            const agg = byDetector.get(d) ?? { seen: 0, resolved: 0, daysToResolve: [] };
            agg.seen++;
            if (n.status === 'RESOLVED') {
                agg.resolved++;
                const end = n.resolvedAt ?? new Date();
                agg.daysToResolve.push(
                    Math.max(
                        0,
                        Math.round(
                            (end.getTime() - n.createdAt.getTime()) / 86_400_000,
                        ),
                    ),
                );
            }
            byDetector.set(d, agg);
        }
    }

    const patternLines = [...byDetector.entries()]
        .sort((a, b) => b[1].seen - a[1].seen)
        .slice(0, MAX_PATTERN_LINES)
        .map(([detector, agg]) => {
            const avg =
                agg.daysToResolve.length > 0
                    ? Math.round(
                          agg.daysToResolve.reduce((s, v) => s + v, 0) /
                              agg.daysToResolve.length,
                      )
                    : null;
            return (
                `- ${detector}: muncul ${agg.seen}x dalam ${MEMORY_DAYS} hari, ` +
                `selesai ${agg.resolved}x` +
                (avg !== null ? `, rata-rata selesai ${avg} hari` : '')
            );
        });

    return { openRecurrences, patternLines };
}

export function formatMemoryForPrompt(memory: NoteMemory): string {
    const lines: string[] = [];
    if (memory.openRecurrences.length > 0) {
        lines.push('Catatan yang masih terbuka dan muncul lagi hari ini:');
        for (const r of memory.openRecurrences) {
            lines.push(
                `- "${r.title}" (sudah berulang ${r.occurrences}x, id: ${r.noteId}) — JANGAN buat catatan baru untuk ini, laporkan sebagai kemunculan ulang.`,
            );
        }
    }
    if (memory.patternLines.length > 0) {
        lines.push('Pola 30 hari terakhir di tenant ini:');
        lines.push(...memory.patternLines);
    }
    if (lines.length === 0) {
        return 'Belum ada ingatan: ini catatan pertama untuk tenant ini.';
    }
    return lines.join('\n');
}
