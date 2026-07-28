/**
 * Mobile task telemetry — tracks task started/completed/failed events
 * and sync outcomes for mobile operational portals.
 *
 * Extends existing UsageEvent without schema changes.
 * No sensitive data is sent (no amounts, notes, emails, GPS, photos).
 *
 * @see docs/plan/2026-07-28-mobile-scope-strategy.md §6.7
 */

export type MobileTaskEventType =
    | 'MOBILE_TASK_STARTED'
    | 'MOBILE_TASK_COMPLETED'
    | 'MOBILE_TASK_FAILED'
    | 'MOBILE_SYNC_QUEUED'
    | 'MOBILE_SYNC_COMPLETED'
    | 'MOBILE_SYNC_FAILED';

export interface MobileTaskEventMetadata {
    portalId?: string;
    taskType?: string;
    durationMs?: number;
    online?: boolean;
    retryCount?: number;
    resultCategory?: string;
}

/**
 * Sanitize metadata to ensure no sensitive data is sent.
 * Only allows known safe fields.
 */
const ALLOWED_METADATA_KEYS = new Set([
    'portalId',
    'taskType',
    'durationMs',
    'online',
    'retryCount',
    'resultCategory',
]);

function sanitizeMetadata(
    metadata: MobileTaskEventMetadata,
): MobileTaskEventMetadata {
    const sanitized: MobileTaskEventMetadata = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (ALLOWED_METADATA_KEYS.has(key) && value !== undefined) {
            sanitized[key as keyof MobileTaskEventMetadata] = value;
        }
    }
    return sanitized;
}

/**
 * Track a mobile task event.
 * Sends to the existing analytics endpoint with source=MOBILE_WEB.
 */
export async function trackMobileTaskEvent(
    eventType: MobileTaskEventType,
    pathname: string,
    metadata: MobileTaskEventMetadata = {},
): Promise<void> {
    try {
        const sanitized = sanitizeMetadata(metadata);
        await fetch('/api/analytics/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pathname,
                metadata: {
                    ...sanitized,
                    eventType,
                    source: 'MOBILE_WEB',
                },
            }),
        });
    } catch {
        // Telemetry failures are non-critical — silently ignore
    }
}

/**
 * Track task started.
 */
export function trackTaskStarted(
    pathname: string,
    portalId: string,
    taskType: string,
): Promise<void> {
    return trackMobileTaskEvent('MOBILE_TASK_STARTED', pathname, {
        portalId,
        taskType,
    });
}

/**
 * Track task completed.
 */
export function trackTaskCompleted(
    pathname: string,
    portalId: string,
    taskType: string,
    durationMs: number,
): Promise<void> {
    return trackMobileTaskEvent('MOBILE_TASK_COMPLETED', pathname, {
        portalId,
        taskType,
        durationMs,
        resultCategory: 'SUCCESS',
    });
}

/**
 * Track task failed.
 */
export function trackTaskFailed(
    pathname: string,
    portalId: string,
    taskType: string,
    errorCategory: string,
): Promise<void> {
    return trackMobileTaskEvent('MOBILE_TASK_FAILED', pathname, {
        portalId,
        taskType,
        resultCategory: errorCategory,
    });
}

/**
 * Track sync queued (command added to offline queue).
 */
export function trackSyncQueued(
    pathname: string,
    portalId: string,
    taskType: string,
): Promise<void> {
    return trackMobileTaskEvent('MOBILE_SYNC_QUEUED', pathname, {
        portalId,
        taskType,
    });
}

/**
 * Track sync completed (command successfully synced).
 */
export function trackSyncCompleted(
    pathname: string,
    portalId: string,
    taskType: string,
): Promise<void> {
    return trackMobileTaskEvent('MOBILE_SYNC_COMPLETED', pathname, {
        portalId,
        taskType,
    });
}

/**
 * Track sync failed (command sync failed permanently).
 */
export function trackSyncFailed(
    pathname: string,
    portalId: string,
    taskType: string,
    retryCount: number,
): Promise<void> {
    return trackMobileTaskEvent('MOBILE_SYNC_FAILED', pathname, {
        portalId,
        taskType,
        retryCount,
    });
}
