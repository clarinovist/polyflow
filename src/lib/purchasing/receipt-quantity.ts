export type ReceiptQuantityInput =
    | number
    | string
    | { toString(): string };

const RECEIPT_QUANTITY_DECIMAL_PLACES = 4;
const INVALID_RECEIPT_QUANTITY_MESSAGE =
    'Receipt quantity must be positive after rounding to 4 decimal places.';

function invalidReceiptQuantity(): RangeError {
    return new RangeError(INVALID_RECEIPT_QUANTITY_MESSAGE);
}

function incrementDigits(value: string): string {
    const digits = value.split('');

    for (let index = digits.length - 1; index >= 0; index -= 1) {
        if (digits[index] !== '9') {
            digits[index] = String(Number(digits[index]) + 1);
            return digits.join('');
        }
        digits[index] = '0';
    }

    return `1${digits.join('')}`;
}

function formatScaledInteger(value: string): string {
    const normalized = value.replace(/^0+/, '') || '0';
    if (normalized === '0') throw invalidReceiptQuantity();

    if (normalized.length <= RECEIPT_QUANTITY_DECIMAL_PLACES) {
        return `0.${normalized.padStart(RECEIPT_QUANTITY_DECIMAL_PLACES, '0')}`;
    }

    const decimalIndex = normalized.length - RECEIPT_QUANTITY_DECIMAL_PLACES;
    return `${normalized.slice(0, decimalIndex)}.${normalized.slice(decimalIndex)}`;
}

/**
 * Return a positive receipt quantity rounded half-up to the persisted four-decimal
 * scale. This module intentionally has no imports so it is safe in client bundles.
 */
export function canonicalizeReceiptQuantity(
    receivedQty: ReceiptQuantityInput,
): string {
    let literal: string;
    try {
        literal = String(receivedQty).trim();
    } catch {
        throw invalidReceiptQuantity();
    }

    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(
        literal,
    );
    if (!match) throw invalidReceiptQuantity();

    const integerDigits = match[2];
    const fractionalDigits = match[3] ?? '';
    if (`${integerDigits}${fractionalDigits}` === '') {
        throw invalidReceiptQuantity();
    }

    const exponent = Number(match[4] ?? 0);
    if (!Number.isSafeInteger(exponent)) throw invalidReceiptQuantity();

    let digits = `${integerDigits}${fractionalDigits}`;
    let decimalIndex = integerDigits.length + exponent;
    while (digits.startsWith('0')) {
        digits = digits.slice(1);
        decimalIndex -= 1;
    }

    if (digits === '' || match[1] === '-') throw invalidReceiptQuantity();

    const cutoff = decimalIndex + RECEIPT_QUANTITY_DECIMAL_PLACES;
    if (cutoff < 0) throw invalidReceiptQuantity();

    if (cutoff >= digits.length) {
        if (decimalIndex > digits.length) {
            return `${digits}e${decimalIndex - digits.length}`;
        }
        return formatScaledInteger(digits.padEnd(cutoff, '0'));
    }

    const retainedDigits = cutoff === 0 ? '0' : digits.slice(0, cutoff);
    const roundedDigits =
        digits[cutoff] >= '5'
            ? incrementDigits(retainedDigits)
            : retainedDigits;

    return formatScaledInteger(roundedDigits);
}
