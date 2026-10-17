import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DAY_MS, LEARNING_VERSION, jakartaDayStart } from '@/lib/learning/contracts';
import { withStatusAudit } from '@/lib/core/prisma-audit-extension';
const connection = process.env.ASSISTANT_TEST_MAIN_DATABASE_URL;
let db: PrismaClient;
let tenant: PrismaClient;
if (connection) {
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || url.port !== '55440' || url.pathname !== '/polyflow_assistant_main_test' || url.search) throw new Error('Only disposable assistant CI PostgreSQL allowed');
    db = withStatusAudit(new PrismaClient({ datasources: { db: { url: connection } } }));
    const tenantUrl = new URL(connection); tenantUrl.pathname = '/polyflow_assistant_tenant_a_test';
    tenant = new PrismaClient({ datasources: { db: { url: tenantUrl.toString() } } });
}
// An ambient tenant-like proxy must never be used for platform observations.
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => db, prisma: new Proxy({}, { get: () => { throw new Error('Ambient tenant access forbidden'); } }) }));
import { getProductLearningOverview, reviewProductLearning, runProductLearning } from '../product-learning.service';
const actorId = `learning-test-${randomUUID()}`;
const now = new Date();
const today = jakartaDayStart(now);
const start = new Date(today.getTime() - DAY_MS);
const policyVersion = `test-${randomUUID()}`;
const policy = { PRODUCT_LEARNING_ENABLED: 'true', PRODUCT_LEARNING_POLICY_VERSION: policyVersion, PRODUCT_LEARNING_ACTIVE_FROM: start.toISOString(), PRODUCT_LEARNING_RETENTION_DAYS: '90', PRODUCT_LEARNING_CLOSED_RETENTION_DAYS: '180', PRODUCT_LEARNING_SCOPE: 'restricted-global-product-reliability' };

describe.skipIf(!connection)('product learning real PostgreSQL contract', () => {
    beforeAll(async () => {
        for (const [key, value] of Object.entries(policy)) vi.stubEnv(key, value);
        await db.user.create({ data: { id: actorId, name: 'Synthetic reviewer', email: `${actorId}@example.invalid`, password: 'not-a-login', isSuperAdmin: true } });
        // Poison strings prove raw text and metadata never appear in derived records.
        await db.helpInteraction.createMany({ data: Array.from({ length: 30 }, (_, index) => ({ userId: actorId, tenantId: 'synthetic-tenant', channel: 'web', question: 'PRIVATE-POISON-QUESTION', answerPreview: 'PRIVATE-POISON-ANSWER', outcome: index < 15 ? 'FAILED' as const : 'SUCCESS' as const, latencyMs: 1, citedSlugs: [], createdAt: new Date(start.getTime() + 1000) })) });
        await db.helpInteraction.createMany({ data: ['BLOCKED', 'ESCALATED'].map(outcome => ({ userId: actorId, question: 'PRIVATE-POISON-BLOCKED', answerPreview: '', outcome: outcome as 'BLOCKED' | 'ESCALATED', latencyMs: 1, citedSlugs: [], createdAt: new Date(start.getTime() + 1000) })) });
        await db.usageEvent.createMany({ data: Array.from({ length: 25 }, (_, index) => ({ userId: actorId, tenantId: 'synthetic-tenant', featureKey: 'sales.orders.list', moduleKey: 'sales', eventType: index < 10 ? 'MOBILE_TASK_FAILED' : 'MOBILE_TASK_COMPLETED', source: 'MOBILE_WEB', sessionId: 'private-session', metadata: { customer: 'PRIVATE-POISON-CUSTOMER' }, occurredAt: new Date(start.getTime() + 1000), createdAt: new Date(start.getTime() + 1000) })) });
        await tenant.helpInteraction.create({ data: { userId: actorId, question: 'PRIVATE-TENANT-ONLY', answerPreview: '', outcome: 'FAILED', latencyMs: 1, citedSlugs: [], createdAt: new Date(start.getTime() + 1000) } });
    });
    afterAll(async () => {
        if (!db) return;
        await db.auditLog.deleteMany({ where: { userId: actorId } });
        await db.learningFinding.deleteMany({ where: { policyVersion } });
        await db.learningDailyRun.deleteMany({ where: { policyVersion } });
        await db.usageEvent.deleteMany({ where: { userId: actorId } });
        await db.helpInteraction.deleteMany({ where: { userId: actorId } });
        await tenant.helpInteraction.deleteMany({ where: { userId: actorId } });
        await db.user.delete({ where: { id: actorId } });
        await db.$disconnect(); await tenant.$disconnect(); vi.unstubAllEnvs();
    });
    it('replays additive migration on main/tenant and enforces SQL guards', async () => {
        expect(await tenant.learningDailyRun.count()).toBe(0);
        await expect(db.learningDailyRun.create({ data: { day: new Date('2001-01-01'), version: 'invalid', policyVersion, windowStart: today, windowEnd: start, expiresAt: today } })).rejects.toThrow();
    });
    it('handles duplicate execution concurrently, freezes snapshots, and excludes tenant/raw data', async () => {
        const results = await Promise.all([runProductLearning(now), runProductLearning(now)]);
        expect(results.some(result => result.state === 'COMPLETE')).toBe(true);
        expect(await db.learningDailyRun.count({ where: { policyVersion, status: 'COMPLETE' } })).toBe(1);
        const observations = await db.learningObservation.findMany({ where: { run: { policyVersion } } });
        expect(observations).toHaveLength(3);
        expect(observations.find(row => row.metricKey === 'help_failure_share')).toMatchObject({ numerator: 15, denominator: 30 });
        expect(observations.find(row => row.metricKey === 'mobile_failure_share')).toMatchObject({ numerator: 10, denominator: 25 });
        expect(await db.learningFinding.count({ where: { policyVersion } })).toBe(2);
        expect(JSON.stringify(await getProductLearningOverview(now))).not.toContain('PRIVATE-');
        await db.helpInteraction.updateMany({ where: { userId: actorId }, data: { outcome: 'SUCCESS' } });
        await runProductLearning(now);
        expect(await db.learningObservation.findMany({ where: { run: { policyVersion } } })).toEqual(observations);
        expect(await tenant.learningDailyRun.count()).toBe(0);
    });
    it('serializes reviews, audits atomically, and records baseline without inventing improvement', async () => {
        const finding = await db.learningFinding.findFirstOrThrow({ where: { policyVersion, metricKey: 'help_failure_share' } });
        const reviews = await Promise.allSettled([reviewProductLearning({ id: finding.id, action: 'accept' }, actorId, now), reviewProductLearning({ id: finding.id, action: 'reject' }, actorId, now)]);
        expect(reviews.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(await db.auditLog.count({ where: { userId: actorId, entityId: finding.id } })).toBe(1);
        const mobile = await db.learningFinding.findFirstOrThrow({ where: { policyVersion, metricKey: 'mobile_failure_share' } });
        await reviewProductLearning({ id: mobile.id, action: 'accept' }, actorId, now);
        await reviewProductLearning({ id: mobile.id, action: 'intervention', releaseRef: 'a'.repeat(40), verificationRef: 'src/lib/__tests__/synthetic.test.ts' }, actorId, now);
        expect(await db.learningFinding.findUnique({ where: { id: mobile.id } })).toMatchObject({ status: 'MONITORING', baselineComplete: false, evaluationResult: null });
    });
    it('rolls status back if manual audit fails; never falls back to outer audit', async () => {
        const entry = await db.learningFinding.create({ data: { fingerprint: `rollback-${actorId}`, policyVersion, metricKey: 'help_failure_share', ruleVersion: LEARNING_VERSION, firstSeenDay: today, lastSeenDay: today, latestNumerator: 10, latestDenominator: 20, expiresAt: new Date(now.getTime() + DAY_MS) } });
        await db.$executeRawUnsafe(`ALTER TABLE "AuditLog" ADD CONSTRAINT "learning_synthetic_audit_failure" CHECK ("action" != 'PRODUCT_LEARNING_REVIEW') NOT VALID`);
        try {
            await expect(reviewProductLearning({ id: entry.id, action: 'accept' }, actorId, now)).rejects.toThrow();
            expect((await db.learningFinding.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('OPEN');
            expect(await db.auditLog.count({ where: { entityId: entry.id } })).toBe(0);
        } finally { await db.$executeRawUnsafe('ALTER TABLE "AuditLog" DROP CONSTRAINT "learning_synthetic_audit_failure"'); }
    });
    it('recovers an expired lease, and retains active claims without duplicate writes', async () => {
        const run = await db.learningDailyRun.findFirstOrThrow({ where: { policyVersion } });
        await db.learningObservation.deleteMany({ where: { runId: run.id } });
        await db.learningDailyRun.update({ where: { id: run.id }, data: { status: 'RUNNING', leaseToken: 'old-worker', leaseUntil: new Date(now.getTime() + DAY_MS), completedAt: null } });
        expect((await runProductLearning(now)).state).toBe('BUSY');
        await db.learningDailyRun.update({ where: { id: run.id }, data: { leaseUntil: new Date(now.getTime() - 1) } });
        expect((await runProductLearning(now)).state).toBe('COMPLETE');
        expect(await db.learningObservation.count({ where: { runId: run.id } })).toBe(3);
        expect((await db.learningDailyRun.updateMany({ where: { id: run.id, status: 'RUNNING', leaseToken: 'old-worker' }, data: { status: 'FAILED' } })).count).toBe(0);
    });
    it('rechecks expiry after selection when a concurrent reviewer renews a finding', async () => {
        const entry = await db.learningFinding.create({ data: { fingerprint: `renewal-${actorId}`, policyVersion, metricKey: 'help_failure_share', ruleVersion: LEARNING_VERSION, firstSeenDay: today, lastSeenDay: today, latestNumerator: 10, latestDenominator: 20, expiresAt: new Date(now.getTime() - 1) } });
        const original = db.learningFinding.findMany.bind(db.learningFinding);
        const interleave = async (args: Parameters<typeof original>[0]) => {
            const candidates = await original(args);
            // Commit a renewal after cleanup selected the old version, before deletion.
            await db.learningFinding.update({ where: { id: entry.id }, data: { expiresAt: new Date(now.getTime() + DAY_MS) } });
            return candidates;
        };
        // Test-only Promise shim; production uses the real delegate after this read.
        const selection = vi.spyOn(db.learningFinding, 'findMany').mockImplementationOnce(interleave as unknown as typeof original);
        vi.stubEnv('PRODUCT_LEARNING_ENABLED', 'false');
        try {
            await runProductLearning(now);
            expect(await db.learningFinding.findUnique({ where: { id: entry.id } })).not.toBeNull();
        } finally { selection.mockRestore(); vi.stubEnv('PRODUCT_LEARNING_ENABLED', 'true'); }
    });
    it('evaluates persisted complete baseline and post-change windows without inferring causality', async () => {
        const baselineEnd = new Date(today.getTime() - 8 * DAY_MS);
        const baselineStart = new Date(baselineEnd.getTime() - 7 * DAY_MS);
        for (let index = 0; index < 7; index++) {
            const windowStart = new Date(baselineStart.getTime() + index * DAY_MS);
            await db.learningDailyRun.create({ data: { day: new Date(windowStart.getTime() + 7 * 3600000), version: LEARNING_VERSION, policyVersion, windowStart, windowEnd: new Date(windowStart.getTime() + DAY_MS), status: 'COMPLETE', expiresAt: new Date(now.getTime() + 30 * DAY_MS), observations: { create: { metricKey: 'unmapped_view_share', numerator: 5, denominator: 20, state: 'OBSERVED' } } } });
        }
        const entry = await db.learningFinding.create({ data: { fingerprint: `evaluated-${actorId}`, policyVersion, metricKey: 'unmapped_view_share', ruleVersion: LEARNING_VERSION, status: 'ACCEPTED', firstSeenDay: today, lastSeenDay: today, latestNumerator: 5, latestDenominator: 20, expiresAt: new Date(now.getTime() + DAY_MS) } });
        await reviewProductLearning({ id: entry.id, action: 'intervention', releaseRef: 'b'.repeat(40), verificationRef: 'src/lib/__tests__/example.test.ts' }, actorId, new Date(baselineEnd.getTime() + 3600000));
        const recorded = await db.learningFinding.findUniqueOrThrow({ where: { id: entry.id } });
        expect(recorded).toMatchObject({ baselineComplete: true, baselineNumerator: 35, baselineDenominator: 140, status: 'MONITORING' });
        for (let index = 0; index < 7; index++) {
            const windowStart = new Date(recorded.evaluationStart!.getTime() + index * DAY_MS);
            // Last day is already frozen by the first test; replace only this synthetic metric.
            const run = await db.learningDailyRun.upsert({ where: { day_version: { day: new Date(windowStart.getTime() + 7 * 3600000), version: LEARNING_VERSION } }, update: {}, create: { day: new Date(windowStart.getTime() + 7 * 3600000), version: LEARNING_VERSION, policyVersion, windowStart, windowEnd: new Date(windowStart.getTime() + DAY_MS), status: 'COMPLETE', expiresAt: new Date(now.getTime() + 30 * DAY_MS) } });
            await db.learningObservation.upsert({ where: { runId_metricKey: { runId: run.id, metricKey: 'unmapped_view_share' } }, update: { numerator: 1, denominator: 20 }, create: { runId: run.id, metricKey: 'unmapped_view_share', numerator: 1, denominator: 20, state: 'OBSERVED' } });
        }
        await runProductLearning(now);
        expect(await db.learningFinding.findUnique({ where: { id: entry.id } })).toMatchObject({ status: 'EVALUATED', evaluationResult: 'IMPROVED_OBSERVED_METRIC', evaluationNumerator: 7, evaluationDenominator: 140 });
    });
    it('purges expired owned records when disabled without deleting source telemetry', async () => {
        const sourceCount = await db.usageEvent.count({ where: { userId: actorId } });
        await db.learningDailyRun.updateMany({ where: { policyVersion }, data: { expiresAt: new Date(now.getTime() - 1) } });
        await db.learningFinding.updateMany({ where: { policyVersion }, data: { expiresAt: new Date(now.getTime() - 1) } });
        vi.stubEnv('PRODUCT_LEARNING_ENABLED', 'false');
        expect((await runProductLearning(now)).state).toBe('DISABLED');
        expect(await db.learningObservation.count()).toBe(0);
        expect(await db.learningFinding.count({ where: { policyVersion } })).toBe(0);
        expect(await db.usageEvent.count({ where: { userId: actorId } })).toBe(sourceCount);
    });
});
