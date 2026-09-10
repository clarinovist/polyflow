export type DecimalInputKind = 'money' | 'quantity';

export type DecimalInputResult =
    | { status: 'empty' | 'intermediate' | 'invalid'; value: null }
    | { status: 'valid'; value: number };

const DOMAIN_RULES: Record<
    DecimalInputKind,
    { maximumFractionDigits: number; maximum: number }
> = {
    money: {
        maximumFractionDigits: 2,
        maximum: 9_999_999_999_999.99,
    },
    quantity: {
        maximumFractionDigits: 4,
        maximum: 99_999_999_999.9999,
    },
};

/**
 * Parse a non-negative localized decimal without guessing or partial parsing.
 *
 * A single comma/dot is decimal (so `5304,17` and `5304.17` agree). When both
 * separators occur, the last one is decimal and the other must be valid
 * three-digit grouping (`5.304,17` / `5,304.17`). Repeated separators are only
 * accepted as grouping when every group is complete. A trailing separator is
 * an editable intermediate state, not a committed number.
 */
export function parseLocalizedDecimalInput(
    raw: string,
    kind: DecimalInputKind,
): DecimalInputResult {
    const trimmed = raw.trim();
    if (!trimmed) return { status: 'empty', value: null };
    if (!/^[0-9.,]+$/.test(trimmed)) {
        return { status: 'invalid', value: null };
    }
    if (/^\d+[.,]$/.test(trimmed)) {
        return { status: 'intermediate', value: null };
    }

    const commaCount = (trimmed.match(/,/g) ?? []).length;
    const dotCount = (trimmed.match(/\./g) ?? []).length;
    let integerPart: string;
    let fractionPart = '';

    if (commaCount > 0 && dotCount > 0) {
        const decimalSeparator =
            trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.') ? ',' : '.';
        const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
        if (
            (decimalSeparator === ',' ? commaCount : dotCount) !== 1
        ) {
            return { status: 'invalid', value: null };
        }

        const decimalParts = trimmed.split(decimalSeparator);
        if (decimalParts.length !== 2 || !decimalParts[1]) {
            return { status: 'invalid', value: null };
        }
        const groups = decimalParts[0].split(groupingSeparator);
        if (
            !/^\d{1,3}$/.test(groups[0]) ||
            groups.slice(1).some((group) => !/^\d{3}$/.test(group))
        ) {
            return { status: 'invalid', value: null };
        }
        integerPart = groups.join('');
        fractionPart = decimalParts[1];
    } else if (commaCount + dotCount === 1) {
        const separator = commaCount === 1 ? ',' : '.';
        const parts = trimmed.split(separator);
        if (!parts[0] || !parts[1]) {
            return { status: 'invalid', value: null };
        }
        // For money, a single separator followed by exactly three digits is
        // Indonesian/international grouping (5.304 or 5,304). Quantity keeps
        // the historical decimal interpretation because measurements commonly
        // use three or four fractional digits.
        if (
            kind === 'money' &&
            /^[1-9]\d{0,2}$/.test(parts[0]) &&
            /^\d{3}$/.test(parts[1])
        ) {
            integerPart = parts.join('');
        } else {
            [integerPart, fractionPart] = parts;
        }
    } else if (commaCount + dotCount > 1) {
        const groupingSeparator = commaCount > 1 ? ',' : '.';
        const groups = trimmed.split(groupingSeparator);
        if (
            !/^\d{1,3}$/.test(groups[0]) ||
            groups.slice(1).some((group) => !/^\d{3}$/.test(group))
        ) {
            return { status: 'invalid', value: null };
        }
        integerPart = groups.join('');
    } else {
        integerPart = trimmed;
    }

    const rules = DOMAIN_RULES[kind];
    if (fractionPart.length > rules.maximumFractionDigits) {
        return { status: 'invalid', value: null };
    }

    const value = Number(
        fractionPart ? `${integerPart}.${fractionPart}` : integerPart,
    );
    if (!Number.isFinite(value) || value < 0 || value > rules.maximum) {
        return { status: 'invalid', value: null };
    }

    return { status: 'valid', value };
}

export function parseMoneyInput(raw: string): number | null {
    const result = parseLocalizedDecimalInput(raw, 'money');
    return result.status === 'valid' ? result.value : null;
}

export function parseQuantityInput(raw: string): number | null {
    const result = parseLocalizedDecimalInput(raw, 'quantity');
    return result.status === 'valid' ? result.value : null;
}

/** Backwards-compatible quantity parser used by existing stock-opname UI. */
export function parseDecimalInput(raw: string): number | null {
    return parseQuantityInput(raw);
}

export function formatLocalizedDecimal(
    value: number,
    kind: DecimalInputKind,
): string {
    return new Intl.NumberFormat('id-ID', {
        useGrouping: true,
        maximumFractionDigits: DOMAIN_RULES[kind].maximumFractionDigits,
    }).format(value);
}
