import {
    PERFORMANCE_P95_WARN_MS,
    PERFORMANCE_P95_CRITICAL_MS,
} from '@/lib/constants/performance';

export type PerformanceStatusLevel = 'ok' | 'warn' | 'critical' | 'unknown';

export function getPerformanceStatusLevel(
    p95Ms: number | null,
): PerformanceStatusLevel {
    if (p95Ms == null) return 'unknown';
    if (p95Ms >= PERFORMANCE_P95_CRITICAL_MS) return 'critical';
    if (p95Ms >= PERFORMANCE_P95_WARN_MS) return 'warn';
    return 'ok';
}
