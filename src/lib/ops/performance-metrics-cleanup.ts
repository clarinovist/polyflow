export const PERFORMANCE_METRIC_RETENTION_DAYS = 30;

export interface PerformanceMetricCleanupResult {
    tenantId: string;
    tenantName: string;
    online: boolean;
    error?: string;
    deletedCount: number;
}

export interface PerformanceMetricDb {
    performanceMetric: {
        deleteMany: (args: {
            where: { createdAt: { lt: Date } };
        }) => Promise<{ count: number }>;
    };
}

export interface PerformanceMetricMainDb extends PerformanceMetricDb {
    tenant: {
        findMany: (args: {
            where: { status: 'ACTIVE' };
            select: { id: true; name: true; dbUrl: true };
        }) => Promise<Array<{ id: string; name: string; dbUrl: string | null }>>;
    };
}

/** Shared app clients must never be released by this operation. */
export type CleanupClientLease<T> =
    | { db: T; ownership: 'shared' }
    | { db: T; ownership: 'owned'; disconnect: () => Promise<void> };

export interface PerformanceMetricCleanupDependencies {
    now: () => Date;
    acquireMain: () =>
        | CleanupClientLease<PerformanceMetricMainDb>
        | Promise<CleanupClientLease<PerformanceMetricMainDb>>;
    acquireTenant: (url: string) =>
        | CleanupClientLease<PerformanceMetricDb>
        | Promise<CleanupClientLease<PerformanceMetricDb>>;
}

export interface PerformanceMetricCleanupReport {
    results: PerformanceMetricCleanupResult[];
    /** Run-level failures (validation/registry), never raw database errors. */
    errors: string[];
    totalDeleted: number;
    hasFailure: boolean;
}

function fail(result: PerformanceMetricCleanupResult, message: string) {
    result.online = false;
    result.error = result.error ? `${result.error}; ${message}` : message;
}

function summarize(
    results: PerformanceMetricCleanupResult[],
    errors: string[] = [],
): PerformanceMetricCleanupReport {
    return {
        results,
        errors,
        totalDeleted: results.reduce(
            (total, result) => total + result.deletedCount, 0,
        ),
        hasFailure: errors.length > 0 || results.some((result) => !result.online),
    };
}

async function deleteOldRows(
    db: PerformanceMetricDb,
    cutoff: Date,
    result: PerformanceMetricCleanupResult,
) {
    try {
        const { count } = await db.performanceMetric.deleteMany({
            where: { createdAt: { lt: cutoff } },
        });
        result.deletedCount = count;
        result.online = true;
    } catch {
        fail(result, 'Performance metric deletion failed');
    }
}

async function releaseClient<T>(
    lease: CleanupClientLease<T>,
    result: PerformanceMetricCleanupResult,
) {
    if (lease.ownership === 'owned') {
        try {
            await lease.disconnect();
        } catch {
            // Keep successful delete counts even when resource cleanup fails.
            fail(result, 'Database disconnect failed');
        }
    }
}

function databaseUrlError(url: string | null): string | undefined {
    if (typeof url !== 'string' || !url.trim()) {
        return 'No database URL configured';
    }
    try {
        const parsed = new URL(url);
        if (
            /\s/.test(url) ||
            Array.from(url).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
            /%(?![\da-f]{2})/i.test(url) ||
            !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
            !parsed.hostname ||
            parsed.pathname.length <= 1 ||
            Boolean(parsed.hash) ||
            (parsed.port !== '' && (!/^\d+$/.test(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65535))
        ) {
            return 'Invalid database URL';
        }
    } catch {
        return 'Invalid database URL';
    }
}

/**
 * Alias-free retention policy. All clients, time and resource ownership are injected.
 * Main deletion precedes registry lookup; a main deletion failure stops the run.
 * Tenants run sequentially in registry order to bound active database resources.
 * No exception messages or connection URLs are returned, including factory failures.
 */
export async function runPerformanceMetricCleanup(
    dependencies: PerformanceMetricCleanupDependencies,
    retentionDays: number = PERFORMANCE_METRIC_RETENTION_DAYS,
): Promise<PerformanceMetricCleanupReport> {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
        return summarize([], ['Invalid retention period']);
    }
    const durationMs = retentionDays * 24 * 60 * 60 * 1000;
    // Accept fractional days but reject sub-millisecond/unsafe durations.
    if (durationMs < 1 || durationMs > Number.MAX_SAFE_INTEGER) {
        return summarize([], ['Invalid retention period']);
    }
    let nowMs: number;
    try {
        nowMs = dependencies.now().getTime();
    } catch {
        return summarize([], ['Invalid cleanup time']);
    }
    if (!Number.isFinite(nowMs)) {
        return summarize([], ['Invalid cleanup time']);
    }
    const cutoff = new Date(nowMs - durationMs);
    if (!Number.isFinite(cutoff.getTime()) || cutoff.getTime() >= nowMs) {
        return summarize([], ['Invalid retention period']);
    }

    const mainResult: PerformanceMetricCleanupResult = {
        tenantId: 'main',
        tenantName: 'polyflow (main)',
        online: false,
        deletedCount: 0,
    };
    let main: CleanupClientLease<PerformanceMetricMainDb>;
    try {
        main = await dependencies.acquireMain();
    } catch {
        fail(mainResult, 'Database client creation failed');
        return summarize([mainResult]);
    }

    const results = [mainResult];
    const errors: string[] = [];
    try {
        await deleteOldRows(main.db, cutoff, mainResult);
        if (mainResult.online) {
            let tenants: Awaited<ReturnType<PerformanceMetricMainDb['tenant']['findMany']>> = [];
            try {
                tenants = await main.db.tenant.findMany({
                    where: { status: 'ACTIVE' },
                    select: { id: true, name: true, dbUrl: true },
                });
            } catch {
                errors.push('Tenant registry lookup failed');
            }

            for (const tenant of tenants) {
                const result: PerformanceMetricCleanupResult = {
                    tenantId: tenant.id,
                    tenantName: tenant.name,
                    online: false,
                    deletedCount: 0,
                };
                results.push(result);
                const urlError = databaseUrlError(tenant.dbUrl);
                if (urlError) {
                    fail(result, urlError);
                    continue;
                }
                let lease: CleanupClientLease<PerformanceMetricDb>;
                try {
                    // Validation above prevents an empty URL falling back to the main DB.
                    lease = await dependencies.acquireTenant(tenant.dbUrl!);
                } catch {
                    fail(result, 'Database client creation failed');
                    continue;
                }
                try {
                    await deleteOldRows(lease.db, cutoff, result);
                } finally {
                    await releaseClient(lease, result);
                }
            }
        }
    } finally {
        await releaseClient(main, mainResult);
    }
    return summarize(results, errors);
}
