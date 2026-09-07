import { BusinessRuleError } from '@/lib/errors/errors';
import { createHash } from 'node:crypto';
import type { Prisma, Role, TelegramIdentity, TelegramNotificationPreference } from '@prisma/client';
import { isInQuietHours } from '@/lib/telegram/quiet-hours';

const LIMIT = 500;
type Identity = Pick<TelegramIdentity, 'id' | 'userId' | 'status' | 'telegramChatId'>;
type User = { id: string; role: Role; isActive: boolean; isSuperAdmin: boolean; roles: { role: Role }[] };
type Pref = Pick<TelegramNotificationPreference, 'userId' | 'enabled' | 'dailyDigest' | 'quietHoursStart' | 'quietHoursEnd' | 'timezone'>;
export type RecipientCandidate = {
    identityId: string; userId: string; eligible: boolean; resources: string[]; reasons: string[]; dedupStatus: string | null;
};

function timePolicy(pref: Pref | undefined, now: Date): { reason: string | null; day: string | null } {
    if (!pref) return { reason: 'PREFERENCE_MISSING', day: null };
    try {
        const { quietHoursStart: start, quietHoursEnd: end } = pref;
        if ((start == null) !== (end == null) || [start, end].some(h => h != null && (!Number.isInteger(h) || h < 0 || h > 23))) throw new BusinessRuleError('Invalid hours');
        const day = now.toLocaleDateString('sv-SE', { timeZone: pref.timezone });
        return { reason: isInQuietHours(pref, pref.timezone, now) ? 'QUIET_HOURS' : null, day };
    } catch {
        return { reason: 'INVALID_QUIET_HOURS', day: null };
    }
}

async function readRecipients(tx: Prisma.TransactionClient, tenantId: string) {
    const rows = await tx.telegramIdentity.findMany({
        where: { tenantId }, orderBy: { id: 'asc' }, take: LIMIT + 1,
        select: { id: true, userId: true, status: true, telegramChatId: true },
    });
    const identities = rows.slice(0, LIMIT);
    const userIds = [...new Set(identities.map(i => i.userId))];
    const [users, prefs] = await Promise.all([
        tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, role: true, isActive: true, isSuperAdmin: true, roles: { select: { role: true } } } }),
        tx.telegramNotificationPreference.findMany({
            where: { tenantId, userId: { in: userIds } },
            select: { userId: true, enabled: true, dailyDigest: true, quietHoursStart: true, quietHoursEnd: true, timezone: true },
        }),
    ]);
    const roles = [...new Set(users.flatMap(u => [u.role, ...u.roles.map(r => r.role)]))];
    const permissions = await tx.rolePermission.findMany({ where: { role: { in: roles }, canAccess: true }, select: { role: true, resource: true } });
    return { identities, users, prefs, permissions, truncated: rows.length > LIMIT };
}

function candidateBase(identity: Identity, user: User | undefined, pref: Pref | undefined, allowed: string[], now: Date, ambiguous: boolean, truncated: boolean) {
    const time = timePolicy(pref, now);
    const reasons = [
        !user && 'USER_MISSING', user && !user.isActive && 'USER_INACTIVE',
        identity.status !== 'ACTIVE' && 'IDENTITY_INACTIVE', !identity.telegramChatId && 'CHAT_MISSING',
        pref && (!pref.enabled || !pref.dailyDigest) && 'PREFERENCE_DISABLED',
        time.reason, allowed.length === 0 && 'NO_RESOURCE_ACCESS',
        ambiguous && 'AMBIGUOUS_IDENTITY', truncated && 'RECIPIENTS_TRUNCATED',
    ].filter((reason): reason is string => typeof reason === 'string');
    return { identityId: identity.id, userId: identity.userId, reasons, allowed, day: time.day };
}

/** Read-only eligibility preview. It neither reserves a dedup key nor approves a PIC for rollout. */
export async function previewFinanceRecipients(tx: Prisma.TransactionClient, tenantId: string, resources: string[], now: Date) {
    const data = await readRecipients(tx, tenantId);
    const bases = data.identities.map(identity => {
        const user = data.users.find(u => u.id === identity.userId);
        const roles = user ? [user.role, ...user.roles.map(r => r.role)] : [];
        const grants = data.permissions.filter(p => roles.includes(p.role)).map(p => p.resource);
        const allowed = resources.filter(resource => user?.isSuperAdmin || grants.some(g => g.startsWith('/') && (resource === g || resource.startsWith(`${g}/`))));
        const ambiguous = data.identities.some(other => other.id !== identity.id && other.status === 'ACTIVE'
            && (other.userId === identity.userId || (!!identity.telegramChatId && other.telegramChatId === identity.telegramChatId)));
        const base = candidateBase(identity, user, data.prefs.find(p => p.userId === identity.userId), allowed, now, ambiguous, data.truncated);
        // Matches the existing daily_digest key without importing its writable ambient-DB helper.
        const key = base.day ? createHash('sha256').update(`${tenantId}:daily_digest:${identity.userId}:${base.day}`).digest('hex').slice(0, 32) : null;
        return { ...base, key };
    });
    const keys = [...new Set(bases.flatMap(b => b.key ? [b.key] : []))];
    const logs = await tx.telegramNotificationLog.findMany({ where: { tenantId, dedupKey: { in: keys } }, select: { dedupKey: true, status: true } });
    const candidates: RecipientCandidate[] = bases.map(base => {
        const log = logs.find(row => row.dedupKey === base.key);
        const reasons = [...base.reasons, ...(log ? [`DEDUP_${log.status}`] : [])];
        return { identityId: base.identityId, userId: base.userId, eligible: reasons.length === 0,
            resources: reasons.length === 0 ? base.allowed : [], reasons, dedupStatus: log?.status ?? null };
    });
    return { candidates, truncated: data.truncated };
}
