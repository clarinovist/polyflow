import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
    helpInteraction: { findFirst: vi.fn() },
    telegramNotificationLog: { createMany: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => db }));
import { assistantBugReportNotice, reportAssistantBug } from '../bug-report';

const identity = { tenantId: 'tenant-test', userId: 'user-test' };
const request = () => reportAssistantBug('report-test', identity);
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ASSISTANT_BUG_REPORTS_ENABLED', 'true');
    vi.stubEnv('TELEGRAM_ASSISTANT_BUG_REPORT_CHAT_ID', '-100123');
    vi.stubEnv(
        'TELEGRAM_ASSISTANT_BUG_REPORT_BOT_TOKEN',
        'synthetic-test-token',
    );
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'interactive-bot-must-not-be-used');
    vi.stubEnv('TELEGRAM_KILL_SWITCH', 'false');
    db.helpInteraction.findFirst.mockResolvedValue({ id: 'report-test' });
    db.telegramNotificationLog.createMany.mockResolvedValue({ count: 1 });
    db.telegramNotificationLog.update.mockResolvedValue({});
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) });
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('safe Telegram bug reports', () => {
    it('verifies persisted report scope, reserves atomically and sends only static text plus report ID', async () => {
        expect(await request()).toBe('SENT');
        expect(db.helpInteraction.findFirst).toHaveBeenCalledWith({ where: { id: 'report-test', ...identity, channel: 'web', outcome: 'ESCALATED', conversationId: { not: null } }, select: { id: true } });
        expect(db.telegramNotificationLog.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(Object.keys(body).sort()).toEqual(['chat_id', 'text']);
        expect(body.text).toContain('report-test');
        expect(body.text).not.toMatch(
            /tenant-test|user-test|synthetic-test-token|interactive-bot-must-not-be-used|https?:/,
        );
        expect(fetchMock.mock.calls[0][0]).toContain('synthetic-test-token');
        expect(fetchMock.mock.calls[0][0]).not.toContain(
            'interactive-bot-must-not-be-used',
        );
        expect(db.telegramNotificationLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', telegramMessageId: '42', sentAt: expect.any(Date) }) }));
    });
    it.each([
        ['ASSISTANT_BUG_REPORTS_ENABLED', 'false'],
        ['TELEGRAM_ASSISTANT_BUG_REPORT_CHAT_ID', ''],
        ['TELEGRAM_ASSISTANT_BUG_REPORT_CHAT_ID', '@untrusted'],
        ['TELEGRAM_ASSISTANT_BUG_REPORT_BOT_TOKEN', ''],
        ['TELEGRAM_KILL_SWITCH', 'true'],
    ])('fails closed when %s=%s', async (key, value) => {
        vi.stubEnv(key, value);
        expect(await request()).toBe('UNAVAILABLE');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(db.helpInteraction.findFirst).not.toHaveBeenCalled();
    });
    it('does not fall back to the interactive bot credential', async () => {
        vi.stubEnv('TELEGRAM_ASSISTANT_BUG_REPORT_BOT_TOKEN', '');
        vi.stubEnv('TELEGRAM_BOT_TOKEN', 'interactive-bot-only');
        expect(await request()).toBe('UNAVAILABLE');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('does not send for forged identity, invalid ID or missing persisted scope', async () => {
        expect(await reportAssistantBug('invalid\nsecret', identity)).toBe('UNAVAILABLE');
        expect(await reportAssistantBug('report-test', { ...identity, userId: '' })).toBe('UNAVAILABLE');
        db.helpInteraction.findFirst.mockResolvedValue(null);
        expect(await request()).toBe('UNAVAILABLE');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('uses tenant/user/hour keys and suppresses concurrent/retry attempts before network', async () => {
        const keys = new Set<string>();
        db.telegramNotificationLog.createMany.mockImplementation(async ({ data }: { data: Array<{ dedupKey: string }> }) => {
            const key = data[0].dedupKey;
            if (keys.has(key)) return { count: 0 };
            keys.add(key); return { count: 1 };
        });
        expect((await Promise.all([request(), request()])).sort()).toEqual(['SENT', 'THROTTLED']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(await reportAssistantBug('other-report', identity)).toBe('THROTTLED');
        expect(await reportAssistantBug('report-test', { ...identity, tenantId: 'other-tenant' })).toBe('SENT');
        expect(await reportAssistantBug('report-test', { ...identity, userId: 'other-user' })).toBe('SENT');
    });
    it('never sends when lookup or reservation fails', async () => {
        db.helpInteraction.findFirst.mockRejectedValueOnce(new Error('DB down'));
        expect(await request()).toBe('UNKNOWN');
        db.telegramNotificationLog.createMany.mockRejectedValueOnce(new Error('DB down'));
        expect(await request()).toBe('UNKNOWN');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it.each([
        [{ ok: false }, 'FAILED'],
        [{ ok: true, json: async () => ({ ok: false }) }, 'FAILED'],
        [{ ok: true, json: async () => ({ ok: true, result: { message_id: 0 } }) }, 'UNKNOWN'],
        [{ ok: true, json: async () => ({}) }, 'UNKNOWN'],
        [{ ok: true, json: async () => { throw new Error('bad JSON'); } }, 'UNKNOWN'],
    ])('does not claim success for invalid Telegram response', async (response, expected) => {
        fetchMock.mockResolvedValue(response);
        expect(await request()).toBe(expected);
        expect(db.telegramNotificationLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', sentAt: null }) }));
    });
    it('aborts at five seconds and records ambiguous outcome without retry', async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation((_url: string, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('timeout')));
        }));
        const pending = request();
        await vi.advanceTimersByTimeAsync(5000);
        expect(await pending).toBe('UNKNOWN');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('treats a failed post-send audit update as unknown, without retry', async () => {
        db.telegramNotificationLog.update.mockRejectedValueOnce(new Error('DB down'));
        expect(await request()).toBe('UNKNOWN');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('requires allowed escalation and full persistence before showing any delivery result', async () => {
        const response = { answer: 'text', citations: [], disposition: 'ESCALATE' as const, safety: { allowed: true }, conversationId: 'conv-test', historySaved: true };
        expect(await assistantBugReportNotice({ ...response, disposition: 'NEEDS_CLARIFICATION' }, 'report-test', identity)).toBeUndefined();
        expect(await assistantBugReportNotice({ ...response, safety: { allowed: false } }, 'report-test', identity)).toBeUndefined();
        expect(await assistantBugReportNotice(response, null, identity)).toContain('belum tersimpan');
        expect(await assistantBugReportNotice({ ...response, historySaved: false }, 'report-test', identity)).toContain('tidak dikirim');
        expect(await assistantBugReportNotice({ ...response, conversationId: undefined }, 'report-test', identity)).toContain('tidak dikirim');
        expect(await assistantBugReportNotice(response, 'report-test', { userId: 'user-test' })).toContain('belum tersedia');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await assistantBugReportNotice(response, 'report-test', identity)).toContain('terkirim');
    });
});
