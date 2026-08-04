/**
 * Dynamic finance year options — native Date helper, NOT DB/config.
 *
 * Range shifts with the current year so dropdowns never expire.
 * Historic period years are unioned in at the call site when DB data is available.
 */

const DEFAULT_LOOKBACK_YEARS = 2;
const DEFAULT_FORWARD_YEARS = 2;

/**
 * Build an ascending year range centered on `baseYear`.
 * Defaults to the current calendar year when no explicit year is passed.
 */
export function buildYearOptions(
    baseYear = new Date().getFullYear(),
    lookbackYears = DEFAULT_LOOKBACK_YEARS,
    forwardYears = DEFAULT_FORWARD_YEARS,
): number[] {
    return Array.from(
        { length: lookbackYears + forwardYears + 1 },
        (_, i) => baseYear - lookbackYears + i,
    );
}
