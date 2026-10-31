export type DetectedItem = {
    entityKey: string;
    entityType: string;
    entityId: string;
    severity: 'warning' | 'critical';
    headline: string;
    detail?: string;
};

/**
 * - ok:        the detector scanned everything; absent items are resolved.
 * - truncated: hit the fetch cap; absence proves nothing.
 * - failed:    the detector errored; absence proves nothing.
 * - skipped:   the detector did not run (module not entitled, or the
 *              entitlement check itself failed); absence proves nothing.
 */
type DetectionStatus = 'ok' | 'failed' | 'truncated' | 'skipped';

export type DetectionResult = {
    detector: string;
    status: DetectionStatus;
    error?: string;
    requiredResources: string[];
    items: DetectedItem[];
};

export function skippedDetectionResult(
    detector: string,
    requiredResources: string[],
    reason?: string,
): DetectionResult {
    return {
        detector,
        status: 'skipped',
        ...(reason ? { error: reason } : {}),
        requiredResources,
        items: [],
    };
}
