import type { PrismaClient } from '@prisma/client';
import type { DetectionResult } from '@/lib/telegram/digest/detection-types';

export type FindingSyncOutcome = {
    created: string[];
    reopened: string[];
    updated: string[];
    autoResolved: string[];
    skippedDetectors: string[];
};

const OPEN_STATUSES = ['UNCLAIMED', 'CLAIMED', 'SNOOZED'] as const;

const SLA_HOURS = {
    CRITICAL: 24,
    WARNING: 72,
} as const;

type FindingSeverity = 'WARNING' | 'CRITICAL';

function toFindingSeverity(severity: 'warning' | 'critical'): FindingSeverity {
    return severity === 'critical' ? 'CRITICAL' : 'WARNING';
}

function computeSlaDueAt(severity: FindingSeverity, from: Date): Date {
    const due = new Date(from);
    due.setHours(due.getHours() + SLA_HOURS[severity]);
    return due;
}

function emptyOutcome(): FindingSyncOutcome {
    return {
        created: [],
        reopened: [],
        updated: [],
        autoResolved: [],
        skippedDetectors: [],
    };
}

/**
 * Syncs one detection run into the Finding table: creates new findings,
 * reopens previously-resolved ones that recurred, refreshes still-open ones,
 * and auto-resolves findings that stopped being detected.
 *
 * `tenantDb` must be the tenant-scoped client resolved directly by the
 * caller (e.g. getTenantDb(tenant.dbUrl)) — never the ambient `prisma` proxy
 * from `@/lib/core/prisma`, since the cron/digest path this feeds has no
 * tenantIdContext (see docs/plan/2026-08-14-ai-manager-l2-finding-lifecycle.md §2.6).
 */
export async function syncFindings(
    tenantDb: PrismaClient,
    results: DetectionResult[],
): Promise<FindingSyncOutcome> {
    const outcome = emptyOutcome();
    const now = new Date();

    for (const result of results) {
        const seenFingerprints = new Set<string>();

        for (const item of result.items) {
            // entityKey is already detector-prefixed by the detector itself
            // (e.g. `critical_stock:p-1`) — it IS the fingerprint, not an
            // input to build one from.
            const fingerprint = item.entityKey;
            seenFingerprints.add(fingerprint);

            const severity = toFindingSeverity(item.severity);
            const existing = await tenantDb.finding.findUnique({
                where: { fingerprint },
            });

            if (!existing) {
                const created = await tenantDb.finding.create({
                    data: {
                        fingerprint,
                        detector: result.detector,
                        severity,
                        status: 'UNCLAIMED',
                        headline: item.headline,
                        detail: item.detail,
                        requiredResources: result.requiredResources,
                        entityType: item.entityType,
                        entityId: item.entityId,
                        slaDueAt: computeSlaDueAt(severity, now),
                        events: {
                            create: {
                                action: 'DETECTED',
                                toStatus: 'UNCLAIMED',
                            },
                        },
                    },
                });
                outcome.created.push(created.id);
                continue;
            }

            if (existing.status === 'RESOLVED') {
                const reopened = await tenantDb.finding.update({
                    where: { id: existing.id },
                    data: {
                        status: 'UNCLAIMED',
                        headline: item.headline,
                        detail: item.detail,
                        lastSeenAt: now,
                        occurrences: { increment: 1 },
                        claimedById: null,
                        claimedAt: null,
                        resolvedById: null,
                        resolvedAt: null,
                        resolutionNote: null,
                        autoResolved: false,
                        slaDueAt: computeSlaDueAt(severity, now),
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
                outcome.reopened.push(reopened.id);
                continue;
            }

            // Still open (UNCLAIMED/CLAIMED/SNOOZED): refresh presentation fields
            // only. Never touch status, ownership, or SLA — a re-detection is not
            // a new event in the finding's lifecycle.
            await tenantDb.finding.update({
                where: { id: existing.id },
                data: {
                    headline: item.headline,
                    detail: item.detail,
                    lastSeenAt: now,
                },
            });
            outcome.updated.push(existing.id);
        }

        if (result.status !== 'ok') {
            // Guard: a failed or truncated detector run must never be treated as
            // "nothing found here" — auto-resolving on top of an incomplete or
            // errored scan would silently close real open findings.
            outcome.skippedDetectors.push(result.detector);
            continue;
        }

        const openForDetector = await tenantDb.finding.findMany({
            where: {
                detector: result.detector,
                status: { in: [...OPEN_STATUSES] },
            },
            select: { id: true, fingerprint: true, status: true },
        });

        for (const open of openForDetector) {
            if (seenFingerprints.has(open.fingerprint)) continue;

            await tenantDb.finding.update({
                where: { id: open.id },
                data: {
                    status: 'RESOLVED',
                    autoResolved: true,
                    resolvedAt: now,
                    events: {
                        create: {
                            action: 'AUTO_RESOLVED',
                            fromStatus: open.status,
                            toStatus: 'RESOLVED',
                        },
                    },
                },
            });
            outcome.autoResolved.push(open.id);
        }
    }

    return outcome;
}
