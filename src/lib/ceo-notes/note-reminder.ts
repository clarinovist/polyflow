import type { PrismaClient } from '@prisma/client';
import { sendTelegramMessage } from '@/lib/telegram/send-message';
import { isInQuietHours } from '@/lib/telegram/quiet-hours';

export type ReminderOutcome = {
    reminded: string[];
    escalated: string[];
};

const REMIND_AFTER_HOURS = 24;

type OwnerRecipient = {
    userId: string;
    telegramChatId: string;
    timezone: string;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
};

async function findOwnerRecipients(
    tenantDb: PrismaClient,
): Promise<OwnerRecipient[]> {
    const identities = await tenantDb.telegramIdentity.findMany({
        where: { status: 'ACTIVE', telegramChatId: { not: null } },
        select: { userId: true, telegramChatId: true },
    });
    if (identities.length === 0) return [];

    const userIds = identities.map((i) => i.userId);
    const [users, adminRoleRows, prefs] = await Promise.all([
        tenantDb.user.findMany({
            where: { id: { in: userIds }, isActive: true },
            select: { id: true, role: true, isSuperAdmin: true },
        }),
        tenantDb.userRole.findMany({
            where: { userId: { in: userIds }, role: 'ADMIN' },
            select: { userId: true },
        }),
        tenantDb.telegramNotificationPreference.findMany({
            where: { userId: { in: userIds } },
        }),
    ]);

    const adminViaSecondary = new Set(adminRoleRows.map((r) => r.userId));
    const ownerIds = new Set(
        users
            .filter(
                (u) =>
                    u.isSuperAdmin ||
                    u.role === 'ADMIN' ||
                    adminViaSecondary.has(u.id),
            )
            .map((u) => u.id),
    );
    const prefMap = new Map(prefs.map((p) => [p.userId, p]));

    return identities
        .filter((i) => ownerIds.has(i.userId) && i.telegramChatId)
        .map((i) => {
            const pref = prefMap.get(i.userId);
            return {
                userId: i.userId,
                telegramChatId: i.telegramChatId as string,
                timezone: pref?.timezone || 'Asia/Jakarta',
                quietHoursStart: pref?.quietHoursStart ?? null,
                quietHoursEnd: pref?.quietHoursEnd ?? null,
            };
        });
}

/**
 * Tindak otomatis fase 1: ingatkan penanggung jawab yang belum klaim
 * (H+1 via notifikasi in-app) dan eskalasi catatan rutin ber-tenggat yang
 * lewat dueAt ke owner via Telegram, hormati quiet hours. Hanya untuk note
 * ber-dueAt; tanpa tenggat tidak ada eskalasi.
 */
export async function remindAndEscalateNotes(
    tenantDb: PrismaClient,
    now: Date = new Date(),
): Promise<ReminderOutcome> {
    const outcome: ReminderOutcome = { reminded: [], escalated: [] };
    const remindBefore = new Date(
        now.getTime() - REMIND_AFTER_HOURS * 3_600_000,
    );

    const unclaimed = await tenantDb.ceoNote.findMany({
        where: {
            status: 'PUBLISHED',
            publishedAt: { lt: remindBefore },
            remindedAt: null,
        },
        select: { id: true, title: true, assignedUserIds: true },
    });

    for (const note of unclaimed) {
        if (note.assignedUserIds.length === 0) continue;
        await tenantDb.notification.createMany({
            data: note.assignedUserIds.map((userId) => ({
                userId,
                type: 'SYSTEM',
                title: `Belum diklaim: ${note.title}`,
                message:
                    'Catatan CEO ini belum ada yang mengklaim lebih dari 1 hari. Buka halaman Catatan CEO untuk menindaklanjuti.',
                link: `/ceo-notes/${note.id}`,
            })),
        });
        await tenantDb.ceoNote.update({
            where: { id: note.id },
            data: {
                remindedAt: now,
                events: {
                    create: { action: 'REMINDED', toStatus: 'PUBLISHED' },
                },
            },
        });
        outcome.reminded.push(note.id);
    }

    const overdue = await tenantDb.ceoNote.findMany({
        where: {
            status: { in: ['PUBLISHED', 'CLAIMED', 'BLOCKED'] },
            dueAt: { lt: now },
            escalatedAt: null,
        },
        select: { id: true, title: true, status: true, claimedById: true },
    });
    if (overdue.length === 0) return outcome;

    const owners = await findOwnerRecipients(tenantDb);
    const reachable = owners.filter((o) => !isInQuietHours(o, o.timezone, now));
    if (reachable.length === 0) return outcome;

    const lines = [`*Catatan CEO lewat tenggat (${overdue.length})*`, ''];
    for (const n of overdue) {
        lines.push(`- ${n.title}`);
    }
    const message = lines.join('\n');
    for (const owner of reachable) {
        await sendTelegramMessage(owner.telegramChatId, message);
    }

    await tenantDb.ceoNote.updateMany({
        where: { id: { in: overdue.map((n) => n.id) } },
        data: { escalatedAt: now },
    });
    for (const n of overdue) {
        await tenantDb.ceoNoteEvent.create({
            data: {
                noteId: n.id,
                action: 'ESCALATED',
                fromStatus: n.status,
                toStatus: n.status,
            },
        });
    }
    outcome.escalated = overdue.map((n) => n.id);

    return outcome;
}
