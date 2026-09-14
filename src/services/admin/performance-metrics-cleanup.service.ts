import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import { ApplicationError } from '@/lib/errors/errors';
import {
    runPerformanceMetricCleanup,
    type PerformanceMetricCleanupResult,
} from '@/lib/ops/performance-metrics-cleanup';

export type { PerformanceMetricCleanupResult } from '@/lib/ops/performance-metrics-cleanup';

/**
 * App adapter: use cached clients, never disconnect them. Main is explicit rather
 * than the request-scoped Prisma proxy. The shared core sequences tenant deletes
 * (previously concurrent here) to bound active database work and preserve order.
 * Main/registry failures still reject, but expose only sanitized error messages.
 */
export async function cleanupOldPerformanceMetrics(
    retentionDays?: number,
): Promise<PerformanceMetricCleanupResult[]> {
    const report = await runPerformanceMetricCleanup(
        {
            now: () => new Date(),
            acquireMain: () => ({ db: getMainPrisma(), ownership: 'shared' }),
            acquireTenant: (url) => ({ db: getTenantDb(url), ownership: 'shared' }),
        },
        retentionDays,
    );

    if (report.errors.length > 0) {
        throw new ApplicationError(
            report.errors.join('; '), 'PERFORMANCE_METRIC_CLEANUP_FAILED',
        );
    }
    const mainResult = report.results[0];
    if (!mainResult.online) {
        throw new ApplicationError(
            mainResult.error!, 'PERFORMANCE_METRIC_CLEANUP_FAILED',
        );
    }
    return report.results;
}
