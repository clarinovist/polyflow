import type { PrismaClient } from '@prisma/client';
import { resolveUsersForResources } from '@/lib/findings/finding-routing';
import type { ComposedNote } from './note-composer';

export type PublishOutcome = {
    created: string[];
    updated: string[];
};

const OPEN_STATUSES = ['PUBLISHED', 'CLAIMED', 'BLOCKED'] as const;

async function resolveRecipients(
    tenantDb: PrismaClient,
    note: ComposedNote,
): Promise<{ userIds: string[]; roles: string[] }> {
    const fromResources = await resolveUsersForResources(
        tenantDb,
        note.requiredResources,
    );
    return {
        userIds: [...new Set(fromResources)],
        roles: [],
    };
}

export async function publishNotes(
    tenantDb: PrismaClient,
    notes: ComposedNote[],
    meta: { aiModel: string | null },
): Promise<PublishOutcome> {
    const outcome: PublishOutcome = { created: [], updated: [] };
    const now = new Date();

    for (const note of notes) {
        const openMatch = await tenantDb.ceoNote.findFirst({
            where: {
                status: { in: [...OPEN_STATUSES] },
                sourceFingerprints: { hasSome: note.sourceFingerprints },
            },
            select: { id: true },
        });

        if (openMatch) {
            await tenantDb.ceoNote.update({
                where: { id: openMatch.id },
                data: {
                    occurrences: { increment: 1 },
                    lastSeenAt: now,
                    events: {
                        create: {
                            action: 'RECURRED',
                            note: `Terdeteksi lagi: ${note.sourceFingerprints.join(', ')}`,
                        },
                    },
                },
            });
            outcome.updated.push(openMatch.id);
            continue;
        }

        const recipients = await resolveRecipients(tenantDb, note);
        const isCritical = note.priority === 'CRITICAL';
        const created = await tenantDb.ceoNote.create({
            data: {
                origin: 'AI',
                status: isCritical ? 'DRAFT' : 'PUBLISHED',
                priority: note.priority,
                title: note.title,
                body: note.body,
                suggestedSteps: note.suggestedSteps,
                sourceDetectors: note.sourceDetectors,
                sourceFingerprints: note.sourceFingerprints,
                aiModel: meta.aiModel,
                aiGeneratedAt: meta.aiModel ? now : null,
                assignedUserIds: recipients.userIds,
                assignedRoles: recipients.roles,
                requiredResources: note.requiredResources,
                dueAt: note.dueAt ? new Date(note.dueAt) : null,
                publishedAt: isCritical ? null : now,
                events: {
                    create: {
                        action: isCritical ? 'COMPOSED' : 'PUBLISHED',
                        toStatus: isCritical ? 'DRAFT' : 'PUBLISHED',
                    },
                },
            },
        });
        outcome.created.push(created.id);
    }

    return outcome;
}

export async function notifyPublishedNotes(
    tenantDb: PrismaClient,
    noteIds: string[],
): Promise<number> {
    if (noteIds.length === 0) return 0;
    const notes = await tenantDb.ceoNote.findMany({
        where: { id: { in: noteIds }, status: 'PUBLISHED' },
        select: { id: true, title: true, body: true, assignedUserIds: true },
    });
    let sent = 0;
    for (const note of notes) {
        if (note.assignedUserIds.length === 0) continue;
        await tenantDb.notification.createMany({
            data: note.assignedUserIds.map((userId) => ({
                userId,
                type: 'SYSTEM',
                title: `Catatan CEO: ${note.title}`,
                message: note.body.slice(0, 500),
                link: `/ceo-notes/${note.id}`,
            })),
        });
        sent += note.assignedUserIds.length;
    }
    return sent;
}
