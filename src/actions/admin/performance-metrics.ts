'use server';

import { prisma, getTenantDb } from '@/lib/core/prisma';
import { auth } from '@/auth';
import { AuthorizationError } from '@/lib/errors/errors';

export interface PerformanceMetricSummary {
    tenantId: string;
    tenantName: string;
    online: boolean;
    error?: string;
    count: number;
    avgMs: number | null;
    p95Ms: number | null;
    maxMs: number | null;
    lastAt: string | null;
}

const DEFAULT_WINDOW_HOURS = 24;
const MAX_SAMPLES_PER_TENANT = 500;

/**
 * Fan out to every tenant's own database and summarize PerformanceMetric
 * samples for a given route (see production-orders.ts for the writer side).
 * A tenant whose DB is unreachable is returned with online=false + an error
 * message instead of failing the whole page (Promise.allSettled), matching
 * the pattern in tenant-observability.ts.
 */
export async function getPerformanceMetricsSummary(
    route: string,
    windowHours: number = DEFAULT_WINDOW_HOURS,
): Promise<PerformanceMetricSummary[]> {
    const session = await auth();
    if (!session?.user || !session.user.isSuperAdmin) {
        throw new AuthorizationError('Super Admin access required.');
    }

    const tenants = await prisma.tenant.findMany({
        select: { id: true, name: true, dbUrl: true },
    });

    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const results = await Promise.allSettled(
        tenants.map((t) =>
            collectOneTenantSummary(t.id, t.name, t.dbUrl, route, since),
        ),
    );

    return results.map((r, i) => {
        const tenant = tenants[i];
        if (r.status === 'fulfilled') return r.value;
        return {
            tenantId: tenant.id,
            tenantName: tenant.name,
            online: false,
            error:
                r.reason instanceof Error ? r.reason.message : 'Unknown error',
            count: 0,
            avgMs: null,
            p95Ms: null,
            maxMs: null,
            lastAt: null,
        };
    });
}

async function collectOneTenantSummary(
    tenantId: string,
    tenantName: string,
    dbUrl: string,
    route: string,
    since: Date,
): Promise<PerformanceMetricSummary> {
    if (!dbUrl) {
        return {
            tenantId,
            tenantName,
            online: false,
            error: 'No database URL configured',
            count: 0,
            avgMs: null,
            p95Ms: null,
            maxMs: null,
            lastAt: null,
        };
    }

    const db = getTenantDb(dbUrl);
    const samples = await db.performanceMetric.findMany({
        where: { route, createdAt: { gte: since } },
        select: { durationMs: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_SAMPLES_PER_TENANT,
    });

    return {
        tenantId,
        tenantName,
        online: true,
        count: samples.length,
        ...summarizeDurations(samples.map((s) => s.durationMs)),
        lastAt: samples[0]?.createdAt.toISOString() ?? null,
    };
}

function summarizeDurations(durations: number[]): {
    avgMs: number | null;
    p95Ms: number | null;
    maxMs: number | null;
} {
    if (durations.length === 0) {
        return { avgMs: null, p95Ms: null, maxMs: null };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, d) => acc + d, 0);
    const p95Index = Math.min(
        sorted.length - 1,
        Math.ceil(0.95 * sorted.length) - 1,
    );

    return {
        avgMs: Math.round(sum / sorted.length),
        p95Ms: sorted[p95Index],
        maxMs: sorted[sorted.length - 1],
    };
}
