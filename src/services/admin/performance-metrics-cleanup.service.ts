import { prisma, getTenantDb } from '@/lib/core/prisma';

export const PERFORMANCE_METRIC_RETENTION_DAYS = 30;

export interface PerformanceMetricCleanupResult {
    tenantId: string;
    tenantName: string;
    online: boolean;
    error?: string;
    deletedCount: number;
}

/**
 * Delete PerformanceMetric rows older than retentionDays from the main DB and
 * every active tenant DB. No `'use server'` / auth() here on purpose — this
 * runs from a plain Node script (scripts/cleanup-performance-metrics.ts),
 * outside any Next.js request/session context.
 */
export async function cleanupOldPerformanceMetrics(
    retentionDays: number = PERFORMANCE_METRIC_RETENTION_DAYS,
): Promise<PerformanceMetricCleanupResult[]> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const mainResult = await cleanupOne(
        'main',
        'polyflow (main)',
        cutoff,
        prisma,
    );

    const tenants = await prisma.tenant.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, dbUrl: true },
    });

    const tenantResults = await Promise.allSettled(
        tenants.map((t) => cleanupOneTenant(t.id, t.name, t.dbUrl, cutoff)),
    );

    const results: PerformanceMetricCleanupResult[] = [mainResult];
    tenantResults.forEach((r, i) => {
        const tenant = tenants[i];
        if (r.status === 'fulfilled') {
            results.push(r.value);
        } else {
            results.push({
                tenantId: tenant.id,
                tenantName: tenant.name,
                online: false,
                error:
                    r.reason instanceof Error
                        ? r.reason.message
                        : 'Unknown error',
                deletedCount: 0,
            });
        }
    });

    return results;
}

async function cleanupOneTenant(
    tenantId: string,
    tenantName: string,
    dbUrl: string,
    cutoff: Date,
): Promise<PerformanceMetricCleanupResult> {
    if (!dbUrl) {
        return {
            tenantId,
            tenantName,
            online: false,
            error: 'No database URL configured',
            deletedCount: 0,
        };
    }

    return cleanupOne(tenantId, tenantName, cutoff, getTenantDb(dbUrl));
}

interface PerformanceMetricDb {
    performanceMetric: {
        deleteMany: (args: {
            where: { createdAt: { lt: Date } };
        }) => Promise<{ count: number }>;
    };
}

async function cleanupOne(
    tenantId: string,
    tenantName: string,
    cutoff: Date,
    db: PerformanceMetricDb,
): Promise<PerformanceMetricCleanupResult> {
    const { count } = await db.performanceMetric.deleteMany({
        where: { createdAt: { lt: cutoff } },
    });

    return {
        tenantId,
        tenantName,
        online: true,
        deletedCount: count,
    };
}
