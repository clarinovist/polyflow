/**
 * ESC/P (Epson Standard Code for Printers) generator for dot matrix invoices.
 *
 * Generates raw ESC/P binary data that can be sent directly to a dot matrix printer.
 * Uses the printer's built-in fonts for SHARP, clear text — not browser-rendered text.
 *
 * Paper: 9.5" continuous feed (typical Indonesian dot matrix invoice paper),
 * printed on a narrow-carriage (80-column) printer such as the Epson LX-300
 * series. The 9.5" form fits the tractor, but the print head itself cannot
 * travel past 8" — at 12 CPI that is 96 printed columns, 90 of which are the
 * usable line width after margins. Treating the wider *paper* width as the
 * *printable* width (the previous version of this comment did, at "~114
 * characters per line") makes every column past ~col 90 wrap onto the next
 * physical line instead of being clipped — see
 * docs/plan/2026-08-07-fix-escp-print-width-logo-overprint.md.
 */

import { terbilang } from '@/lib/utils/terbilang';
import type { EscpLogoBitmap } from './logo-bitmap';
import {
    BODY_CPI,
    MIN_QTY_COLS,
    MIN_UNIT_COLS,
    REFERENCE_LINE_WIDTH,
    buildBaseLayout,
    centerAtPitch,
    companyHeader,
    dashLine,
    documentPreamble,
    doubleLine,
    formFeed,
    formatDate,
    newline,
    pad,
    setBold,
    setCPI,
    str,
    wrapText,
} from './escp-core';

// ─── Invoice Table Layout ─────────────────────────────────────────────

/**
 * Absolute minimum widths (characters) for the invoice-only numeric columns.
 * Calibrated against realistic worst-case values: price up to
 * "99.999.999,00" (13), discount label "Diskon" (6), line total up to
 * "999.999.999,00" (14, +1 slack). Qty and unit floors are shared with the
 * other documents and live in `escp-core`.
 */
const MIN_PRICE_COLS = 13;
const MIN_DISC_COLS = 6;
const MIN_TOTAL_COLS = 15;
/** Item name never shrinks below this many columns, even on tiny paper. */
const MIN_NAME_COLS = 24;

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
 * Derive the invoice layout from the physical paper width.
 *
 * Line width and margins come from the shared `buildBaseLayout`; this adds
 * the invoice's own table columns and the two header/summary split points.
 * On the default 9.5" form this yields exactly the historical layout: 90
 * printable columns, 42/6/8/13/6/15 table columns.
 */
function buildLayout(paperWidthCm: number): EscpLayout {
    const base = buildBaseLayout(paperWidthCm);
    const { lineWidth } = base;

    return {
        ...base,
        cols: buildNumericColumns(lineWidth),
        infoSplit: Math.round(lineWidth * 0.54),
        // Wider than half: the summary labels are short ("SISA TAGIHAN :"),
        // so the spare columns are worth more to terbilang and the note.
        bottomSplit: Math.round(lineWidth * 0.55),
    };
}

interface NumericCol {
    key: 'qty' | 'unit' | 'price' | 'disc' | 'total';
    width: number;
    floor: number;
}

/**
 * Split lineWidth into the item-name column and five numeric columns.
 *
 * Every numeric column scales proportionally with lineWidth — `scale(min) =
 * max(min, round(lineWidth * min / REFERENCE_LINE_WIDTH))` — anchored so
 * that at REFERENCE_LINE_WIDTH (the historical 9.5" default, 90 columns)
 * each one lands exactly at its MIN_*_COLS floor. On wider paper the numeric
 * columns keep growing at the same rate as lineWidth (e.g. at 135 columns —
 * 30cm paper — qty grows 6→9, price 13→20, total 15→23): the floor is only
 * a lower bound, not a cap. `name` gets whatever is left over after the five
 * numeric columns, which is why it — not the numeric columns — absorbs the
 * *rounding slack* between the proportional scaling and lineWidth.
 *
 * On paper narrower than the reference the scale factor is below 1, so every
 * numeric column is already pinned to its floor — the compression guard
 * below only has headroom to reclaim on paper *between* the absolute
 * MIN_LINE_WIDTH and the reference width in some future recalibration; today
 * it mostly documents the halt condition ("already at the absolute
 * minimum") for narrow paper. Sum of the six returned widths always equals
 * lineWidth exactly, regardless of input.
 */
function buildNumericColumns(lineWidth: number): EscpColumns {
    const scale = (min: number) =>
        Math.max(min, Math.round((lineWidth * min) / REFERENCE_LINE_WIDTH));

    const numeric: NumericCol[] = [
        { key: 'qty', width: scale(MIN_QTY_COLS), floor: MIN_QTY_COLS },
        { key: 'unit', width: scale(MIN_UNIT_COLS), floor: MIN_UNIT_COLS },
        { key: 'price', width: scale(MIN_PRICE_COLS), floor: MIN_PRICE_COLS },
        { key: 'disc', width: scale(MIN_DISC_COLS), floor: MIN_DISC_COLS },
        { key: 'total', width: scale(MIN_TOTAL_COLS), floor: MIN_TOTAL_COLS },
    ];
    const numericTotal = () => numeric.reduce((sum, c) => sum + c.width, 0);
    let name = lineWidth - numericTotal();

    // Compress the widest column still above its floor until the name
    // column recovers to MIN_NAME_COLS, or every numeric column is already
    // at its absolute minimum and nothing more can be reclaimed.
    while (name < MIN_NAME_COLS) {
        const shrinkable = numeric
            .filter((c) => c.width > c.floor)
            .sort((a, b) => b.width - a.width)[0];
        if (!shrinkable) break;
        shrinkable.width -= 1;
        name += 1;
    }

    const widthOf = (key: NumericCol['key']) =>
        numeric.find((c) => c.key === key)!.width;

    return {
        name,
        qty: widthOf('qty'),
        unit: widthOf('unit'),
        price: widthOf('price'),
        disc: widthOf('disc'),
        total: widthOf('total'),
    };
}

// ─── Number Formatting ────────────────────────────────────────────────

function formatRupiah(n: number): string {
    return n.toLocaleString('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
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

    // ── Initialize printer + margins (at 12 CPI) ──
    // Derived from the physical form width — on the default 9.5" narrow-
    // carriage paper this is 96 total columns, left margin 2, right margin
    // 94, 90 printable.
    bytes.push(...documentPreamble(data.paperHeightCm, layout));

    // ── HEADER ──
    bytes.push(...companyHeader(data.logoBitmap, data.companyName));

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
    // DPP hanya punya arti pada transaksi PPN. Di invoice non-PPN nilainya
    // sama dengan SUBTOTAL (atau SUBTOTAL - DISKON), jadi baris ini cuma
    // mengesankan ada komponen pajak yang sebenarnya tidak ada.
    if (data.isPPN) {
        summaryLines.push(['DPP :', formatRupiah(data.dpp)]);
    }
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

export type { EscpInvoiceData, EscpInvoiceItem };
