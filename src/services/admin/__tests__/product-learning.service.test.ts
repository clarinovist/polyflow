import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    db: { learningDailyRun: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), update: vi.fn() }, learningFinding: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() }, learningObservation: { createMany: vi.fn(), findMany: vi.fn() }, user: { findUnique: vi.fn() }, $transaction: vi.fn() },
    collect: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => mocks.db }));
vi.mock('../learning-source', () => ({ collectLearningObservations: mocks.collect }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
import { getProductLearningOverview, learningBrief, reviewProductLearning, runProductLearning, summarizeLearningWindow } from '../product-learning.service';
import { DAY_MS, LEARNING_VERSION } from '@/lib/learning/contracts';
import type { LearningFinding, Prisma } from '@prisma/client';
const now = new Date('2026-10-18T03:00:00+07:00');
const start = new Date('2026-10-17T00:00:00+07:00');
const policy = { PRODUCT_LEARNING_ENABLED: 'true', PRODUCT_LEARNING_POLICY_VERSION: 'test-v1', PRODUCT_LEARNING_ACTIVE_FROM: start.toISOString(), PRODUCT_LEARNING_RETENTION_DAYS: '90', PRODUCT_LEARNING_CLOSED_RETENTION_DAYS: '180', PRODUCT_LEARNING_SCOPE: 'restricted-global-product-reliability' };
const finding = () => ({ id: 'finding', metricKey: 'help_failure_share', ruleVersion: LEARNING_VERSION, policyVersion: 'test-v1', domain: 'PRODUCT', status: 'OPEN', lastSeenDay: new Date('2026-10-17'), expiresAt: new Date('2027-01-01'), latestNumerator: 10, latestDenominator: 20, occurrences: 1, closedAt: null });
beforeEach(() => {
    vi.resetAllMocks(); vi.unstubAllEnvs();
    for (const [key, value] of Object.entries(policy)) vi.stubEnv(key, value);
    mocks.db.learningDailyRun.findMany.mockResolvedValue([]);
    mocks.db.learningFinding.findMany.mockResolvedValue([]);
    mocks.db.learningDailyRun.findUniqueOrThrow.mockResolvedValue({ id: 'run', status: 'PENDING', policyVersion: 'test-v1' });
    mocks.db.learningDailyRun.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.learningFinding.findUnique.mockResolvedValue(finding());
    mocks.db.learningFinding.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.learningObservation.findMany.mockResolvedValue([]);
    mocks.db.user.findUnique.mockResolvedValue({ isSuperAdmin: true, isActive: true });
    mocks.db.$transaction.mockImplementation(async (fn: (db: unknown) => unknown) => fn(mocks.db));
    mocks.collect.mockResolvedValue([{ metricKey: 'help_failure_share', numerator: 10, denominator: 20 }]);
});
describe('daily product learning', () => {
    it('does not read source data when disabled or policy invalid; still expires owned data', async () => {
        vi.stubEnv('PRODUCT_LEARNING_ENABLED', 'false');
        mocks.db.learningDailyRun.findMany.mockResolvedValueOnce([{ id: 'old' }]);
        mocks.db.learningFinding.findMany.mockResolvedValueOnce([{ id: 'old-item' }]);
        expect((await runProductLearning(now)).state).toBe('DISABLED');
        expect(mocks.collect).not.toHaveBeenCalled();
        expect(mocks.db.learningDailyRun.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old'] }, expiresAt: { lte: now } } });
        vi.stubEnv('PRODUCT_LEARNING_ENABLED', 'true'); vi.stubEnv('PRODUCT_LEARNING_SCOPE', 'all');
        expect((await runProductLearning(now)).state).toBe('POLICY_REQUIRED');
    });
    it('freezes completed snapshots, handles busy and policy conflict without source reads', async () => {
        mocks.db.learningDailyRun.findUniqueOrThrow.mockResolvedValueOnce({ id: 'run', status: 'COMPLETE' });
        expect((await runProductLearning(now)).processed).toBe(0);
        expect(mocks.collect).not.toHaveBeenCalled();
        mocks.db.learningDailyRun.updateMany.mockResolvedValueOnce({ count: 0 });
        expect((await runProductLearning(now)).state).toBe('BUSY');
        mocks.db.learningDailyRun.findUniqueOrThrow.mockResolvedValueOnce({ id: 'run', status: 'FAILED', policyVersion: 'different' });
        expect((await runProductLearning(now)).state).toBe('POLICY_CONFLICT');
    });
    it('writes bounded observations and creates one stable investigation key', async () => {
        expect(await runProductLearning(now)).toEqual({ state: 'COMPLETE', processed: 1 });
        expect(mocks.collect).toHaveBeenCalledWith(mocks.db, start, new Date(start.getTime() + DAY_MS));
        expect(mocks.db.learningObservation.createMany).toHaveBeenCalledWith({ data: [{ runId: 'run', metricKey: 'help_failure_share', numerator: 10, denominator: 20, state: 'OBSERVED' }] });
        expect(mocks.db.learningFinding.createMany.mock.calls[0][0].data[0].fingerprint).toBe(`${LEARNING_VERSION}:test-v1:help_failure_share:global`);
    });
    it('updates repeated evidence conditionally without racing a closed decision', async () => {
        await runProductLearning(now);
        expect(mocks.db.learningFinding.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { fingerprint: `${LEARNING_VERSION}:test-v1:help_failure_share:global`, lastSeenDay: { lt: new Date('2026-10-17') }, closedAt: null } }));
    });
    it('sanitizes errors and rejects a worker without the fenced claim', async () => {
        mocks.collect.mockRejectedValueOnce(new Error('sensitive SQL and customer data'));
        expect((await runProductLearning(now)).state).toBe('FAILED');
        expect(mocks.db.learningDailyRun.updateMany.mock.calls.at(-1)?.[0].data.failureCode).toBe('AGGREGATION_FAILED');
        mocks.db.learningDailyRun.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
        expect((await runProductLearning(now)).state).toBe('FAILED');
    });
    it('waits for a complete prospective day and exposes distinct health states', async () => {
        vi.stubEnv('PRODUCT_LEARNING_ACTIVE_FROM', now.toISOString());
        expect((await runProductLearning(now)).state).toBe('AWAITING_COMPLETE_DAY');
        expect((await getProductLearningOverview(now)).health).toBe('AWAITING_COMPLETE_DAY');
        vi.stubEnv('PRODUCT_LEARNING_ACTIVE_FROM', start.toISOString());
        expect((await getProductLearningOverview(now)).health).toBe('STALE');
        mocks.db.learningDailyRun.findMany.mockResolvedValue([{ status: 'COMPLETE', policyVersion: 'test-v1', day: new Date('2026-10-17'), leaseToken: 'never-return' }]);
        const overview = await getProductLearningOverview(now);
        expect(overview.health).toBe('CURRENT'); expect(JSON.stringify(overview)).not.toContain('never-return');
        mocks.db.learningDailyRun.findMany.mockResolvedValue([{ status: 'FAILED', policyVersion: 'test-v1' }]);
        expect((await getProductLearningOverview(now)).health).toBe('FAILED');
    });
    it('does not claim a complete seven-day window from missing observations', async () => {
        const end = new Date(start.getTime() + 7 * DAY_MS);
        expect((await summarizeLearningWindow(mocks.db as unknown as Prisma.TransactionClient, 'help_failure_share', start, end, 'test-v1', now)).complete).toBe(false);
        mocks.db.learningObservation.findMany.mockResolvedValue(Array.from({ length: 7 }, (_, i) => ({ numerator: 2, denominator: 20, run: { windowStart: new Date(start.getTime() + i * DAY_MS), windowEnd: new Date(start.getTime() + (i + 1) * DAY_MS) } })));
        expect((await summarizeLearningWindow(mocks.db as unknown as Prisma.TransactionClient, 'help_failure_share', start, end, 'test-v1', now)).complete).toBe(true);
    });
    it('marks a due outcome inconclusive with missing post-intervention data', async () => {
        mocks.db.learningFinding.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...finding(), status: 'MONITORING', evaluationStart: new Date('2026-10-10'), evaluationEnd: new Date('2026-10-17'), baselineNumerator: 10, baselineDenominator: 100, baselineComplete: true }]);
        await runProductLearning(now);
        expect(mocks.db.learningFinding.updateMany.mock.calls.at(-1)?.[0].data.evaluationResult).toBe('INCONCLUSIVE');
    });
});
describe('review and developer handoff', () => {
    it('uses conditional transitions and same-transaction audit', async () => {
        expect(await reviewProductLearning({ id: 'finding', action: 'accept' }, 'owner', now)).toEqual({ success: true });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', fromStatus: 'OPEN', toStatus: 'ACCEPTED', tx: mocks.db }));
        mocks.db.learningFinding.updateMany.mockResolvedValueOnce({ count: 0 });
        await expect(reviewProductLearning({ id: 'finding', action: 'accept' }, 'owner', now)).rejects.toThrow('Status');
    });
    it('rejects disabled, inactive actors, expired records and unsupported domains', async () => {
        mocks.db.user.findUnique.mockResolvedValueOnce(null);
        await expect(reviewProductLearning({ id: 'finding', action: 'reject' }, 'owner', now)).rejects.toThrow('superadmin');
        mocks.db.learningFinding.findUnique.mockResolvedValueOnce({ ...finding(), domain: 'PRICING' });
        await expect(reviewProductLearning({ id: 'finding', action: 'reject' }, 'owner', now)).rejects.toThrow('tersedia');
        vi.stubEnv('PRODUCT_LEARNING_ENABLED', 'false');
        await expect(reviewProductLearning({ id: 'finding', action: 'reject' }, 'owner', now)).rejects.toThrow('belum aktif');
    });
    it('records intervention but never marks it improved without evaluation', async () => {
        await reviewProductLearning({ id: 'finding', action: 'intervention', releaseRef: 'a'.repeat(40), verificationRef: 'src/lib/__tests__/example.test.ts' }, 'owner', now);
        const data = mocks.db.learningFinding.updateMany.mock.calls[0][0].data;
        expect(data.status).toBe('MONITORING'); expect(data.baselineComplete).toBe(false); expect(data.evaluationResult).toBeUndefined();
        expect(data.evaluationStart > data.baselineEnd).toBe(true);
        await reviewProductLearning({ id: 'finding', action: 'reject' }, 'owner', now);
        expect(mocks.db.learningFinding.updateMany.mock.calls[1][0].data.closedAt).toEqual(now);
    });
    it('exports only structured learning evidence, not arbitrary extra content', () => {
        const row = { ...finding(), question: 'private content', releaseRef: null, verificationRef: null, evaluationResult: 'IMPROVED_OBSERVED_METRIC', baselineStart: start, baselineEnd: now, baselineNumerator: 20, baselineDenominator: 100, baselineComplete: true, evaluationStart: start, evaluationEnd: now, evaluationNumerator: 10, evaluationDenominator: 100, evaluatedAt: now } as unknown as LearningFinding;
        const brief = learningBrief([row]); expect(brief).toContain('10/20'); expect(brief).not.toContain('private content');
        expect(brief).toContain('policy: test-v1'); expect(brief).toContain('events: 20/100; complete: true');
        expect(brief).toContain('events: 10/100'); expect(brief).toContain(`evaluated at: ${now.toISOString()}`);
        expect(learningBrief([row], 'mobile')).not.toContain('## finding');
    });
});
