import { randomUUID } from 'node:crypto';
import { Prisma, type LearningFinding } from '@prisma/client';
import { getMainPrisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { BusinessRuleError } from '@/lib/errors/errors';
import {
    DAY_MS, LEARNING_VERSION, LEARNING_METRICS, compareWindows, dayKey,
    firstCompleteDay, jakartaDayStart, learningConfiguration, learningReviewSchema,
    metricKeySchema, observationState, warrantsInvestigation,
    type LearningPolicy, type LearningReview, type MetricKey,
} from '@/lib/learning/contracts';
import { collectLearningObservations } from './learning-source';

type Database = ReturnType<typeof getMainPrisma>;
const LEASE_MS = 120_000;
const MAX_CATCHUP_DAYS = 7;

/** Deletion follows expiry fixed when data was collected; disabling never extends retention. */
async function purgeExpired(db: Database, now: Date) {
    const runs = await db.learningDailyRun.findMany({ where: { expiresAt: { lte: now } }, select: { id: true }, take: 100 });
    if (runs.length) await db.learningDailyRun.deleteMany({ where: { id: { in: runs.map(run => run.id) }, expiresAt: { lte: now } } });
    const findings = await db.learningFinding.findMany({ where: { expiresAt: { lte: now } }, select: { id: true }, take: 100 });
    if (findings.length) await db.learningFinding.deleteMany({ where: { id: { in: findings.map(finding => finding.id) }, expiresAt: { lte: now } } });
}

export async function summarizeLearningWindow(db: Prisma.TransactionClient, metricKey: MetricKey, start: Date, end: Date, policyVersion: string, now: Date) {
    const rows = await db.learningObservation.findMany({
        where: { metricKey, run: { version: LEARNING_VERSION, policyVersion, status: 'COMPLETE', windowStart: { gte: start, lt: end }, expiresAt: { gt: now } } },
        select: { numerator: true, denominator: true, run: { select: { windowStart: true, windowEnd: true } } },
    });
    const expected = (end.getTime() - start.getTime()) / DAY_MS;
    const starts = new Set(rows.filter(row => row.run.windowEnd.getTime() - row.run.windowStart.getTime() === DAY_MS).map(row => row.run.windowStart.getTime()));
    const complete = expected === 7 && Array.from({ length: 7 }, (_, index) => start.getTime() + index * DAY_MS).every(day => starts.has(day));
    return { metricKey, numerator: rows.reduce((sum, row) => sum + row.numerator, 0), denominator: rows.reduce((sum, row) => sum + row.denominator, 0), complete };
}

async function evaluateDue(db: Database, policy: LearningPolicy, now: Date) {
    const due = await db.learningFinding.findMany({ where: { status: 'MONITORING', policyVersion: policy.version, evaluationEnd: { lte: jakartaDayStart(now) }, expiresAt: { gt: now } }, take: 30, orderBy: { evaluationEnd: 'asc' } });
    for (const finding of due) {
        await db.$transaction(async tx => {
            if (!finding.evaluationStart || !finding.evaluationEnd) return;
            const metricKey = metricKeySchema.parse(finding.metricKey);
            const after = await summarizeLearningWindow(tx, metricKey, finding.evaluationStart, finding.evaluationEnd, policy.version, now);
            const before = { metricKey, numerator: finding.baselineNumerator ?? 0, denominator: finding.baselineDenominator ?? 0 };
            const result = compareWindows(before, after, finding.baselineComplete && after.complete && finding.ruleVersion === LEARNING_VERSION);
            await tx.learningFinding.updateMany({ where: { id: finding.id, status: 'MONITORING' }, data: {
                status: 'EVALUATED', evaluationResult: result,
                evaluationNumerator: after.numerator, evaluationDenominator: after.denominator,
                evaluatedAt: now, closedAt: now,
                expiresAt: new Date(now.getTime() + policy.closedRetentionDays * DAY_MS),
            } });
        });
    }
}

async function runDay(db: Database, policy: LearningPolicy, start: Date, now: Date) {
    const end = new Date(start.getTime() + DAY_MS);
    const identity = { day: dayKey(start), version: LEARNING_VERSION };
    // INSERT ON CONFLICT avoids an emulated empty-update upsert race on first run.
    await db.learningDailyRun.createMany({ skipDuplicates: true, data: [{
        ...identity, policyVersion: policy.version, windowStart: start, windowEnd: end,
        expiresAt: new Date(end.getTime() + policy.retentionDays * DAY_MS),
    }] });
    const run = await db.learningDailyRun.findUniqueOrThrow({ where: { day_version: identity } });
    if (run.status === 'COMPLETE') return 'complete';
    // A changed policy must not silently reinterpret an old run.
    if (run.policyVersion !== policy.version) return 'policy_conflict';
    const token = randomUUID();
    const claimed = await db.learningDailyRun.updateMany({ where: {
        id: run.id, status: { not: 'COMPLETE' },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    }, data: { status: 'RUNNING', leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 }, failureCode: null } });
    if (claimed.count !== 1) return 'busy';
    try {
        await db.$transaction(async tx => {
            // Row lock + token is a fencing barrier. Expired/replaced workers cannot commit.
            const locked = await tx.learningDailyRun.updateMany({ where: { id: run.id, status: 'RUNNING', leaseToken: token, leaseUntil: { gt: now } }, data: { failureCode: null } });
            if (locked.count !== 1) throw new BusinessRuleError('LEASE_LOST');
            const observations = await collectLearningObservations(tx, start, end);
            await tx.learningObservation.createMany({ data: observations.map(observation => ({ ...observation, runId: run.id, state: observationState(observation) })) });
            for (const observation of observations.filter(warrantsInvestigation)) {
                const fingerprint = `${LEARNING_VERSION}:${policy.version}:${observation.metricKey}:global`;
                await tx.learningFinding.createMany({ skipDuplicates: true, data: [{
                    fingerprint, metricKey: observation.metricKey, ruleVersion: LEARNING_VERSION, policyVersion: policy.version,
                    firstSeenDay: identity.day, lastSeenDay: identity.day,
                    latestNumerator: observation.numerator, latestDenominator: observation.denominator,
                    expiresAt: new Date(end.getTime() + policy.retentionDays * DAY_MS),
                }] });
                // Conditional write prevents racing a reviewer or another day's job.
                // Rejected/evaluated items remain frozen, including their retention.
                await tx.learningFinding.updateMany({ where: { fingerprint, lastSeenDay: { lt: identity.day }, closedAt: null }, data: {
                    lastSeenDay: identity.day, occurrences: { increment: 1 },
                    latestNumerator: observation.numerator, latestDenominator: observation.denominator,
                    expiresAt: new Date(end.getTime() + policy.retentionDays * DAY_MS),
                } });
            }
            await tx.learningDailyRun.update({ where: { id: run.id }, data: { status: 'COMPLETE', completedAt: new Date(), leaseToken: null, leaseUntil: null } });
        }, { timeout: 30_000, maxWait: 5_000 });
        return 'created';
    } catch {
        await db.learningDailyRun.updateMany({ where: { id: run.id, leaseToken: token, status: 'RUNNING' }, data: { status: 'FAILED', failureCode: 'AGGREGATION_FAILED', leaseToken: null, leaseUntil: null } });
        return 'failed';
    }
}

/** No LLM, raw event hydration, tenant fan-out or business mutation. */
export async function runProductLearning(now = new Date()) {
    const db = getMainPrisma();
    await purgeExpired(db, now);
    const policy = learningConfiguration();
    if (!policy.enabled) return { state: policy.reason, processed: 0 };
    const today = jakartaDayStart(now);
    const first = firstCompleteDay(policy.activeFrom);
    const earliest = new Date(Math.max(first.getTime(), today.getTime() - MAX_CATCHUP_DAYS * DAY_MS));
    let processed = 0;
    for (let start = earliest; start < today; start = new Date(start.getTime() + DAY_MS)) {
        const result = await runDay(db, policy, start, now);
        if (result === 'failed' || result === 'busy' || result === 'policy_conflict') return { state: result.toUpperCase(), processed };
        if (result === 'created') processed++;
    }
    await evaluateDue(db, policy, now);
    return { state: first >= today ? 'AWAITING_COMPLETE_DAY' : 'COMPLETE', processed };
}

export async function getProductLearningOverview(now = new Date()) {
    const db = getMainPrisma();
    const configuration = learningConfiguration();
    const [runs, findings] = await Promise.all([
        db.learningDailyRun.findMany({ where: { version: LEARNING_VERSION, expiresAt: { gt: now } }, include: { observations: true }, orderBy: { day: 'desc' }, take: 30 }),
        db.learningFinding.findMany({ where: { expiresAt: { gt: now } }, orderBy: [{ status: 'asc' }, { lastSeenDay: 'desc' }], take: 100 }),
    ]);
    const yesterday = dayKey(new Date(jakartaDayStart(now).getTime() - DAY_MS));
    const activeRuns = configuration.enabled ? runs.filter(run => run.policyVersion === configuration.version) : runs;
    const latest = activeRuns.find(run => run.status === 'COMPLETE');
    const health = !configuration.enabled ? configuration.reason : firstCompleteDay(configuration.activeFrom) >= jakartaDayStart(now) ? 'AWAITING_COMPLETE_DAY' :
        activeRuns.some(run => run.status === 'FAILED') ? 'FAILED' : !latest || latest.day < yesterday ? 'STALE' : 'CURRENT';
    return { health, configuration, runs: runs.map(({ leaseToken: _token, ...run }) => run), findings };
}

/** Caller supplies only a session-derived actor. Conditional transition + manual audit is atomic. */
export async function reviewProductLearning(input: LearningReview, actorId: string, now = new Date()) {
    const parsed = learningReviewSchema.parse(input);
    const policy = learningConfiguration();
    if (!policy.enabled) throw new BusinessRuleError('Learning belum aktif dengan kebijakan yang disetujui.');
    const db = getMainPrisma();
    return db.$transaction(async tx => {
        const actor = await tx.user.findUnique({ where: { id: actorId }, select: { isSuperAdmin: true, isActive: true } });
        if (!actor?.isSuperAdmin || !actor.isActive) throw new BusinessRuleError('Hanya superadmin aktif yang dapat meninjau learning.');
        const finding = await tx.learningFinding.findUnique({ where: { id: parsed.id } });
        if (!finding || finding.expiresAt <= now || finding.domain !== 'PRODUCT' || finding.ruleVersion !== LEARNING_VERSION || finding.policyVersion !== policy.version) throw new BusinessRuleError('Learning tidak tersedia.');
        const expected = parsed.action === 'intervention' ? 'ACCEPTED' : 'OPEN';
        const data: Prisma.LearningFindingUpdateManyMutationInput = parsed.action === 'reject' ? {
            status: 'REJECTED', closedAt: now, expiresAt: new Date(now.getTime() + policy.closedRetentionDays * DAY_MS),
        } : { status: 'ACCEPTED' };
        if (parsed.action === 'intervention') {
            const baselineEnd = jakartaDayStart(now);
            const baselineStart = new Date(baselineEnd.getTime() - 7 * DAY_MS);
            const baseline = await summarizeLearningWindow(tx, metricKeySchema.parse(finding.metricKey), baselineStart, baselineEnd, policy.version, now);
            const evaluationStart = new Date(baselineEnd.getTime() + DAY_MS);
            Object.assign(data, {
                status: 'MONITORING', releaseRef: parsed.releaseRef, verificationRef: parsed.verificationRef,
                interventionAt: now, baselineStart, baselineEnd, baselineComplete: baseline.complete,
                baselineNumerator: baseline.numerator, baselineDenominator: baseline.denominator,
                evaluationStart, evaluationEnd: new Date(evaluationStart.getTime() + 7 * DAY_MS),
                expiresAt: new Date(now.getTime() + policy.retentionDays * DAY_MS),
            });
        }
        const updated = await tx.learningFinding.updateMany({ where: { id: finding.id, status: expected }, data });
        if (updated.count !== 1) throw new BusinessRuleError('Status berubah atau transisi tidak diizinkan. Muat ulang.');
        await logActivity({ userId: actorId, action: 'PRODUCT_LEARNING_REVIEW', entityType: 'LearningFinding', entityId: finding.id, fromStatus: expected, toStatus: String(data.status), tx });
        return { success: true };
    });
}

export function learningBrief(findings: LearningFinding[], module?: string): string {
    const lines = ['# Product learning brief', '', 'Restricted aggregate evidence; not anonymous, not causal proof. No permission for automatic edits/releases.', 'Telemetry is best-effort; counts are events, not users/tasks. Validate with source and synthetic regression tests.', ''];
    for (const finding of findings) {
        const key = metricKeySchema.safeParse(finding.metricKey);
        if (!key.success || (module && LEARNING_METRICS[key.data].module !== module)) continue;
        const rule = LEARNING_METRICS[key.data];
        const timestamp = (value: Date | null) => value?.toISOString() ?? 'not recorded';
        lines.push(
            `## ${finding.id}: ${rule.label}`,
            `State: ${finding.status}; version: ${finding.ruleVersion}; policy: ${finding.policyVersion}`,
            `Window day: ${finding.lastSeenDay.toISOString().slice(0, 10)}; observed events: ${finding.latestNumerator}/${finding.latestDenominator}`,
            `Denominator: ${rule.denominator}`, `Next: ${rule.action}`,
            `Release: ${finding.releaseRef ?? 'not recorded'}; regression: ${finding.verificationRef ?? 'not recorded'}`,
            `Intervention recorded: ${timestamp(finding.interventionAt)}`,
            `Baseline [start,end): ${timestamp(finding.baselineStart)} / ${timestamp(finding.baselineEnd)}; events: ${finding.baselineNumerator ?? 'unknown'}/${finding.baselineDenominator ?? 'unknown'}; complete: ${finding.baselineComplete}`,
            `After [start,end): ${timestamp(finding.evaluationStart)} / ${timestamp(finding.evaluationEnd)}; events: ${finding.evaluationNumerator ?? 'unknown'}/${finding.evaluationDenominator ?? 'unknown'}`,
            'Criterion: two complete 7-day windows, >=50 events each, >=5 percentage-point change; descriptive only.',
            `Evaluation: ${finding.evaluationResult ?? 'not evaluated'}; evaluated at: ${timestamp(finding.evaluatedAt)}`, '',
        );
    }
    return lines.join('\n');
}
