export type DetectedItem = {
    entityKey: string;
    entityType: string;
    entityId: string;
    severity: 'warning' | 'critical';
    headline: string;
    detail?: string;
};

export type DetectionStatus = 'ok' | 'failed' | 'truncated';

export type DetectionResult = {
    detector: string;
    status: DetectionStatus;
    error?: string;
    requiredResources: string[];
    items: DetectedItem[];
};

export function emptyDetectionResult(
    detector: string,
    requiredResources: string[],
): DetectionResult {
    return { detector, status: 'ok', requiredResources, items: [] };
}
