import type { Finding, PrismaClient } from '@prisma/client';
import type {
    DetectedItem,
    DetectionResult,
} from '@/lib/telegram/digest/detection-types';

export type FindingSyncOutcome = {
    created: string[];
    reopened: string[];
    updated: string[];
    unsnoozed: string[];
    severityRaised: string[];
    autoResolved: string[];
    skippedDetectors: string[];
};

export type FindingSyncOptions = {
    /**
     * Observe mode: everything detected is pre-existing backlog, so it gets
     * no SLA (slaDueAt = null → never escalated). Baseline items keep no SLA
     * after the tenant moves to notify, unless they auto-resolve and recur.
     */
    baseline?: boolean;
};

const OPEN_STATUSES = ['UNCLAIMED', 'CLAIMED', 'SNOOZED'] as const;

const SLA_HOURS = {
    CRITICAL: 24,
    WARNING: 72,
} as const;

type FindingSeverity = 'WARNING' | 'CRITICAL';

type FindingEventInput = {
    action: string;
    fromStatus?: string;
    toStatus?: string;
    note?: string;
};

function toFindingSeverity(severity: 'warning' | 'critical'): FindingSeverity {
    return severity === 'critical' ? 'CRITICAL' : 'WARNING';
}

function computeSlaDueAt(
    severity: FindingSeverity,
    from: Date,
    baseline: boolean,
): Date | null {
    if (baseline) return null;
    const due = new Date(from);
    due.setHours(due.getHours() + SLA_HOURS[severity]);
    return due;
}

function emptyOutcome(): FindingSyncOutcome {
    return {
        created: [],
        reopened: [],
        updated: [],
        unsnoozed: [],
        severityRaised: [],
        autoResolved: [],
        skippedDetectors: [],
    };
}

type SyncContext = {
    tenantDb: PrismaClient;
    result: DetectionResult;
    now: Date;
    baseline: boolean;
    outcome: FindingSyncOutcome;
};

async function createFinding(
    ctx: SyncContext,
    item: DetectedItem,
    severity: FindingSeverity,
): Promise<void> {
    const created = await ctx.tenantDb.finding.create({
        data: {
            fingerprint: item.entityKey,
            detector: ctx.result.detector,
            severity,
            status: 'UNCLAIMED',
            headline: item.headline,
            detail: item.detail,
            requiredResources: ctx.result.requiredResources,
            entityType: item.entityType,
            entityId: item.entityId,
            slaDueAt: computeSlaDueAt(severity, ctx.now, ctx.baseline),
            events: {
                create: {
                    action: ctx.baseline ? 'DETECTED_BASELINE' : 'DETECTED',
                    toStatus: 'UNCLAIMED',
                },
            },
        },
    });
    ctx.outcome.created.push(created.id);
}

async function reopenFinding(
    ctx: SyncContext,
    existing: Finding,
    item: DetectedItem,
    severity: FindingSeverity,
): Promise<void> {
    const reopened = await ctx.tenantDb.finding.update({
        where: { id: existing.id },
        data: {
            status: 'UNCLAIMED',
            severity,
            headline: item.headline,
            detail: item.detail,
            requiredResources: ctx.result.requiredResources,
            lastSeenAt: ctx.now,
            occurrences: { increment: 1 },
            claimedById: null,
            claimedAt: null,
            resolvedById: null,
            resolvedAt: null,
            resolutionNote: null,
            autoResolved: false,
            slaDueAt: computeSlaDueAt(severity, ctx.now, ctx.baseline),
            escalatedAt: null,
            events: {
                create: {
                    action: 'REOPENED',
                    fromStatus: 'RESOLVED',
                    toStatus: 'UNCLAIMED',
                },
            },
        },
    });
    ctx.outcome.reopened.push(reopened.id);
}

/**
 * Still open (UNCLAIMED/CLAIMED/SNOOZED): refresh presentation fields only.
 * Severity is presentation (it can rise as an invoice ages) but never moves
 * ownership or the SLA — a re-detection is not a new lifecycle event. The one
 * exception is SNOOZED past its wake-up time: this daily sync is the only
 * place that re-examines a snoozed finding, so it doubles as the wake timer.
 */
async function refreshFinding(
    ctx: SyncContext,
    existing: Finding,
    item: DetectedItem,
    severity: FindingSeverity,
): Promise<void> {
    const shouldWake =
        existing.status === 'SNOOZED' &&
        existing.snoozedUntil != null &&
        existing.snoozedUntil <= ctx.now;
    const severityRaised =
        existing.severity === 'WARNING' && severity === 'CRITICAL';

    const events: FindingEventInput[] = [];
    if (shouldWake) {
        events.push({
            action: 'UNSNOOZED',
            fromStatus: 'SNOOZED',
            toStatus: 'UNCLAIMED',
        });
    }
    if (severityRaised) {
        events.push({ action: 'SEVERITY_RAISED', note: 'WARNING → CRITICAL' });
    }

    await ctx.tenantDb.finding.update({
        where: { id: existing.id },
        data: {
            severity,
            headline: item.headline,
            detail: item.detail,
            requiredResources: ctx.result.requiredResources,
            lastSeenAt: ctx.now,
            ...(shouldWake && { status: 'UNCLAIMED', snoozedUntil: null }),
            ...(events.length > 0 && { events: { create: events } }),
        },
    });

    if (severityRaised) ctx.outcome.severityRaised.push(existing.id);
    if (shouldWake) {
        ctx.outcome.unsnoozed.push(existing.id);
    } else {
        ctx.outcome.updated.push(existing.id);
    }
}

async function autoResolveMissing(
    ctx: SyncContext,
    seenFingerprints: Set<string>,
): Promise<void> {
    const openForDetector = await ctx.tenantDb.finding.findMany({
        where: {
            detector: ctx.result.detector,
            status: { in: [...OPEN_STATUSES] },
        },
        select: { id: true, fingerprint: true, status: true },
    });

    for (const open of openForDetector) {
        if (seenFingerprints.has(open.fingerprint)) continue;

        await ctx.tenantDb.finding.update({
            where: { id: open.id },
            data: {
                status: 'RESOLVED',
                autoResolved: true,
                resolvedAt: ctx.now,
                events: {
                    create: {
                        action: 'AUTO_RESOLVED',
                        fromStatus: open.status,
                        toStatus: 'RESOLVED',
                    },
                },
            },
        });
        ctx.outcome.autoResolved.push(open.id);
    }
}

/**
 * Syncs one detection run into the Finding table: creates new findings,
 * reopens previously-resolved ones that recurred, refreshes still-open ones,
 * and auto-resolves findings that stopped being detected.
 *
 * `tenantDb` must be the tenant-scoped client resolved directly by the
 * caller (e.g. getTenantDb(tenant.dbUrl)) — never the ambient `prisma` proxy
 * from `@/lib/core/prisma`, since the cron path this feeds has no
 * tenantIdContext.
 */
export async function syncFindings(
    tenantDb: PrismaClient,
    results: DetectionResult[],
    options: FindingSyncOptions = {},
): Promise<FindingSyncOutcome> {
    const outcome = emptyOutcome();
    const now = new Date();
    const baseline = options.baseline ?? false;

    for (const result of results) {
        const ctx: SyncContext = { tenantDb, result, now, baseline, outcome };
        const seenFingerprints = new Set<string>();

        for (const item of result.items) {
            // entityKey is already detector-prefixed by the detector itself
            // (e.g. `critical_stock:v-1`) — it IS the fingerprint.
            seenFingerprints.add(item.entityKey);
            const severity = toFindingSeverity(item.severity);
            const existing = await tenantDb.finding.findUnique({
                where: { fingerprint: item.entityKey },
            });

            if (!existing) {
                await createFinding(ctx, item, severity);
            } else if (existing.status === 'RESOLVED') {
                await reopenFinding(ctx, existing, item, severity);
            } else {
                await refreshFinding(ctx, existing, item, severity);
            }
        }

        if (result.status !== 'ok') {
            // Guard: a failed, truncated, or skipped detector run must never
            // be treated as "nothing found here" — auto-resolving on top of
            // an incomplete scan would silently close real open findings.
            outcome.skippedDetectors.push(result.detector);
            continue;
        }

        await autoResolveMissing(ctx, seenFingerprints);
    }

    return outcome;
}
