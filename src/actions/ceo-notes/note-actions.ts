'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { requireRole } from '@/lib/tools/auth-checks';
import { resolveAllowedResources } from '@/lib/telegram/permissions';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import {
    NotFoundError,
    ConflictError,
    BusinessRuleError,
} from '@/lib/errors/errors';
import type { CeoNoteStatus } from '@prisma/client';

const PATH = '/ceo-notes';

const ACTIVE_STATUSES: CeoNoteStatus[] = ['PUBLISHED', 'CLAIMED'];
const DONE_STATUSES: CeoNoteStatus[] = ['RESOLVED', 'DISCARDED'];

async function assertCanActOnNote(userId: string, requiredResources: string[]) {
    const allowed = await resolveAllowedResources(userId);
    if (allowed === 'ALL') return;
    const hasAccess = requiredResources.some((r) => allowed.includes(r));
    if (!hasAccess) {
        throw new BusinessRuleError(
            'Anda tidak memiliki izin untuk catatan ini.',
        );
    }
}

async function assertIsAdmin() {
    await requireRole(['ADMIN']);
    return requireAuth();
}

export const listMyNotes = withTenant(async function listMyNotes(opts?: {
    statuses?: CeoNoteStatus[];
}) {
    return safeAction(async () => {
        const session = await requireAuth();
        const allowed = await resolveAllowedResources(session.user.id);
        const statuses = opts?.statuses ?? ACTIVE_STATUSES;

        const notes = await prisma.ceoNote.findMany({
            where: {
                status: { in: statuses },
                OR: [
                    { assignedUserIds: { has: session.user.id } },
                    ...(allowed === 'ALL'
                        ? [{}]
                        : [
                                {
                                    requiredResources: {
                                        hasSome: allowed,
                                    },
                                },
                            ]),
                ],
            },
            orderBy: [{ priority: 'asc' }, { publishedAt: 'desc' }],
            include: {
                claimedBy: { select: { id: true, name: true, email: true } },
                resolvedBy: { select: { id: true, name: true, email: true } },
                comments: {
                    orderBy: { createdAt: 'asc' },
                    take: 50,
                },
            },
        });

        return serializeData(notes);
    });
});

export const listDraftNotes = withTenant(async function listDraftNotes() {
    return safeAction(async () => {
        await assertIsAdmin();
        const notes = await prisma.ceoNote.findMany({
            where: { status: 'DRAFT' },
            orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
            include: {
                claimedBy: { select: { id: true, name: true, email: true } },
                resolvedBy: { select: { id: true, name: true, email: true } },
                comments: { orderBy: { createdAt: 'asc' }, take: 50 },
            },
        });
        return serializeData(notes);
    });
});

export const approveNote = withTenant(async function approveNote(
    noteId: string,
) {
    return safeAction(async () => {
        const session = await assertIsAdmin();
        const note = await prisma.ceoNote.findUnique({
            where: { id: noteId },
            select: { status: true, assignedUserIds: true, title: true, body: true },
        });
        if (!note) throw new NotFoundError('Catatan CEO', noteId);
        if (note.status !== 'DRAFT') {
            throw new ConflictError('Hanya draft yang bisa disetujui.');
        }

        const now = new Date();
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.ceoNote.update({
                where: { id: noteId },
                data: { status: 'PUBLISHED', publishedAt: now },
            });
            await tx.ceoNoteEvent.create({
                data: {
                    noteId,
                    action: 'APPROVED',
                    actorId: session.user.id,
                    fromStatus: 'DRAFT',
                    toStatus: 'PUBLISHED',
                },
            });
            if (note.assignedUserIds.length > 0) {
                await tx.notification.createMany({
                    data: note.assignedUserIds.map((userId) => ({
                        userId,
                        type: 'SYSTEM',
                        title: `Catatan CEO: ${note.title}`,
                        message: note.body.slice(0, 500),
                        link: `/ceo-notes/${noteId}`,
                    })),
                });
            }
            return updated;
        });

        revalidatePath(PATH);
        return serializeData(result);
    });
});

export const updateDraftNote = withTenant(async function updateDraftNote(
    noteId: string,
    input: { title?: string; body?: string; assignedUserIds?: string[] },
) {
    return safeAction(async () => {
        const session = await assertIsAdmin();
        const note = await prisma.ceoNote.findUnique({
            where: { id: noteId },
            select: { status: true },
        });
        if (!note) throw new NotFoundError('Catatan CEO', noteId);
        if (note.status !== 'DRAFT') {
            throw new ConflictError('Hanya draft yang bisa diubah.');
        }

        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.ceoNote.update({
                where: { id: noteId },
                data: {
                    ...(input.title?.trim() ? { title: input.title.trim().slice(0, 200) } : {}),
                    ...(input.body?.trim() ? { body: input.body.trim().slice(0, 4000) } : {}),
                    ...(input.assignedUserIds ? { assignedUserIds: input.assignedUserIds } : {}),
                    editedByCeo: true,
                },
            });
            await tx.ceoNoteEvent.create({
                data: {
                    noteId,
                    action: 'EDITED',
                    actorId: session.user.id,
                    fromStatus: 'DRAFT',
                    toStatus: 'DRAFT',
                },
            });
            return updated;
        });

        revalidatePath(PATH);
        return serializeData(result);
    });
});

export const discardNote = withTenant(async function discardNote(
    noteId: string,
) {
    return safeAction(async () => {
        const session = await assertIsAdmin();
        const note = await prisma.ceoNote.findUnique({
            where: { id: noteId },
            select: { status: true },
        });
        if (!note) throw new NotFoundError('Catatan CEO', noteId);
        if (DONE_STATUSES.includes(note.status)) {
            throw new ConflictError('Catatan ini sudah selesai.');
        }

        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.ceoNote.update({
                where: { id: noteId },
                data: { status: 'DISCARDED' },
            });
            await tx.ceoNoteEvent.create({
                data: {
                    noteId,
                    action: 'DISCARDED',
                    actorId: session.user.id,
                    fromStatus: note.status,
                    toStatus: 'DISCARDED',
                },
            });
            return updated;
        });

        revalidatePath(PATH);
        return serializeData(result);
    });
});

export const claimNote = withTenant(async function claimNote(noteId: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        const note = await prisma.ceoNote.findUnique({
            where: { id: noteId },
            select: { requiredResources: true },
        });
        if (!note) throw new NotFoundError('Catatan CEO', noteId);
        await assertCanActOnNote(session.user.id, note.requiredResources);

        const result = await prisma.$transaction(async (tx) => {
            const { count } = await tx.ceoNote.updateMany({
                where: { id: noteId, status: 'PUBLISHED' },
                data: {
                    status: 'CLAIMED',
                    claimedById: session.user.id,
                    claimedAt: new Date(),
                },
            });
            if (count === 0) {
                throw new ConflictError(
                    'Catatan ini sudah diklaim orang lain atau sudah selesai.',
                );
            }
            await tx.ceoNoteEvent.create({
                data: {
                    noteId,
                    action: 'CLAIMED',
                    actorId: session.user.id,
                    fromStatus: 'PUBLISHED',
                    toStatus: 'CLAIMED',
                },
            });
            return tx.ceoNote.findUniqueOrThrow({ where: { id: noteId } });
        });

        revalidatePath(PATH);
        return serializeData(result);
    });
});

export const resolveNote = withTenant(async function resolveNote(
    noteId: string,
    note?: string,
) {
    return safeAction(async () => {
        const session = await requireAuth();
        const existing = await prisma.ceoNote.findUnique({
            where: { id: noteId },
            select: { status: true, requiredResources: true },
        });
        if (!existing) throw new NotFoundError('Catatan CEO', noteId);
        if (DONE_STATUSES.includes(existing.status)) {
            throw new ConflictError('Catatan ini sudah selesai.');
        }
        await assertCanActOnNote(session.user.id, existing.requiredResources);

        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.ceoNote.update({
                where: { id: noteId },
                data: {
                    status: 'RESOLVED',
                    resolvedById: session.user.id,
                    resolvedAt: new Date(),
                    resolutionNote: note?.trim() || null,
                },
            });
            await tx.ceoNoteEvent.create({
                data: {
                    noteId,
                    action: 'RESOLVED',
                    actorId: session.user.id,
                    fromStatus: existing.status,
                    toStatus: 'RESOLVED',
                    note: note?.trim() || undefined,
                },
            });
            return updated;
        });

        revalidatePath(PATH);
        return serializeData(result);
    });
});

export const blockNote = withTenant(async function blockNote(
    noteId: string,
    reason: string,
) {
    return safeAction(async () => {
        const session = await requireAuth();
        if (!reason?.trim()) {
            throw new BusinessRuleError(
                'Alasan kendala wajib diisi supaya CEO bisa membantu.',
            );
        }
        const existing = await prisma.ceoNote.findUnique({
            where: { id: noteId },
            select: { status: true, requiredResources: true },
        });
        if (!existing) throw new NotFoundError('Catatan CEO', noteId);
        if (DONE_STATUSES.includes(existing.status)) {
            throw new ConflictError('Catatan ini sudah selesai.');
        }
        await assertCanActOnNote(session.user.id, existing.requiredResources);

        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.ceoNote.update({
                where: { id: noteId },
                data: { status: 'BLOCKED' },
            });
            await tx.ceoNoteEvent.create({
                data: {
                    noteId,
                    action: 'BLOCKED',
                    actorId: session.user.id,
                    fromStatus: existing.status,
                    toStatus: 'BLOCKED',
                    note: reason.trim().slice(0, 2000),
                },
            });
            await tx.ceoNoteComment.create({
                data: {
                    noteId,
                    authorId: session.user.id,
                    body: reason.trim().slice(0, 2000),
                },
            });
            return updated;
        });

        revalidatePath(PATH);
        return serializeData(result);
    });
});

export const commentOnNote = withTenant(async function commentOnNote(
    noteId: string,
    body: string,
) {
    return safeAction(async () => {
        const session = await requireAuth();
        if (!body?.trim()) {
            throw new BusinessRuleError('Komentar tidak boleh kosong.');
        }
        const existing = await prisma.ceoNote.findUnique({
            where: { id: noteId },
            select: { status: true, requiredResources: true },
        });
        if (!existing) throw new NotFoundError('Catatan CEO', noteId);
        if (DONE_STATUSES.includes(existing.status)) {
            throw new ConflictError(
                'Catatan sudah selesai — tidak bisa dikomentari lagi.',
            );
        }
        await assertCanActOnNote(session.user.id, existing.requiredResources);

        const comment = await prisma.ceoNoteComment.create({
            data: {
                noteId,
                authorId: session.user.id,
                body: body.trim().slice(0, 4000),
            },
        });

        revalidatePath(PATH);
        return serializeData(comment);
    });
});
