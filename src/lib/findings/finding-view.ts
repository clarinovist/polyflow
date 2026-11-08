/**
 * Client-safe projection of a Finding row for the inbox. `listMyFindings`
 * returns rows through `serializeData`, so every date is an ISO string here.
 * Only the fields the inbox renders are kept (no requiredResources, no emails).
 */
export type FindingViewSeverity = 'WARNING' | 'CRITICAL';
type FindingViewStatus = 'UNCLAIMED' | 'CLAIMED' | 'SNOOZED';

export type FindingView = {
    id: string;
    fingerprint: string;
    detector: string;
    severity: FindingViewSeverity;
    status: FindingViewStatus;
    headline: string;
    detail: string | null;
    entityType: string | null;
    entityId: string | null;
    slaDueAt: string | null;
    snoozedUntil: string | null;
    firstSeenAt: string;
    claimedById: string | null;
    claimedByName: string | null;
};

/** Shape of a row as returned by `listMyFindings` after serialization. */
export type SerializedFindingRow = {
    id: string;
    fingerprint: string;
    detector: string;
    severity: string;
    status: string;
    headline: string;
    detail?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    slaDueAt?: string | null;
    snoozedUntil?: string | null;
    firstSeenAt: string;
    claimedById?: string | null;
    claimedBy?: { name?: string | null; email?: string | null } | null;
};

const OPEN_STATUSES: ReadonlySet<string> = new Set([
    'UNCLAIMED',
    'CLAIMED',
    'SNOOZED',
]);

function toSeverity(value: string): FindingViewSeverity {
    return value === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
}

function toFindingView(row: SerializedFindingRow): FindingView {
    return {
        id: row.id,
        fingerprint: row.fingerprint,
        detector: row.detector,
        severity: toSeverity(row.severity),
        status: row.status as FindingViewStatus,
        headline: row.headline,
        detail: row.detail ?? null,
        entityType: row.entityType ?? null,
        entityId: row.entityId ?? null,
        slaDueAt: row.slaDueAt ?? null,
        snoozedUntil: row.snoozedUntil ?? null,
        firstSeenAt: row.firstSeenAt,
        claimedById: row.claimedById ?? null,
        claimedByName: row.claimedBy?.name ?? null,
    };
}

/** Maps serialized rows to views, dropping anything that is not open. */
export function toFindingViews(
    rows: readonly SerializedFindingRow[],
): FindingView[] {
    return rows
        .filter((row) => OPEN_STATUSES.has(row.status))
        .map(toFindingView);
}
