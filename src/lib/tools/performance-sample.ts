import { prisma } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';

/**
 * Record one PerformanceMetric sample, fire-and-forget.
 *
 * Recording must never add latency to the response and must never fail the
 * request: the promise is deliberately not awaited and rejections are swallowed
 * into the logger. Mirrors the inline pattern already used by the list-route
 * writers (sales/purchase/delivery orders, sales invoices).
 */
export function recordPerformanceSample(
    route: string,
    startedAt: number,
    module: string,
): void {
    const durationMs = Math.round(performance.now() - startedAt);

    prisma.performanceMetric
        .create({ data: { route, durationMs } })
        .catch((error) =>
            logger.error('Failed to record performance metric', {
                module,
                route,
                error,
            }),
        );
}
