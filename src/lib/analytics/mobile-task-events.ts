/** Privacy-safe telemetry for mobile operational flows. */
export type MobileTaskEventType =
    | 'MOBILE_PAGE_VIEW'
    | 'MOBILE_TASK_STARTED'
    | 'MOBILE_TASK_COMPLETED'
    | 'MOBILE_TASK_FAILED'
    | 'MOBILE_TASK_RETRY'
    | 'MOBILE_SYNC_QUEUED'
    | 'MOBILE_SYNC_COMPLETED'
    | 'MOBILE_SYNC_FAILED';

export interface MobileTaskEventMetadata {
    portalId?: string;
    taskType?: string;
    outcome?: string;
    duration?: number;
}

const ALLOWED_METADATA_KEYS = new Set([
    'portalId',
    'taskType',
    'outcome',
    'duration',
]);
export function sanitizeMobileTaskMetadata(
    metadata: Record<string, unknown>,
): MobileTaskEventMetadata {
    const sanitized: MobileTaskEventMetadata = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (!ALLOWED_METADATA_KEYS.has(key) || value === undefined) continue;
        if (
            key === 'duration' &&
            typeof value === 'number' &&
            Number.isFinite(value) &&
            value >= 0
        )
            sanitized.duration = value;
        if (
            key !== 'duration' &&
            typeof value === 'string' &&
            value.length <= 80
        )
            (sanitized as Record<string, unknown>)[key] = value;
    }
    return sanitized;
}
export async function trackMobileTaskEvent(
    eventType: MobileTaskEventType,
    pathname: string,
    metadata: MobileTaskEventMetadata = {},
): Promise<void> {
    try {
        await fetch('/api/analytics/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pathname,
                eventType,
                source: 'MOBILE_WEB',
                metadata: sanitizeMobileTaskMetadata(
                    metadata as Record<string, unknown>,
                ),
            }),
        });
    } catch {
        /* telemetry never blocks work */
    }
}
export const trackMobilePageView = (pathname: string, portalId: string) =>
    trackMobileTaskEvent('MOBILE_PAGE_VIEW', pathname, {
        portalId,
        taskType: 'page-view',
    });
export const trackTaskStarted = (
    pathname: string,
    portalId: string,
    taskType: string,
) =>
    trackMobileTaskEvent('MOBILE_TASK_STARTED', pathname, {
        portalId,
        taskType,
    });
export const trackTaskCompleted = (
    pathname: string,
    portalId: string,
    taskType: string,
    duration: number,
) =>
    trackMobileTaskEvent('MOBILE_TASK_COMPLETED', pathname, {
        portalId,
        taskType,
        duration,
        outcome: 'SUCCESS',
    });
export const trackTaskFailed = (
    pathname: string,
    portalId: string,
    taskType: string,
    errorCategory: string,
) =>
    trackMobileTaskEvent('MOBILE_TASK_FAILED', pathname, {
        portalId,
        taskType,
        outcome: errorCategory,
    });
export const trackTaskRetry = (
    pathname: string,
    portalId: string,
    taskType: string,
) =>
    trackMobileTaskEvent('MOBILE_TASK_RETRY', pathname, {
        portalId,
        taskType,
        outcome: 'RETRY',
    });
