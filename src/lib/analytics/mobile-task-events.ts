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
    outcome?: string;
    duration?: number;
}

/** Only these non-business dimensions may leave a mobile task surface. */
const ALLOWED_METADATA_KEYS = new Set([
    'portalId',
    'taskType',
    'outcome',
    'duration',
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
                eventType,
                source: 'MOBILE_WEB',
                metadata: sanitized,
            }),
        });
    } catch {
        // Telemetry failures are non-critical — silently ignore
    }
}

/**
 * Track task started.
 */
export async function trackTaskStarted(
    pathname: string,
    portalId: string,
    taskType: string,
): Promise<void> {
    try {
        await fetch('/api/analytics/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pathname,
                eventType: 'MOBILE_TASK_STARTED',
                source: 'MOBILE_WEB',
                metadata: { portalId, taskType },
            }),
        });
    } catch {
        // Telemetry must never interrupt navigation.
    }
}

/**
 * Track task completed.
 */
export function trackTaskCompleted(
    pathname: string,
    portalId: string,
    taskType: string,
    duration: number,
): Promise<void> {
    return trackMobileTaskEvent('MOBILE_TASK_COMPLETED', pathname, {
        portalId,
        taskType,
        duration,
        outcome: 'SUCCESS',
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
        outcome: errorCategory,
    });
}