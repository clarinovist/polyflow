export const VISIT_QUEUE_VERSION = 1;
export const VISIT_QUEUE_PREFIX = 'polyflow:visit-queue:v1';

export interface VisitQueuePartition {
    tenantId: string;
    userId: string;
}
export interface QueuedVisitLog {
    id: string;
    customerId: string;
    customerName: string;
    checkInTime: string;
    checkOutTime: string;
    durationSeconds: number;
    latitude: number;
    longitude: number;
    distance: number;
    notes: string;
    photoUrl?: string | null;
    synced?: boolean;
    retryCount?: number;
    isOutsideRoute?: boolean;
    extraReason?: string | null;
    clientVisitId?: string;
    routePlanItemId?: string | null;
}
export function visitQueueKey(partition: VisitQueuePartition) {
    if (!partition.tenantId || !partition.userId)
        throw new Error('Visit queue partition is required');
    return (
        VISIT_QUEUE_PREFIX +
        ':' +
        encodeURIComponent(partition.tenantId) +
        ':' +
        encodeURIComponent(partition.userId)
    );
}

export function activeVisitKey(partition: VisitQueuePartition) {
    return visitQueueKey(partition) + ':active';
}
function parse(value: string | null): QueuedVisitLog[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}
export function readVisitQueue(
    storage: Pick<Storage, 'getItem'>,
    partition: VisitQueuePartition,
) {
    return parse(storage.getItem(visitQueueKey(partition)));
}
export function writeVisitQueue(
    storage: Pick<Storage, 'setItem'>,
    partition: VisitQueuePartition,
    logs: QueuedVisitLog[],
) {
    storage.setItem(visitQueueKey(partition), JSON.stringify(logs));
}
export function enqueueVisit(
    storage: Pick<Storage, 'getItem' | 'setItem'>,
    partition: VisitQueuePartition,
    log: QueuedVisitLog,
) {
    const key = log.clientVisitId || log.id;
    const logs = readVisitQueue(storage, partition);
    const index = logs.findIndex(
        (row) => (row.clientVisitId || row.id) === key,
    );
    if (index >= 0) logs[index] = log;
    else logs.unshift(log);
    writeVisitQueue(storage, partition, logs);
    return logs;
}
export function discardFailedVisits(
    storage: Pick<Storage, 'getItem' | 'setItem'>,
    partition: VisitQueuePartition,
    maxRetries: number,
) {
    const kept = readVisitQueue(storage, partition).filter(
        (log) => log.synced !== false || (log.retryCount ?? 0) < maxRetries,
    );
    writeVisitQueue(storage, partition, kept);
    return kept;
}
