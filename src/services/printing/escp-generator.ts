/**
 * ESC/P (Epson Standard Code for Printers) generator for dot matrix invoices.
 *
 * Generates raw ESC/P binary data that can be sent directly to a dot matrix printer.
 * Uses the printer's built-in fonts for SHARP, clear text — not browser-rendered text.
 *
 * Paper: 9.5" continuous feed (typical Indonesian dot matrix invoice paper)
 * At 12 CPI: ~114 characters per line
 * At 10 CPI: ~95 characters per line
 */

import { terbilang } from '@/lib/utils/terbilang';
import type { EscpLogoBitmap } from './logo-bitmap';

// ─── ESC/P Control Codes ──────────────────────────────────────────────

const ESC = 0x1b; // Escape
const FF = 0x0c; // Form Feed
const CR = 0x0d; // Carriage Return
const LF = 0x0a; // Line Feed

// ─── Helper: Convert string to byte array (ASCII-safe ESC/P) ──────────

function toPrinterSafeText(s: string): string {
    return s
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, '-')
        .replace(/…/g, '...')
        .replace(/[^\x20-\x7E]/g, '?');
}

function str(s: string): number[] {
    return Array.from(toPrinterSafeText(s), (c) => c.charCodeAt(0));
}

// ─── ESC/P Command Builders ───────────────────────────────────────────

/** Initialize printer (reset to defaults) */
function init(): number[] {
    return [ESC, 0x40]; // ESC @
}

/** Set print quality: 0=Draft, 1=NLQ (Near Letter Quality) */
function setQuality(mode: 0 | 1): number[] {
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
function setCPI(pitch: 10 | 12): number[] {
    return [ESC, 0x21, pitch === 12 ? 0x01 : 0x00]; // ESC ! n
}

/** Cancel condensed mode (DC2) — belt and braces alongside ESC !. */
function cancelCondensed(): number[] {
    return [0x12];
}

/** Cancel proportional spacing. ESC p 0 */
function cancelProportional(): number[] {
    return [ESC, 0x70, 0];
}

/** Set line spacing to 1/6 inch */
function setLineSpacing1_6(): number[] {
    return [ESC, 0x32]; // ESC 2
}

/** Set page length in lines (1-127). ESC C n */
function setPageLengthLines(n: number): number[] {
    return [ESC, 0x43, Math.max(1, Math.min(127, Math.round(n)))]; // ESC C n
}

/**
 * Select 8-dot bit image, double density (120 DPI horizontal), mode 1.
 * `columnBytes` has one byte per column (bit 7 = top dot, bit 0 = bottom).
 * ESC * 1 nL nH d1..dk
 */
function bitImage(widthDots: number, columnBytes: number[]): number[] {
    const lo = widthDots % 256;
    const hi = Math.floor(widthDots / 256);
    return [ESC, 0x2a, 1, lo, hi, ...columnBytes];
}

/** One-shot fine feed, n/180 inch. Does not change persistent line spacing. ESC J n */
function fineLineFeed(n: number): number[] {
    return [ESC, 0x4a, Math.max(0, Math.min(255, n))]; // ESC J n
}

/** Bold on/off */
function setBold(on: boolean): number[] {
    return [ESC, on ? 0x45 : 0x46]; // ESC E / ESC F
}

/** Underline on/off */
function _setUnderline(on: boolean): number[] {
    return [ESC, 0x2d, on ? 1 : 0]; // ESC - n
}

/** Set absolute horizontal position (in columns at current CPI) */
function _setAbsolutePosition(col: number): number[] {
    const lo = col % 256;
    const hi = Math.floor(col / 256);
    return [ESC, 0x24, lo, hi]; // ESC $ nL nH
}

/** Set left margin (in columns at current CPI) */
function setLeftMargin(col: number): number[] {
    return [ESC, 0x6c, col]; // ESC l n
}

/** Set right margin (in columns at current CPI) */
function setRightMargin(col: number): number[] {
    return [ESC, 0x51, col]; // ESC Q n
}

/** Line feed + carriage return */
function newline(): number[] {
    return [CR, LF];
}

/** Form feed (eject page) */
function formFeed(): number[] {
    return [FF];
}

/** N line feeds */
function _lines(n: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < n; i++) {
        result.push(CR, LF);
    }
    return result;
}

// ─── Layout Helpers ───────────────────────────────────────────────────

const CM_PER_INCH = 2.54;
const BODY_CPI = 12;
/** Mechanical print-width ceiling of Epson wide-carriage models. */
const MAX_PRINTABLE_INCHES = 13.6;
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

interface EscpColumns {
    name: number;
    qty: number;
    unit: number;
    price: number;
    disc: number;
    total: number;
}

interface EscpLayout {
    /** Printable characters per line at BODY_CPI. */
    lineWidth: number;
    leftMargin: number;
    rightMargin: number;
    cols: EscpColumns;
    /** Column where the right-hand block of the header starts. */
    infoSplit: number;
    /** Column where the right-hand summary block starts. */
    bottomSplit: number;
}

/**
 * Derive the whole layout from the physical paper width.
 *
 * On the default 9.5" form this yields exactly the constants the layout used
 * to hardcode: 114 total columns → 108 printable, 42/8/10/18/10/20 table
 * columns. Wider paper widens every column proportionally, capped at the
 * printer's mechanical limit.
 */
function buildLayout(paperWidthCm: number): EscpLayout {
    const widthCm =
        Number.isFinite(paperWidthCm) && paperWidthCm > 0
            ? paperWidthCm
            : DEFAULT_PAPER_WIDTH_CM;
    const inches = Math.min(widthCm / CM_PER_INCH, MAX_PRINTABLE_INCHES);
    const totalCols = Math.floor(inches * BODY_CPI);
    const lineWidth = Math.max(
        MIN_LINE_WIDTH,
        totalCols -
            LEFT_MARGIN_COLS -
            RIGHT_MARGIN_INSET_COLS -
            WRAP_SAFETY_COLS,
    );

    // Proportional with a minimum: at lineWidth 108 every minimum wins, so
    // the 9.5" output is byte-identical to the previous hardcoded layout.
    const qty = Math.max(8, Math.round(lineWidth * 0.07));
    const unit = Math.max(10, Math.round(lineWidth * 0.09));
    const price = Math.max(18, Math.round(lineWidth * 0.16));
    const disc = Math.max(10, Math.round(lineWidth * 0.09));
    const total = Math.max(20, Math.round(lineWidth * 0.18));

    return {
        lineWidth,
        leftMargin: LEFT_MARGIN_COLS,
        rightMargin: Math.min(255, totalCols - RIGHT_MARGIN_INSET_COLS),
        cols: {
            name: lineWidth - (qty + unit + price + disc + total),
            qty,
            unit,
            price,
            disc,
            total,
        },
        infoSplit: Math.round(lineWidth * 0.54),
        // Wider than half: the summary labels are short ("SISA TAGIHAN :"),
        // so the spare columns are worth more to terbilang and the note.
        bottomSplit: Math.round(lineWidth * 0.55),
    };
}

/** Pad string to fixed width */
function pad(
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
function centerAtPitch(text: string, bodyWidth: number, pitch: number): string {
    const columnsAtPitch = Math.floor((bodyWidth * pitch) / BODY_CPI);
    const lead = Math.max(0, Math.floor((columnsAtPitch - text.length) / 2));
    return ' '.repeat(lead) + text;
}

/**
 * Greedy word wrap. Words longer than `width` are hard-split so a single
 * long token (a URL, a run-on product code) can never overflow the column
 * and push the line past the right margin.
 */
function wrapText(text: string, width: number): string[] {
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
function dashLine(width: number): string {
    return '-'.repeat(width);
}

/** Create a horizontal line of equals */
function doubleLine(width: number): string {
    return '='.repeat(width);
}

// ─── Number Formatting ────────────────────────────────────────────────

function formatRupiah(n: number): string {
    return n.toLocaleString('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatDate(date: Date): string {
    const d = date.getDate().toString().padStart(2, '0');
    const months = [
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
    const m = months[date.getMonth()];
    const y = date.getFullYear();
    return `${d} ${m} ${y}`;
}

// ─── Invoice Data Types ───────────────────────────────────────────────

interface EscpInvoiceItem {
    name: string;
    qty: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
}

interface EscpInvoiceData {
    // Company
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyWhatsapp: string;
    companyEmail: string;

    // Customer
    customerName: string;
    customerAddress: string;
    customerTaxId: string;

    // Invoice
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date | null;

    // Items
    items: EscpInvoiceItem[];

    // Totals
    subtotal: number;
    discountAmount: number;
    dpp: number;
    taxAmount: number;
    shippingCost: number;
    grandTotal: number;
    paidAmount: number;
    remainingBalance: number;
    totalQty: number;

    // Bank
    bankHolder: string;
    bankName: string;
    bankAccount: string;
    isPPN: boolean;

    // Footer
    footerNote: string;
    signerName: string;

    // Paper
    paperHeightCm: number;
    /** Physical form width. Drives line width, margins and column widths. */
    paperWidthCm: number;

    // Logo — pre-built ESC/P bitmap (see logo-bitmap.ts). null/undefined
    // falls back to printing the company name as bold text.
    logoBitmap?: EscpLogoBitmap | null;
}

// ─── Main Generator ───────────────────────────────────────────────────

export function generateEscpInvoice(data: EscpInvoiceData): number[] {
    const bytes: number[] = [];
    const layout = buildLayout(data.paperWidthCm);
    const { lineWidth: W, cols } = layout;

    // ── Initialize printer ──
    bytes.push(...init());
    // ESC @ restores the printer's *panel* defaults, which on many Epson
    // models include condensed. Cancel it explicitly before setting pitch,
    // otherwise every line prints at 20 CPI and only fills half the form.
    bytes.push(...cancelCondensed());
    bytes.push(...cancelProportional());
    bytes.push(...setQuality(1)); // NLQ mode
    bytes.push(...setCPI(BODY_CPI)); // 12 CPI for main body
    bytes.push(...setLineSpacing1_6());
    bytes.push(
        ...setPageLengthLines((data.paperHeightCm / CM_PER_INCH) * 6), // 1/6" lines per form height
    );

    // ── Set explicit margins (at 12 CPI) ──
    // Derived from the physical form width — on the default 9.5" paper this
    // is 114 total columns, left margin 2, right margin 112, 108 printable.
    bytes.push(...setLeftMargin(layout.leftMargin));
    bytes.push(...setRightMargin(layout.rightMargin));

    // ── HEADER ──
    // Company name: logo bitmap if available, otherwise bold text (was
    // always text before logo support was added). CPI stays at 12 (set
    // above) in the logo case since there's no text line to switch for.
    if (data.logoBitmap) {
        for (const band of data.logoBitmap.bands) {
            bytes.push(CR);
            bytes.push(...bitImage(data.logoBitmap.widthDots, band));
            bytes.push(...fineLineFeed(20)); // 8 dots @ 1/72" = 20/180"
        }
    } else {
        bytes.push(...setCPI(10));
        bytes.push(...setBold(true));
        bytes.push(...str(data.companyName));
        bytes.push(...setBold(false));
        bytes.push(...newline());
        bytes.push(...setCPI(BODY_CPI));
    }

    // ── INVOICE TITLE ──
    // (No dashline separator above the title — it already has bold + center
    // + letter-spacing plus a dashline below, and every line here counts
    // against the 5.5" page length budget.)
    // Centred with leading spaces only. Padding it out to W would be W chars
    // at 10 CPI — i.e. 20% past the right margin, which makes the printer
    // wrap and burn an extra line out of the page budget.
    bytes.push(...setCPI(10));
    bytes.push(...setBold(true));
    bytes.push(...str(centerAtPitch('INVOICE', W, 10)));
    bytes.push(...setBold(false));
    // Terminate the line before restoring the body pitch, so the whole line
    // is unambiguously a 10 CPI line.
    bytes.push(...newline());
    bytes.push(...setCPI(BODY_CPI));
    bytes.push(...str(dashLine(W)));
    bytes.push(...newline());

    // ── COMPANY / CUSTOMER (left) vs INVOICE META (right) ──
    // Paired into one two-column block instead of two stacked blocks: the
    // company details used to occupy only the left third of their lines,
    // leaving most of the form blank. Address and contact are wrapped (not
    // truncated) so a long address grows downward rather than getting cut.
    const infoLeftWidth = layout.infoSplit;
    const infoRightWidth = W - layout.infoSplit;
    // Skip labels with nothing behind them — an unset phone used to print a
    // bare "Telp:" on the invoice.
    const contactParts: string[] = [];
    if (data.companyPhone) contactParts.push(`Telp: ${data.companyPhone}`);
    if (data.companyWhatsapp) contactParts.push(`Wa: ${data.companyWhatsapp}`);
    if (data.companyEmail) contactParts.push(`Email: ${data.companyEmail}`);

    const leftCol = [
        ...wrapText(data.companyAddress, infoLeftWidth - 1),
        ...wrapText(contactParts.join('  '), infoLeftWidth - 1),
        `NAMA PELANGGAN  : ${data.customerName}`,
        `ALAMAT          : ${data.customerAddress}`,
    ];
    const rightCol = [
        `NO INVOICE      : ${data.invoiceNumber}`,
        `TGL INVOICE     : ${formatDate(data.invoiceDate)}`,
        `TGL JATUH TEMPO : ${data.dueDate ? formatDate(data.dueDate) : '-'}`,
        `NPWP            : ${data.customerTaxId || '-'}`,
    ];

    for (let i = 0; i < Math.max(leftCol.length, rightCol.length); i++) {
        bytes.push(
            ...str(
                pad(leftCol[i] || '', infoLeftWidth) +
                    pad(rightCol[i] || '', infoRightWidth),
            ),
        );
        bytes.push(...newline());
    }

    bytes.push(...str(dashLine(W)));
    bytes.push(...newline());

    // ── ITEMS TABLE HEADER ──
    bytes.push(...setBold(true));
    bytes.push(
        ...str(
            pad('Nama Barang', cols.name) +
                pad('Qty', cols.qty, 'right') +
                pad('Satuan', cols.unit, 'center') +
                pad('Harga @', cols.price, 'right') +
                pad('Diskon', cols.disc, 'right') +
                pad('Jumlah (Rp)', cols.total, 'right'),
        ),
    );
    bytes.push(...setBold(false));
    bytes.push(...newline());
    bytes.push(...str(dashLine(W)));
    bytes.push(...newline());

    // ── ITEMS TABLE BODY ──
    for (const item of data.items) {
        bytes.push(
            ...str(
                pad(item.name, cols.name) +
                    pad(item.qty.toString(), cols.qty, 'right') +
                    pad(item.unit, cols.unit, 'center') +
                    pad(formatRupiah(item.unitPrice), cols.price, 'right') +
                    pad('0', cols.disc, 'right') +
                    pad(formatRupiah(item.lineTotal), cols.total, 'right'),
            ),
        );
        bytes.push(...newline());
    }

    // Empty rows for spacing (like the browser version)
    if (data.items.length < 3) {
        for (let i = 0; i < 3 - data.items.length; i++) {
            bytes.push(...newline());
        }
    }

    // ── TOTAL ROW ──
    // The qty total sits directly under the Qty column. It used to be padded
    // to COL_PRICE, which parked it under the "Harga @" heading instead.
    bytes.push(...setBold(true));
    bytes.push(
        ...str(
            pad('TOTAL :', cols.name, 'right') +
                pad(data.totalQty.toString(), cols.qty, 'right') +
                pad('', W - cols.name - cols.qty),
        ),
    );
    bytes.push(...setBold(false));
    bytes.push(...newline());
    bytes.push(...str(dashLine(W)));
    bytes.push(...newline());

    // ── FINANCIAL SUMMARY (right) alongside TERBILANG + BANK (left) ──
    // Both blocks used to be stacked, so the summary left a 65-column blank
    // rectangle beside it and terbilang had to be dropped entirely to fit
    // the 5.5" page. Zipped side by side the block is max(left, right) tall
    // instead of left + right, which pays for terbilang and then some.
    const summaryLines: [string, string][] = [
        ['SUBTOTAL :', formatRupiah(data.subtotal)],
    ];
    if (data.discountAmount > 0) {
        summaryLines.push([
            'DISKON :',
            `-${formatRupiah(data.discountAmount)}`,
        ]);
    }
    summaryLines.push(['DPP :', formatRupiah(data.dpp)]);
    if (data.taxAmount > 0) {
        summaryLines.push(['PPN 11% :', formatRupiah(data.taxAmount)]);
    }
    if (data.shippingCost > 0) {
        summaryLines.push(['ONGKOS KIRIM :', formatRupiah(data.shippingCost)]);
    }
    summaryLines.push(['TOTAL :', formatRupiah(data.grandTotal)]);
    summaryLines.push(['SISA TAGIHAN :', formatRupiah(data.remainingBalance)]);

    const bottomLeftWidth = layout.bottomSplit;
    const summaryLabelWidth = W - bottomLeftWidth - cols.total;

    const bankLabel = `KETERANGAN BANK : (${data.isPPN ? 'Penjualan PPN' : 'Penjualan Non PPN'})`;
    const bottomLeft = [
        ...wrapText(
            `Terbilang : ${terbilang(data.grandTotal)}`,
            bottomLeftWidth - 1,
        ),
        '',
        bankLabel,
        `A/N ${data.bankHolder} - ${data.bankName} : ${data.bankAccount}`,
    ];

    const bottomRows = Math.max(bottomLeft.length, summaryLines.length);
    for (let i = 0; i < bottomRows; i++) {
        const leftText = bottomLeft[i] || '';
        const isBankLabel = leftText === bankLabel;
        if (isBankLabel) bytes.push(...setBold(true));
        bytes.push(...str(pad(leftText, bottomLeftWidth)));
        if (isBankLabel) bytes.push(...setBold(false));

        const summary = summaryLines[i];
        if (summary) {
            const [label, value] = summary;
            const isTotal = label === 'TOTAL :' || label === 'SISA TAGIHAN :';
            if (isTotal) bytes.push(...setBold(true));
            bytes.push(
                ...str(
                    pad(label, summaryLabelWidth, 'right') +
                        pad(value, cols.total, 'right'),
                ),
            );
            if (isTotal) bytes.push(...setBold(false));
        } else {
            bytes.push(...str(pad('', W - bottomLeftWidth)));
        }
        bytes.push(...newline());
    }
    bytes.push(...str(doubleLine(W)));
    bytes.push(...newline());

    // ── FOOTER: NOTE (left) alongside the signature block (right) ──
    // The signature needs blank rows for a pen stroke; the note fills the
    // left of those same rows instead of claiming a dashline + line of
    // its own below them.
    const signatureLines = ['Hormat kami,', '', '', `( ${data.signerName} )`];
    const noteLines = wrapText(
        `NOTE : ${data.footerNote}`,
        bottomLeftWidth - 1,
    );
    const footerRows = Math.max(signatureLines.length, noteLines.length + 1);
    for (let i = 0; i < footerRows; i++) {
        // Offset by one so the note starts below the "Hormat kami," line.
        const noteText = noteLines[i - 1] || '';
        if (noteText) bytes.push(...setBold(true));
        bytes.push(...str(pad(noteText, bottomLeftWidth)));
        if (noteText) bytes.push(...setBold(false));
        bytes.push(
            ...str(pad(signatureLines[i] || '', W - bottomLeftWidth, 'right')),
        );
        bytes.push(...newline());
    }

    // ── Form Feed ──
    bytes.push(...formFeed());

    return bytes;
}

/**
 * Convert ESC/P byte array to a Uint8Array for download.
 */
export function toUint8Array(bytes: number[]): Uint8Array {
    return new Uint8Array(bytes);
}

export type { EscpInvoiceData, EscpInvoiceItem };
