/**
 * CSV cell serialisation for HRD exports.
 *
 * Neutralises spreadsheet formula injection: a string that a spreadsheet
 * could interpret as a formula gets a leading apostrophe. Numbers are written
 * as-is so negative amounts stay numeric.
 */

export type CsvValue = string | number | null | undefined;

/** Characters that make a spreadsheet treat a cell as a formula. */
const FORMULA_LEADING_CHARS = ['=', '+', '@', '\t', '\r'];
const MINUS = '-';
const PLAIN_NUMBER_PATTERN = /^-\d+(\.\d+)?$/;
const FORMULA_ESCAPE_PREFIX = "'";
const NEEDS_QUOTING_PATTERN = /[",\r\n]/;

function isFormulaLike(text: string): boolean {
    if (text.length === 0) return false;
    if (FORMULA_LEADING_CHARS.includes(text[0])) return true;
    return text[0] === MINUS && !PLAIN_NUMBER_PATTERN.test(text);
}

function quoteIfNeeded(text: string): string {
    return NEEDS_QUOTING_PATTERN.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
}

export function csvCell(value: CsvValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    const safe = isFormulaLike(value)
        ? `${FORMULA_ESCAPE_PREFIX}${value}`
        : value;
    return quoteIfNeeded(safe);
}

export function csvRow(values: readonly CsvValue[]): string {
    return values.map(csvCell).join(',');
}
