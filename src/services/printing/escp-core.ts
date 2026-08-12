/**
 * Shared ESC/P primitives — control codes, command builders, text layout, and
 * the paper→layout derivation used by every dot matrix document.
 *
 * Extracted from `escp-generator.ts` (which was at the 800-line ceiling) when
 * the delivery note gained its own ESC/P path. Everything here is
 * document-agnostic: anything that only makes sense for one document (invoice
 * price/discount column floors, terbilang, rupiah formatting) stays with that
 * document's generator.
 *
 * See docs/plan/2026-08-07-escp-surat-jalan-dan-cetak-gabungan.md.
 */

// ─── ESC/P Control Codes ──────────────────────────────────────────────

export const ESC = 0x1b; // Escape
export const FF = 0x0c; // Form Feed
export const CR = 0x0d; // Carriage Return
export const LF = 0x0a; // Line Feed

// ─── Helper: Convert string to byte array (ASCII-safe ESC/P) ──────────

export function toPrinterSafeText(s: string): string {
    return s
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, '-')
        .replace(/…/g, '...')
        .replace(/[^\x20-\x7E]/g, '?');
}

export function str(s: string): number[] {
    return Array.from(toPrinterSafeText(s), (c) => c.charCodeAt(0));
}

// ─── ESC/P Command Builders ───────────────────────────────────────────

/** Initialize printer (reset to defaults) */
export function init(): number[] {
    return [ESC, 0x40]; // ESC @
}

/** Set print quality: 0=Draft, 1=NLQ (Near Letter Quality) */
export function setQuality(mode: 0 | 1): number[] {
    return [ESC, 0x78, mode]; // ESC x n
}

/**
 * Set character pitch via Master Select (ESC ! n).
 *
 * ESC P / ESC M only select the *pitch*; condensed and proportional are
 * separate attributes that survive them. Several Epson models restore a
 * panel default of "condensed" on ESC @, which then stacks on top of the
 * pitch — 12 CPI + condensed = 20 CPI, so a 108-column line shrinks from
 * 9" to 5.4" and leaves the right half of the paper blank. ESC ! sets the
 * pitch and clears every attribute bit in one command, so the printed
 * width is deterministic regardless of panel defaults.
 *
 * bit0 12 CPI · bit1 proportional · bit2 condensed · bit3 bold
 * bit4 double-strike · bit5 double-width · bit6 italic · bit7 underline
 */
export function setCPI(pitch: 10 | 12): number[] {
    return [ESC, 0x21, pitch === 12 ? 0x01 : 0x00]; // ESC ! n
}

/** Cancel condensed mode (DC2) — belt and braces alongside ESC !. */
export function cancelCondensed(): number[] {
    return [0x12];
}

/** Cancel proportional spacing. ESC p 0 */
export function cancelProportional(): number[] {
    return [ESC, 0x70, 0];
}

/** Set line spacing to 1/6 inch */
export function setLineSpacing1_6(): number[] {
    return [ESC, 0x32]; // ESC 2
}

/** Set page length in lines (1-127). ESC C n */
export function setPageLengthLines(n: number): number[] {
    return [ESC, 0x43, Math.max(1, Math.min(127, Math.round(n)))]; // ESC C n
}

/** Bold on/off */
export function setBold(on: boolean): number[] {
    return [ESC, on ? 0x45 : 0x46]; // ESC E / ESC F
}

/** Set left margin (in columns at current CPI) */
export function setLeftMargin(col: number): number[] {
    return [ESC, 0x6c, col]; // ESC l n
}

/** Set right margin (in columns at current CPI) */
export function setRightMargin(col: number): number[] {
    return [ESC, 0x51, col]; // ESC Q n
}

/** Line feed + carriage return */
export function newline(): number[] {
    return [CR, LF];
}

/** Form feed (eject page) */
export function formFeed(): number[] {
    return [FF];
}

// ─── Layout Constants ─────────────────────────────────────────────────

export const CM_PER_INCH = 2.54;
export const BODY_CPI = 12;
/** Mechanical print-width ceiling of Epson wide-carriage models. */
const WIDE_CARRIAGE_MAX_INCHES = 13.6;
/**
 * Mechanical print-width ceiling of narrow-carriage (80-column) models such
 * as the LX-300: the 9.5" form fits the tractor but the head stops at 8".
 */
const NARROW_CARRIAGE_MAX_INCHES = 8.0;
/**
 * Paper at or below this width is assumed to be on a narrow-carriage printer.
 */
const NARROW_CARRIAGE_PAPER_INCHES = 10;
/** Columns skipped on the left so text clears the sprocket strip. */
const LEFT_MARGIN_COLS = 2;
/** Columns kept clear of the right sprocket strip. */
const RIGHT_MARGIN_INSET_COLS = 2;
/** Extra slack so a full-width line never touches the right margin (wrap). */
const WRAP_SAFETY_COLS = 2;
/** Floor so a nonsense paperWidthCm can never produce a negative layout. */
const MIN_LINE_WIDTH = 60;
/** 9.5" continuous form — the default in company config. */
const DEFAULT_PAPER_WIDTH_CM = 24.13;
/**
 * lineWidth of the default 9.5" narrow-carriage form (96 total columns, 90
 * printable). Column floors across documents are calibrated to land exactly
 * on their minimum at this width.
 */
export const REFERENCE_LINE_WIDTH = 90;

/**
 * Column floors shared by every document that prints a qty/unit table.
 * Price, discount and line-total floors are invoice-only and live with the
 * invoice generator.
 */
export const MIN_QTY_COLS = 6;
export const MIN_UNIT_COLS = 8;

export interface EscpBaseLayout {
    /** Printable characters per line at BODY_CPI. */
    lineWidth: number;
    leftMargin: number;
    rightMargin: number;
}

/**
 * Derive line width and margins from the physical paper width.
 *
 * On the default 9.5" form this yields the historical layout: 96 total
 * columns → 90 printable. Paper at or under NARROW_CARRIAGE_PAPER_INCHES is
 * capped at the narrow-carriage mechanical limit (8"); wider paper is capped
 * at the wide-carriage limit (13.6") instead.
 */
export function buildBaseLayout(paperWidthCm: number): EscpBaseLayout {
    const widthCm =
        Number.isFinite(paperWidthCm) && paperWidthCm > 0
            ? paperWidthCm
            : DEFAULT_PAPER_WIDTH_CM;
    const paperInches = widthCm / CM_PER_INCH;
    const carriageMaxInches =
        paperInches <= NARROW_CARRIAGE_PAPER_INCHES
            ? NARROW_CARRIAGE_MAX_INCHES
            : WIDE_CARRIAGE_MAX_INCHES;
    const inches = Math.min(paperInches, carriageMaxInches);
    const totalCols = Math.floor(inches * BODY_CPI);
    const lineWidth = Math.max(
        MIN_LINE_WIDTH,
        totalCols -
            LEFT_MARGIN_COLS -
            RIGHT_MARGIN_INSET_COLS -
            WRAP_SAFETY_COLS,
    );

    return {
        lineWidth,
        leftMargin: LEFT_MARGIN_COLS,
        rightMargin: Math.min(255, totalCols - RIGHT_MARGIN_INSET_COLS),
    };
}

/**
 * Printer setup emitted at the top of every document: reset, cancel the panel
 * defaults that would silently halve the printed width, then pitch, spacing,
 * page length and margins.
 *
 * Concatenating two documents is safe precisely because this starts with
 * ESC @ — the second document inherits nothing from the first.
 */
export function documentPreamble(
    paperHeightCm: number,
    layout: EscpBaseLayout,
): number[] {
    return [
        ...init(),
        ...cancelCondensed(),
        ...cancelProportional(),
        ...setQuality(1), // NLQ
        ...setCPI(BODY_CPI),
        ...setLineSpacing1_6(),
        ...setPageLengthLines((paperHeightCm / CM_PER_INCH) * 6),
        ...setLeftMargin(layout.leftMargin),
        ...setRightMargin(layout.rightMargin),
    ];
}

/**
 * Company identity band: the company name in bold at 10 CPI. Leaves the
 * printer back at BODY_CPI.
 */
export function companyHeader(companyName: string): number[] {
    const bytes: number[] = [];
    bytes.push(...setCPI(10));
    bytes.push(...setBold(true));
    bytes.push(...str(companyName));
    bytes.push(...setBold(false));
    bytes.push(...newline());
    bytes.push(...setCPI(BODY_CPI));
    return bytes;
}

// ─── Text Layout Helpers ──────────────────────────────────────────────

/** Pad string to fixed width */
export function pad(
    s: string,
    width: number,
    align: 'left' | 'right' | 'center' = 'left',
): string {
    if (s.length >= width) return s.substring(0, width);
    const padLen = width - s.length;
    if (align === 'right') return ' '.repeat(padLen) + s;
    if (align === 'center') {
        const left = Math.floor(padLen / 2);
        return ' '.repeat(left) + s + ' '.repeat(padLen - left);
    }
    return s + ' '.repeat(padLen);
}

/**
 * Centre `text` inside a line that is `bodyWidth` columns wide at BODY_CPI,
 * while the text itself prints at `pitch` CPI. Emits leading spaces only —
 * trailing padding at a coarser pitch would run past the right margin.
 */
export function centerAtPitch(
    text: string,
    bodyWidth: number,
    pitch: number,
): string {
    const columnsAtPitch = Math.floor((bodyWidth * pitch) / BODY_CPI);
    const lead = Math.max(0, Math.floor((columnsAtPitch - text.length) / 2));
    return ' '.repeat(lead) + text;
}

/**
 * Greedy word wrap. Words longer than `width` are hard-split so a single
 * long token (a URL, a run-on product code) can never overflow the column
 * and push the line past the right margin.
 */
export function wrapText(text: string, width: number): string[] {
    if (width <= 0) return [];
    const lines: string[] = [];
    let current = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        let token = word;
        while (token.length > width) {
            if (current) {
                lines.push(current);
                current = '';
            }
            lines.push(token.substring(0, width));
            token = token.substring(width);
        }
        const candidate = current ? `${current} ${token}` : token;
        if (candidate.length > width) {
            if (current) lines.push(current);
            current = token;
        } else {
            current = candidate;
        }
    }
    if (current) lines.push(current);
    return lines;
}

/** Create a horizontal line of dashes */
export function dashLine(width: number): string {
    return '-'.repeat(width);
}

/** Create a horizontal line of equals */
export function doubleLine(width: number): string {
    return '='.repeat(width);
}

// ─── Number / Date Formatting ─────────────────────────────────────────

const MONTHS_ID = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agt',
    'Sep',
    'Okt',
    'Nov',
    'Des',
];

export function formatDate(date: Date): string {
    const d = date.getDate().toString().padStart(2, '0');
    const m = MONTHS_ID[date.getMonth()];
    const y = date.getFullYear();
    return `${d} ${m} ${y}`;
}
