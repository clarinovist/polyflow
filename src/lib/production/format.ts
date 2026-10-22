/**
 * Number formatting for the production portal (id-ID).
 *
 * One place for the portal's number rules: kg with two decimals, karung/pcs
 * without decimals, percent with one decimal, and a dash for missing data so
 * a recorded zero ("0,00 kg") never looks like "no data" ("—").
 * `formatQuantity` in utils stays the global four-decimal formatter.
 */

export const EMPTY_VALUE = '—';

const LOCALE = 'id-ID';
const KG_DIGITS = 2;
const PERCENT_DIGITS = 1;

type Maybe = number | null | undefined;

function isMissing(value: Maybe): value is null | undefined {
    return value === null || value === undefined || !Number.isFinite(value);
}

export function formatDecimal(value: Maybe, digits: number): string {
    if (isMissing(value)) return EMPTY_VALUE;
    return new Intl.NumberFormat(LOCALE, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value);
}

/** Quantity whose unit follows its process: whole numbers stay whole, up to two decimals. */
export function formatAmount(value: Maybe): string {
    if (isMissing(value)) return EMPTY_VALUE;
    return new Intl.NumberFormat(LOCALE, {
        minimumFractionDigits: 0,
        maximumFractionDigits: KG_DIGITS,
    }).format(value);
}

export function formatCount(value: Maybe): string {
    return formatDecimal(value, 0);
}

export function formatKg(value: Maybe): string {
    if (isMissing(value)) return EMPTY_VALUE;
    return `${formatDecimal(value, KG_DIGITS)} kg`;
}

export function formatPercent(value: Maybe): string {
    if (isMissing(value)) return EMPTY_VALUE;
    return `${formatDecimal(value, PERCENT_DIGITS)}%`;
}

/** Alias for a share that may be uncomputable (no output and no affal). */
export function formatAffalPercent(value: number | null): string {
    return formatPercent(value);
}

const WHOLE_UNITS = new Set(['karung', 'pcs']);

/** Quantity with its unit: kg 2 decimals, karung/pcs whole, others 2 decimals. */
export function formatUnitQuantity(value: Maybe, unit: string): string {
    if (isMissing(value)) return EMPTY_VALUE;
    const normalized = unit.trim().toLowerCase();
    if (WHOLE_UNITS.has(normalized)) {
        return `${formatCount(value)} ${normalized}`;
    }
    if (normalized === 'kg') return formatKg(value);
    return `${formatDecimal(value, KG_DIGITS)} ${unit.trim()}`;
}
