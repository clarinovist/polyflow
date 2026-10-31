import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import { runEntitledDetectors } from '@/lib/telegram/digest/run-detectors';
import type { DetectionResult } from '@/lib/telegram/digest/detection-types';
import { syncFindings, type FindingSyncOutcome } from './finding-sync';
import { getFindingsMode, type FindingsMode } from './findings-mode';

type ModeEnv = Record<string, string | undefined>;

export type DetectorRunSummary = {
    detector: string;
    status: DetectionResult['status'];
    items: number;
    error?: string;
};

export type FindingSyncCounts = {
    created: number;
    reopened: number;
    updated: number;
    unsnoozed: number;
    severityRaised: number;
    autoResolved: number;
    skippedDetectors: string[];
};

export type TenantFindingsSummary = {
    tenant: string;
    mode: FindingsMode;
    detectors?: DetectorRunSummary[];
    sync?: FindingSyncCounts;
    error?: string;
};

export type FindingsCycleResult = {
    tenants: TenantFindingsSummary[];
};

type TenantRow = { id: string; subdomain: string; dbUrl: string };

function summarizeDetectors(results: DetectionResult[]): DetectorRunSummary[] {
    return results.map((r) => ({
        detector: r.detector,
        status: r.status,
        items: r.items.length,
        ...(r.error ? { error: r.error } : {}),
    }));
}

function countOutcome(outcome: FindingSyncOutcome): FindingSyncCounts {
    return {
        created: outcome.created.length,
        reopened: outcome.reopened.length,
        updated: outcome.updated.length,
        unsnoozed: outcome.unsnoozed.length,
        severityRaised: outcome.severityRaised.length,
        autoResolved: outcome.autoResolved.length,
        skippedDetectors: outcome.skippedDetectors,
    };
}

/**
 * observe → sync as baseline (no SLA). notify → sync with SLA. Delivery
 * side-effects for notify (inbox, digest, escalation) are deliberately not
 * wired here yet: they land in later phases of
 * docs/plan/2026-10-31-finding-digest.md, so no mode in this phase sends
 * anything to anyone.
 */
async function runForTenant(
    tenant: TenantRow,
    mode: FindingsMode,
): Promise<TenantFindingsSummary> {
    if (mode === 'off') return { tenant: tenant.subdomain, mode };

    try {
        const tenantDb = getTenantDb(tenant.dbUrl);
        const results = await runEntitledDetectors(tenant.id, tenantDb);
        const outcome = await syncFindings(tenantDb, results, {
            baseline: mode === 'observe',
        });
        return {
            tenant: tenant.subdomain,
            mode,
            detectors: summarizeDetectors(results),
            sync: countOutcome(outcome),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
            `[FINDINGS] cycle failed for tenant ${tenant.subdomain}:`,
            error,
        );
        return { tenant: tenant.subdomain, mode, error: message };
    }
}

/**
 * Daily Finding lifecycle pass over every ACTIVE tenant, each against its own
 * explicit tenant client (never the ambient prisma proxy). One tenant failing
 * never stops the others.
 */
export async function runFindingsCycle(
    env: ModeEnv = process.env,
): Promise<FindingsCycleResult> {
    const tenants: TenantRow[] = await getMainPrisma().tenant.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, subdomain: true, dbUrl: true },
        orderBy: { subdomain: 'asc' },
    });

    const summaries: TenantFindingsSummary[] = [];
    for (const tenant of tenants) {
        summaries.push(
            await runForTenant(tenant, getFindingsMode(tenant.subdomain, env)),
        );
    }
    return { tenants: summaries };
}
