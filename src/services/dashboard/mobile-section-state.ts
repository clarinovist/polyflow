/**
 * Section-level read state shared by mobile dashboard composers.
 *
 * A failed, hidden, or not-configured section must never be rendered as a
 * false zero; only `AVAILABLE` may carry data, including a valid zero.
 * `HIDDEN` is reserved for a capability that intentionally denies the read and
 * skips its query/select server-side.
 */
export type MobileSectionStatus =
    | 'AVAILABLE'
    | 'UNAVAILABLE'
    | 'HIDDEN'
    | 'NOT_CONFIGURED';

export type MobileSection<T> =
    | { status: 'AVAILABLE'; data: T }
    | { status: 'UNAVAILABLE'; data: null }
    | { status: 'HIDDEN'; data: null }
    | { status: 'NOT_CONFIGURED'; data: null };

export function availableSection<T>(data: T): MobileSection<T> {
    return { status: 'AVAILABLE', data };
}

export function unavailableSection<T>(): MobileSection<T> {
    return { status: 'UNAVAILABLE', data: null };
}

export function hiddenSection<T>(): MobileSection<T> {
    return { status: 'HIDDEN', data: null };
}

export function notConfiguredSection<T>(): MobileSection<T> {
    return { status: 'NOT_CONFIGURED', data: null };
}
