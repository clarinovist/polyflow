const PLAIN_DIGITS = /^\d+$/;
const THOUSANDS_GROUPS = /^\d{1,3}(\.\d{3})+$/;
/** "14.500" reads as thousands, but "0.920" is a decimal. */
const LEADING_THOUSANDS = /^[1-9]\d{0,2}(\.\d{3})+$/;

/** Money fields accept dot-grouping ("14.500"); quantities never do ("1.250" is 1,25). */
export type NumberInputKind = 'money' | 'quantity';

/**
 * Reads a typed number the way Indonesian users write it: a comma is the
 * decimal separator and dots group thousands ("1.234,5"). Without a comma, a
 * lone dot is a decimal point, except in money mode where it may only form
 * 3-digit groups ("14.500" = 14500). Quantity mode never reads a lone dot as
 * thousands, so "1.250" kg can not silently become 1250.
 * Returns null for anything that is not a non-negative finite number.
 */
export function parseDecimalInput(
    text: string,
    kind: NumberInputKind = 'money',
): number | null {
    const trimmed = text.trim();
    if (!trimmed || !/^[0-9.,]+$/.test(trimmed)) return null;

    let normalized: string;
    if (trimmed.includes(',')) {
        const parts = trimmed.split(',');
        if (parts.length !== 2) return null;
        const [whole, fraction] = parts;
        if (!PLAIN_DIGITS.test(whole) && !THOUSANDS_GROUPS.test(whole)) {
            return null;
        }
        normalized = `${whole.replace(/\./g, '')}.${fraction}`;
    } else if (kind === 'money' && LEADING_THOUSANDS.test(trimmed)) {
        normalized = trimmed.replace(/\./g, '');
    } else if ((trimmed.match(/\./g) ?? []).length > 1) {
        return null;
    } else {
        normalized = trimmed;
    }

    const value = Number(normalized);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatDecimal(value: number, maxFractionDigits = 4): string {
    return new Intl.NumberFormat('id-ID', {
        maximumFractionDigits: maxFractionDigits,
    }).format(value);
}

/** Plain editable text for a focused field: no grouping, decimal comma. */
export function draftFromNumber(value: number): string {
    return String(Number(value.toFixed(6))).replace('.', ',');
}
