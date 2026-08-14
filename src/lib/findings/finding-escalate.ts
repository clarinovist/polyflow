import type {
    FindingSeverity,
    FindingStatus,
    PrismaClient,
} from '@prisma/client';
import { sendTelegramMessage } from '@/lib/telegram/send-message';
import { isInQuietHours } from '@/lib/telegram/quiet-hours';

export type EscalationOutcome = {
    escalated: string[];
    ownerRecipients: number;
};

// status is narrowed to UNCLAIMED/CLAIMED by the findMany filter below, but
// typed as the full FindingStatus since that's what Prisma's inferred
// return type carries — narrowing the type here without narrowing the
// runtime data would just make the assignment fight the compiler.
type OverdueFinding = {
    id: string;
    detector: string;
    severity: FindingSeverity;
    status: FindingStatus;
    headline: string;
    detail: string | null;
    claimedById: string | null;
    slaDueAt: Date | null;
};

type OwnerRecipient = {
    userId: string;
    telegramChatId: string;
    timezone: string;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
};

async function findOverdueFindings(
    tenantDb: PrismaClient,
    now: Date,
): Promise<OverdueFinding[]> {
    return tenantDb.finding.findMany({
        where: {
            status: { in: ['UNCLAIMED', 'CLAIMED'] },
            slaDueAt: { lt: now },
            escalatedAt: null,
        },
        select: {
            id: true,
            detector: true,
            severity: true,
            status: true,
            headline: true,
            detail: true,
            claimedById: true,
            slaDueAt: true,
        },
    });
}

// "Owner" = superadmin or ADMIN role (primary or secondary), matching the
// existing isAdminOrSuperAdmin convention in src/lib/telegram/allowlist.ts —
// no separate PIC/owner table, derived the same way finding-routing.ts
// derives eligible staff.
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

    const adminViaSecondaryRole = new Set(adminRoleRows.map((r) => r.userId));
    const ownerUserIds = new Set(
        users
            .filter(
                (u) =>
                    u.isSuperAdmin ||
                    u.role === 'ADMIN' ||
                    adminViaSecondaryRole.has(u.id),
            )
            .map((u) => u.id),
    );

    const prefMap = new Map(prefs.map((p) => [p.userId, p]));

    return identities
        .filter((i) => ownerUserIds.has(i.userId) && i.telegramChatId)
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

function formatEscalationMessage(
    findings: OverdueFinding[],
    claimantNames: Map<string, string>,
): string {
    const lines = [`*⚠️ Temuan lewat SLA (${findings.length})*`, ''];

    for (const f of findings) {
        const icon = f.severity === 'CRITICAL' ? '🔴' : '🟡';
        lines.push(`${icon} ${f.headline}`);
        if (f.detail) lines.push(`   ${f.detail}`);
        if (f.status === 'CLAIMED' && f.claimedById) {
            const name = claimantNames.get(f.claimedById) ?? f.claimedById;
            lines.push(`   Diklaim oleh ${name}, belum selesai`);
        } else {
            lines.push(`   Belum ada yang klaim`);
        }
    }

    return lines.join('\n');
}

/**
 * Escalates findings whose SLA has elapsed and that are still open
 * (UNCLAIMED or CLAIMED) and not yet escalated. Sends one summary message
 * per reachable owner (superadmin/ADMIN with an active Telegram identity),
 * respecting each owner's quiet-hours preference individually.
 *
 * A finding is only marked escalated (escalatedAt set, FindingEvent logged)
 * once at least one owner was actually notified — if every owner is
 * currently in quiet hours, escalation is deferred to the next run rather
 * than silently marked done.
 */
export async function escalateOverdueFindings(
    tenantDb: PrismaClient,
    now: Date = new Date(),
): Promise<EscalationOutcome> {
    const overdue = await findOverdueFindings(tenantDb, now);
    if (overdue.length === 0) {
        return { escalated: [], ownerRecipients: 0 };
    }

    const owners = await findOwnerRecipients(tenantDb);
    const reachable = owners.filter((o) => !isInQuietHours(o, o.timezone, now));

    if (reachable.length === 0) {
        return { escalated: [], ownerRecipients: 0 };
    }

    const claimantIds = [
        ...new Set(
            overdue
                .filter((f): f is OverdueFinding & { claimedById: string } =>
                    Boolean(f.claimedById),
                )
                .map((f) => f.claimedById),
        ),
    ];
    const claimants = claimantIds.length
        ? await tenantDb.user.findMany({
              where: { id: { in: claimantIds } },
              select: { id: true, name: true, email: true },
          })
        : [];
    const claimantNames = new Map(
        claimants.map((u) => [u.id, u.name || u.email]),
    );

    const message = formatEscalationMessage(overdue, claimantNames);
    for (const owner of reachable) {
        await sendTelegramMessage(owner.telegramChatId, message);
    }

    const escalatedIds = overdue.map((f) => f.id);
    await tenantDb.finding.updateMany({
        where: { id: { in: escalatedIds } },
        data: { escalatedAt: now },
    });
    for (const f of overdue) {
        await tenantDb.findingEvent.create({
            data: {
                findingId: f.id,
                action: 'ESCALATED',
                fromStatus: f.status,
                toStatus: f.status,
            },
        });
    }

    return { escalated: escalatedIds, ownerRecipients: reachable.length };
}
