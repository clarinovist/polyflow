/**
 * Stale open attendance session helpers.
 *
 * A session is "stale" when it has a clock-in, no clock-out, and has been open
 * for more than STALE_SESSION_HOURS. The threshold matches the kiosk clock-out
 * guard, so a legitimate overnight session (e.g. in 22:00, now 02:00) is never
 * considered stale.
 */

export const STALE_SESSION_HOURS = 20;

const MS_PER_HOUR = 60 * 60 * 1000;
const STALE_SESSION_MS = STALE_SESSION_HOURS * MS_PER_HOUR;

export interface OpenSessionCandidate {
    clockInAt: Date | null;
    clockOutAt: Date | null;
}

/** Oldest clock-in that is still considered a live session (query: clockInAt < cutoff => stale). */
export function staleSessionCutoff(now: Date): Date {
    return new Date(now.getTime() - STALE_SESSION_MS);
}

/** True when the record is still open and was clocked in more than 20h before `now`. */
export function isStaleOpenSession(
    record: OpenSessionCandidate,
    now: Date,
): boolean {
    if (!record.clockInAt || record.clockOutAt) return false;
    return now.getTime() - record.clockInAt.getTime() > STALE_SESSION_MS;
}
