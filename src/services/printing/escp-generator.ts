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

// ─── ESC/P Control Codes ──────────────────────────────────────────────

const ESC = 0x1B;  // Escape
const FF  = 0x0C;  // Form Feed
const CR  = 0x0D;  // Carriage Return
const LF  = 0x0A;  // Line Feed

// ─── Helper: Convert string to byte array (ASCII) ─────────────────────

function str(s: string): number[] {
    return Array.from(s, c => c.charCodeAt(0));
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

/** Set character pitch: 10=CPI, 12=CPI, 17=Condensed */
function setCPI(pitch: 10 | 12 | 17): number[] {
    switch (pitch) {
        case 10: return [ESC, 0x50]; // ESC P
        case 12: return [ESC, 0x4D]; // ESC M
        case 17: return [0x0F];      // SI (Shift In) = condensed
    }
}

/** Turn condensed mode on/off */
function _setCondensed(on: boolean): number[] {
    return on ? [0x0F] : [0x12]; // SI on, DC2 off
}

/** Bold on/off */
function setBold(on: boolean): number[] {
    return [ESC, on ? 0x45 : 0x46]; // ESC E / ESC F
}

/** Underline on/off */
function _setUnderline(on: boolean): number[] {
    return [ESC, 0x2D, on ? 1 : 0]; // ESC - n
}

/** Set absolute horizontal position (in columns at current CPI) */
function _setAbsolutePosition(col: number): number[] {
    const lo = col % 256;
    const hi = Math.floor(col / 256);
    return [ESC, 0x24, lo, hi]; // ESC $ nL nH
}

/** Set left margin (in columns) */
function _setLeftMargin(col: number): number[] {
    return [ESC, 0x6C, col]; // ESC l n
}

/** Set right margin (in columns) */
function _setRightMargin(col: number): number[] {
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

const LINE_WIDTH = 95; // characters at 10 CPI on 9.5" paper

/** Pad string to fixed width */
function pad(s: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
    if (s.length >= width) return s.substring(0, width);
    const padLen = width - s.length;
    if (align === 'right') return ' '.repeat(padLen) + s;
    if (align === 'center') {
        const left = Math.floor(padLen / 2);
        return ' '.repeat(left) + s + ' '.repeat(padLen - left);
    }
    return s + ' '.repeat(padLen);
}

/** Create a horizontal line of dashes */
function dashLine(width: number = LINE_WIDTH): string {
    return '-'.repeat(width);
}

/** Create a horizontal line of equals */
function doubleLine(width: number = LINE_WIDTH): string {
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
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
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
}

// ─── Main Generator ───────────────────────────────────────────────────

export function generateEscpInvoice(data: EscpInvoiceData): number[] {
    const bytes: number[] = [];
    const COL_NAME = 38; // width for item name column
    const COL_QTY = 8;
    const COL_UNIT = 10;
    const COL_PRICE = 15;
    const COL_DISC = 8;
    const COL_TOTAL = 16;

    // ── Initialize printer ──
    bytes.push(...init());
    bytes.push(...setQuality(1));   // NLQ mode
    bytes.push(...setCPI(12));      // 12 CPI for main body

    // ── HEADER ──
    // Company name in 10 CPI (larger)
    bytes.push(...setCPI(10));
    bytes.push(...setBold(true));
    bytes.push(...str(data.companyName));
    bytes.push(...setBold(false));
    bytes.push(...newline());

    // Company details in 12 CPI
    bytes.push(...setCPI(12));
    bytes.push(...str(pad(data.companyAddress, LINE_WIDTH)));
    bytes.push(...newline());
    bytes.push(...str(pad(`Telp: ${data.companyPhone}  Email: ${data.companyEmail}`, LINE_WIDTH)));
    bytes.push(...newline());
    bytes.push(...str(dashLine()));
    bytes.push(...newline());

    // ── INVOICE TITLE ──
    bytes.push(...setCPI(10));
    bytes.push(...setBold(true));
    bytes.push(...str(pad('INVOICE', LINE_WIDTH, 'center')));
    bytes.push(...setBold(false));
    bytes.push(...setCPI(12));
    bytes.push(...newline());
    bytes.push(...str(dashLine()));
    bytes.push(...newline());

    // ── CUSTOMER & INVOICE INFO (two columns) ──
    const leftCol = [
        `NAMA PELANGGAN : ${data.customerName}`,
        `ALAMAT         : ${data.customerAddress}`,
        `NPWP           : ${data.customerTaxId || '-'}`,
    ];
    const rightCol = [
        `NO INVOICE     : ${data.invoiceNumber}`,
        `TGL INVOICE    : ${formatDate(data.invoiceDate)}`,
        `TGL JATUH TEMPO: ${data.dueDate ? formatDate(data.dueDate) : '-'}`,
    ];

    for (let i = 0; i < Math.max(leftCol.length, rightCol.length); i++) {
        const left = leftCol[i] || '';
        const right = rightCol[i] || '';
        // Split line: left side takes 50 chars, right side takes the rest
        const leftPart = pad(left, 50);
        const rightPart = pad(right, LINE_WIDTH - 50, 'left');
        bytes.push(...str(leftPart + rightPart));
        bytes.push(...newline());
    }

    bytes.push(...str(dashLine()));
    bytes.push(...newline());

    // ── ITEMS TABLE HEADER ──
    bytes.push(...setBold(true));
    bytes.push(...str(
        pad('Nama Barang', COL_NAME) +
        pad('Qty', COL_QTY, 'right') +
        pad('Satuan', COL_UNIT, 'center') +
        pad('Harga @', COL_PRICE, 'right') +
        pad('Diskon', COL_DISC, 'right') +
        pad('Jumlah (Rp)', COL_TOTAL, 'right')
    ));
    bytes.push(...setBold(false));
    bytes.push(...newline());
    bytes.push(...str(dashLine()));
    bytes.push(...newline());

    // ── ITEMS TABLE BODY ──
    for (const item of data.items) {
        bytes.push(...str(
            pad(item.name, COL_NAME) +
            pad(item.qty.toString(), COL_QTY, 'right') +
            pad(item.unit, COL_UNIT, 'center') +
            pad(formatRupiah(item.unitPrice), COL_PRICE, 'right') +
            pad('0', COL_DISC, 'right') +
            pad(formatRupiah(item.lineTotal), COL_TOTAL, 'right')
        ));
        bytes.push(...newline());
    }

    // Empty rows for spacing (like the browser version)
    if (data.items.length < 3) {
        for (let i = 0; i < 3 - data.items.length; i++) {
            bytes.push(...newline());
        }
    }

    bytes.push(...str(dashLine()));
    bytes.push(...newline());

    // ── TOTAL ROW ──
    bytes.push(...setBold(true));
    bytes.push(...str(
        pad('TOTAL :', COL_NAME + COL_QTY + COL_UNIT, 'right') +
        pad(data.totalQty.toString(), COL_PRICE, 'right') +
        pad('', COL_DISC) +
        pad('', COL_TOTAL)
    ));
    bytes.push(...setBold(false));
    bytes.push(...newline());
    bytes.push(...str(dashLine()));
    bytes.push(...newline());

    // ── TERBILANG ──
    // We skip terbilang in ESC/P to keep it simple — the number is clear enough
    bytes.push(...newline());

    // ── FINANCIAL SUMMARY (right-aligned) ──
    const summaryLines: [string, string][] = [
        ['SUBTOTAL :', formatRupiah(data.subtotal)],
    ];
    if (data.discountAmount > 0) {
        summaryLines.push(['DISKON :', `-${formatRupiah(data.discountAmount)}`]);
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

    // Print summary in a box-like format
    bytes.push(...str(doubleLine()));
    bytes.push(...newline());
    for (const [label, value] of summaryLines) {
        const isTotal = label === 'TOTAL :' || label === 'SISA TAGIHAN :';
        if (isTotal) bytes.push(...setBold(true));
        bytes.push(...str(
            pad('', 60) +
            pad(label, 20, 'right') +
            pad(value, 15, 'right')
        ));
        if (isTotal) bytes.push(...setBold(false));
        bytes.push(...newline());
    }
    bytes.push(...str(doubleLine()));
    bytes.push(...newline());

    // ── FOOTER ──
    bytes.push(...newline());

    // Bank info (left) and signature (right)
    bytes.push(...setBold(true));
    bytes.push(...str('KETERANGAN BANK :'));
    bytes.push(...setBold(false));
    bytes.push(...newline());
    bytes.push(...str(`(${data.isPPN ? 'Penjualan PPN' : 'Penjualan Non PPN'})`));
    bytes.push(...newline());
    bytes.push(...str(`A/N ${data.bankHolder}`));
    bytes.push(...newline());
    bytes.push(...str(`${data.bankName} : ${data.bankAccount}`));
    bytes.push(...newline());
    bytes.push(...newline());
    bytes.push(...newline());

    // Signature line (right side)
    bytes.push(...str(pad('Hormat kami,', LINE_WIDTH, 'right')));
    bytes.push(...newline());
    bytes.push(...newline());
    bytes.push(...newline());
    bytes.push(...newline());
    bytes.push(...str(pad(`( ${data.signerName} )`, LINE_WIDTH, 'right')));
    bytes.push(...newline());

    // ── NOTE ──
    bytes.push(...str(dashLine()));
    bytes.push(...setBold(true));
    bytes.push(...str(`NOTE : ${data.footerNote}`));
    bytes.push(...setBold(false));
    bytes.push(...newline());

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
