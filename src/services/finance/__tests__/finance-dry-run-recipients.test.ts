import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { previewFinanceRecipients } from '../finance-dry-run-recipients';
import { buildDedupKey } from '@/lib/telegram/notification-dedup';
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));

const tenantId = 'tenant-a';
const now = new Date('2026-08-15T01:00:00Z');
const resources = ['/finance/journals', '/finance/reports/income-statement'];
const identity = { id: 'identity', userId: 'user', tenantId, status: 'ACTIVE', telegramChatId: 'private-chat' };
const user = { id: 'user', isActive: true, isSuperAdmin: false, role: 'FINANCE', roles: [{ role: 'ADMIN' }] };
const pref = { userId: 'user', tenantId, enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null };
const identities = vi.fn(); const users = vi.fn(); const preferences = vi.fn(); const permissions = vi.fn(); const logs = vi.fn();
const tx = { telegramIdentity: { findMany: identities }, user: { findMany: users }, telegramNotificationPreference: { findMany: preferences }, rolePermission: { findMany: permissions }, telegramNotificationLog: { findMany: logs } } as unknown as Prisma.TransactionClient;
const run = () => previewFinanceRecipients(tx, tenantId, resources, now);
beforeEach(() => {
    vi.clearAllMocks(); identities.mockResolvedValue([identity]); users.mockResolvedValue([user]); preferences.mockResolvedValue([pref]);
    permissions.mockResolvedValue([{ role: 'ADMIN', resource: '/finance/journals' }]); logs.mockResolvedValue([]);
});
describe('finance recipient preview without delivery', () => {
    it('uses live roles, filters sections and never returns chat addresses', async () => {
        const result = await run();
        expect(result.truncated).toBe(false);
        expect(result.candidates[0]).toMatchObject({ userId: 'user', eligible: true, resources: ['/finance/journals'], reasons: [] });
        expect(JSON.stringify(result)).not.toContain('private-chat');
        expect(identities).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId } }));
        expect(preferences).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId }) }));
    });
    it.each([
        ['inactive user', 'USER_INACTIVE', () => users.mockResolvedValue([{ ...user, isActive: false }])],
        ['missing user', 'USER_MISSING', () => users.mockResolvedValue([])],
        ['revoked identity', 'IDENTITY_INACTIVE', () => identities.mockResolvedValue([{ ...identity, status: 'REVOKED' }])],
        ['no chat', 'CHAT_MISSING', () => identities.mockResolvedValue([{ ...identity, telegramChatId: null }])],
        ['no preference', 'PREFERENCE_MISSING', () => preferences.mockResolvedValue([])],
        ['disabled', 'PREFERENCE_DISABLED', () => preferences.mockResolvedValue([{ ...pref, enabled: false }])],
        ['digest disabled', 'PREFERENCE_DISABLED', () => preferences.mockResolvedValue([{ ...pref, dailyDigest: false }])],
        ['no permission', 'NO_RESOURCE_ACCESS', () => permissions.mockResolvedValue([])],
        ['invalid timezone', 'INVALID_QUIET_HOURS', () => preferences.mockResolvedValue([{ ...pref, timezone: 'bad/timezone' }])],
        ['invalid hours', 'INVALID_QUIET_HOURS', () => preferences.mockResolvedValue([{ ...pref, quietHoursStart: 25 }])],
        ['incomplete hours', 'INVALID_QUIET_HOURS', () => preferences.mockResolvedValue([{ ...pref, quietHoursStart: 22 }])],
        ['quiet window', 'QUIET_HOURS', () => preferences.mockResolvedValue([{ ...pref, quietHoursStart: 7, quietHoursEnd: 9 }])],
    ] as const)('blocks %s', async (_label, reason, setup) => {
        setup(); const candidate = (await run()).candidates[0];
        expect(candidate.eligible).toBe(false); expect(candidate.reasons).toContain(reason);
        expect(candidate.resources).toEqual([]);
    });
    it('allows parent permission but never treats child permission as access to the full journal section', async () => {
        permissions.mockResolvedValueOnce([{ role: 'FINANCE', resource: '/finance' }]);
        expect((await run()).candidates[0].resources).toEqual(resources);
        permissions.mockResolvedValueOnce([{ role: 'FINANCE', resource: '/finance/journals/restricted' }]);
        expect((await run()).candidates[0].eligible).toBe(false);
    });
    it('allows only active superadmins', async () => {
        users.mockResolvedValueOnce([{ ...user, isSuperAdmin: true }]); permissions.mockResolvedValue([]);
        expect((await run()).candidates[0].resources).toEqual(resources);
        users.mockResolvedValueOnce([{ ...user, isSuperAdmin: true, isActive: false }]);
        expect((await run()).candidates[0].eligible).toBe(false);
    });
    it.each(['SENT', 'FAILED'])('reports existing %s dedup without consuming it', async status => {
        const key = buildDedupKey({ tenantId, type: 'daily_digest', scope: 'user:2026-08-15' });
        logs.mockResolvedValue([{ dedupKey: key, status }]);
        expect((await run()).candidates[0]).toMatchObject({ eligible: false, dedupStatus: status, reasons: [`DEDUP_${status}`] });
        expect(logs).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId, dedupKey: { in: [key] } } }));
    });
    it('rejects duplicate user identities and shared chat destinations', async () => {
        identities.mockResolvedValueOnce([identity, { ...identity, id: 'second' }]);
        expect((await run()).candidates.every(c => c.reasons.includes('AMBIGUOUS_IDENTITY'))).toBe(true);
        identities.mockResolvedValueOnce([identity, { ...identity, id: 'second', userId: 'other' }]);
        expect((await run()).candidates.every(c => c.reasons.includes('AMBIGUOUS_IDENTITY'))).toBe(true);
    });
    it('caps candidates and fails eligibility closed when discovery truncated', async () => {
        identities.mockResolvedValue(Array.from({ length: 501 }, (_, n) => ({ ...identity, id: String(n), userId: String(n), telegramChatId: String(n) })));
        const result = await run(); expect(result.truncated).toBe(true); expect(result.candidates).toHaveLength(500);
        expect(result.candidates.every(c => !c.eligible && c.reasons.includes('RECIPIENTS_TRUNCATED'))).toBe(true);
    });
    it('handles empty recipients without a fallback recipient', async () => {
        identities.mockResolvedValue([]); expect((await run()).candidates).toEqual([]);
    });
    it.each([
        ['2026-08-15T14:59:59Z', false], ['2026-08-15T15:00:00Z', true],
        ['2026-08-15T17:00:00Z', true], ['2026-08-15T22:59:59Z', true], ['2026-08-15T23:00:00Z', false],
    ])('honors overnight WIB boundary %s', async (instant, quiet) => {
        preferences.mockResolvedValue([{ ...pref, quietHoursStart: 22, quietHoursEnd: 6 }]);
        const result = await previewFinanceRecipients(tx, tenantId, resources, new Date(instant));
        expect(result.candidates[0].reasons.includes('QUIET_HOURS')).toBe(quiet);
    });
    it('matches dedup using recipient timezone, not server timezone', async () => {
        preferences.mockResolvedValue([{ ...pref, timezone: 'America/New_York' }]);
        const key = buildDedupKey({ tenantId, type: 'daily_digest', scope: 'user:2026-08-14' });
        logs.mockResolvedValue([{ dedupKey: key, status: 'SENT' }]);
        expect((await run()).candidates[0].reasons).toContain('DEDUP_SENT');
    });
    it('treats equal quiet-hour endpoints as an empty window, matching the existing policy', async () => {
        preferences.mockResolvedValue([{ ...pref, quietHoursStart: 8, quietHoursEnd: 8 }]);
        expect((await run()).candidates[0].eligible).toBe(true);
    });
    it('does not treat a root slash as a blanket finance grant', async () => {
        permissions.mockResolvedValue([{ role: 'FINANCE', resource: '/' }]);
        expect((await run()).candidates[0].eligible).toBe(false);
    });
    it('rejects a corrupt empty permission instead of treating it as a parent grant', async () => {
        permissions.mockResolvedValue([{ role: 'FINANCE', resource: '' }]);
        expect((await run()).candidates[0].eligible).toBe(false);
    });
    it('only uses permissions assigned to this user, not another recipient role', async () => {
        users.mockResolvedValue([{ ...user, role: 'WAREHOUSE', roles: [] }]);
        expect((await run()).candidates[0].resources).toEqual([]);
    });
    it('does not swallow read failures as zero recipients', async () => {
        identities.mockRejectedValueOnce(new Error('query failed')); await expect(run()).rejects.toThrow();
    });
});
