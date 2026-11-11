export const DRAFT_AMOUNT_FIELDS = [
    'thrAmount',
    'prorationDeduction',
    'bpjsDeduction',
    'loanDeduction',
    'otherDeductions',
] as const;

export type DraftAmountField = (typeof DRAFT_AMOUNT_FIELDS)[number];
export type DraftAmountInput = Record<DraftAmountField, string>;
export type DraftAmountValues = Record<DraftAmountField, number>;
export type DraftAmountErrors = Partial<Record<DraftAmountField, string>>;

export type DraftAmountResult =
    | { ok: true; values: DraftAmountValues }
    | { ok: false; errors: DraftAmountErrors };

const MSG_EMPTY = 'Wajib diisi. Isi 0 bila tidak ada.';
const MSG_NOT_NUMBER = 'Harus berupa angka yang valid.';
const MSG_NEGATIVE = 'Tidak boleh negatif.';

function parseAmount(raw: string): { value: number } | { error: string } {
    const text = raw.trim();
    if (text === '') return { error: MSG_EMPTY };
    const value = Number(text);
    if (!Number.isFinite(value)) return { error: MSG_NOT_NUMBER };
    if (value < 0) return { error: MSG_NEGATIVE };
    return { value };
}

/** Validates draft amount inputs; never coerces invalid text to 0. */
export function parseDraftAmounts(input: DraftAmountInput): DraftAmountResult {
    const values: Partial<DraftAmountValues> = {};
    const errors: DraftAmountErrors = {};
    for (const field of DRAFT_AMOUNT_FIELDS) {
        const parsed = parseAmount(input[field]);
        if ('error' in parsed) errors[field] = parsed.error;
        else values[field] = parsed.value;
    }
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    return { ok: true, values: values as DraftAmountValues };
}
