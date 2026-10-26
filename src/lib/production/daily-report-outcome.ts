/** Per-entry body of a bulk `/api/production/daily-report` response. */
export interface DailyReportResponseBody {
    results?: { index: number }[];
    errors?: { index: number; error?: string }[];
}

export interface DailyReportOutcome {
    /** Form indexes that are saved and must not be sent again. */
    savedIndexes: number[];
    /** Server message per failed entry, keyed by the entry's request id. */
    errorsById: Record<string, string>;
}

const FALLBACK_ERROR = 'Gagal disimpan. Periksa isian entri ini.';

/** Maps the route's per-index results back to the entries that were sent. */
export function readDailyReportOutcome(
    sentIds: readonly string[],
    body: DailyReportResponseBody,
): DailyReportOutcome {
    const isSent = (index: number) => index >= 0 && index < sentIds.length;
    const savedIndexes = (body.results ?? [])
        .map((result) => result.index)
        .filter(isSent);
    const errorsById = Object.fromEntries(
        (body.errors ?? [])
            .filter((error) => isSent(error.index))
            .map((error) => [
                sentIds[error.index],
                error.error || FALLBACK_ERROR,
            ]),
    );
    return { savedIndexes, errorsById };
}
