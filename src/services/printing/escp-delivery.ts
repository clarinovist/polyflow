/**
 * ESC/P generator for the delivery note (Surat Jalan).
 *
 * Mirrors the HTML version in `src/components/sales/SuratJalanDotMatrixPrint.tsx`
 * so an operator sees the same document whichever path they print through —
 * same info block, same four-column table, same three signatures. No prices:
 * a delivery note proves goods moved, not what they cost.
 *
 * See docs/plan/2026-08-07-escp-surat-jalan-dan-cetak-gabungan.md.
 */

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
    formFeed,
    formatDate,
    newline,
    pad,
    setBold,
    setCPI,
    str,
    wrapText,
} from './escp-core';

/** Item name never shrinks below this many columns, even on narrow paper. */
const MIN_NAME_COLS = 24;
/** Keterangan stays at least this wide before the name column stops growing. */
const MIN_NOTE_COLS = 10;
/** Share of the leftover width given to the name column. */
const NAME_SHARE = 0.6;
/** Blank rows kept under the table so short deliveries still fill the form. */
const MIN_ITEM_ROWS = 4;
/** Vertical space left for a handwritten signature. */
const SIGNATURE_BLANK_ROWS = 3;

const CLOSING_TEXT =
    'Demikian surat jalan ini dibuat dengan sebenar-benarnya, sebagai bukti pengiriman barang.';

export interface EscpDeliveryItem {
    name: string;
    qty: number;
    unit: string;
    note: string;
}

export interface EscpDeliveryData {
    // Company
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyWhatsapp: string;
    companyEmail: string;

    // Customer / destination
    customerName: string;
    destinationAddress: string;

    // Delivery
    deliveryNumber: string;
    deliveryDate: Date;
    salesOrderNumber: string;

    // Transport — blank prints as an empty signature slot to fill by hand
    driverName: string;
    vehiclePlate: string;

    items: EscpDeliveryItem[];

    // Footer
    signerName: string;

    // Paper
    paperHeightCm: number;
    /** Physical form width. Drives line width, margins and column widths. */
    paperWidthCm: number;

    logoBitmap?: EscpLogoBitmap | null;
}

interface DeliveryColumns {
    name: number;
    qty: number;
    unit: number;
    note: number;
}

/**
 * Split lineWidth into name / qty / unit / keterangan.
 *
 * Qty and unit scale off the same reference width as the invoice table so the
 * two documents line up on any paper; whatever is left is split
 * NAME_SHARE/rest between the product name and the note. The name column is
 * then floored at MIN_NAME_COLS by taking columns back from the note, but
 * never below MIN_NOTE_COLS — on paper too narrow for both, the name simply
 * stops growing rather than squeezing the note to nothing.
 *
 * The four widths always sum to exactly lineWidth.
 */
function buildDeliveryColumns(lineWidth: number): DeliveryColumns {
    const scale = (min: number) =>
        Math.max(min, Math.round((lineWidth * min) / REFERENCE_LINE_WIDTH));

    const qty = scale(MIN_QTY_COLS);
    const unit = scale(MIN_UNIT_COLS);
    const rest = Math.max(0, lineWidth - qty - unit);

    let name = Math.round(rest * NAME_SHARE);
    let note = rest - name;

    while (name < MIN_NAME_COLS && note > MIN_NOTE_COLS) {
        name += 1;
        note -= 1;
    }

    return { name, qty, unit, note };
}

/** Header block: customer on the left, delivery meta on the right. */
function buildInfoRows(
    data: EscpDeliveryData,
    lineWidth: number,
): { left: string[]; right: string[]; leftWidth: number } {
    const leftWidth = Math.round(lineWidth * 0.54);

    const contactParts: string[] = [];
    if (data.companyPhone) contactParts.push(`Telp: ${data.companyPhone}`);
    if (data.companyWhatsapp) contactParts.push(`Wa: ${data.companyWhatsapp}`);
    if (data.companyEmail) contactParts.push(`Email: ${data.companyEmail}`);

    const left = [
        ...wrapText(data.companyAddress, leftWidth - 1),
        ...wrapText(contactParts.join('  '), leftWidth - 1),
        `NAMA PELANGGAN  : ${data.customerName}`,
        ...wrapText(
            `ALAMAT KIRIM    : ${data.destinationAddress}`,
            leftWidth - 1,
        ),
    ];

    const right = [
        `NO SURAT JALAN  : ${data.deliveryNumber}`,
        `TGL KIRIM       : ${formatDate(data.deliveryDate)}`,
        `NO SO           : ${data.salesOrderNumber || '-'}`,
        `KENDARAAN       : ${data.vehiclePlate || '-'}`,
    ];

    return { left, right, leftWidth };
}

/**
 * One item can occupy several printed lines: the name and the note are
 * wrapped rather than truncated, so a long product name stays readable
 * instead of losing its tail silently. Qty and unit print on the first line
 * only.
 */
function buildItemLines(
    item: EscpDeliveryItem,
    cols: DeliveryColumns,
): string[] {
    const nameLines = wrapText(item.name || '-', cols.name);
    const noteLines = wrapText(item.note || '', cols.note);
    const rowCount = Math.max(1, nameLines.length, noteLines.length);

    const lines: string[] = [];
    for (let i = 0; i < rowCount; i++) {
        const isFirst = i === 0;
        lines.push(
            pad(nameLines[i] || '', cols.name) +
                pad(isFirst ? formatQty(item.qty) : '', cols.qty, 'right') +
                pad(isFirst ? item.unit : '', cols.unit, 'center') +
                pad(noteLines[i] || '', cols.note),
        );
    }
    return lines;
}

/** Trim the trailing ",00" noise — delivery qty is counted, not priced. */
function formatQty(qty: number): string {
    if (!Number.isFinite(qty)) return '0';
    return Number.isInteger(qty)
        ? qty.toString()
        : qty.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

/**
 * Three signature columns in goods-flow order: the factory that sent it, the
 * driver who carried it, the customer who received it.
 */
function buildSignatureRows(
    data: EscpDeliveryData,
    lineWidth: number,
): string[] {
    const colWidth = Math.floor(lineWidth / 3);
    const lastWidth = lineWidth - colWidth * 2;

    const labels =
        pad('Hormat kami,', colWidth) +
        pad('Sopir,', colWidth, 'center') +
        pad('Yang Menerima,', lastWidth, 'right');

    const names =
        pad(`( ${data.signerName} )`, colWidth) +
        pad(`( ${data.driverName} )`, colWidth, 'center') +
        pad('( )', lastWidth, 'right');

    return [labels, ...Array(SIGNATURE_BLANK_ROWS).fill(''), names];
}

export function generateEscpDeliveryNote(data: EscpDeliveryData): number[] {
    const bytes: number[] = [];
    const layout = buildBaseLayout(data.paperWidthCm);
    const W = layout.lineWidth;
    const cols = buildDeliveryColumns(W);

    bytes.push(...documentPreamble(data.paperHeightCm, layout));
    bytes.push(...companyHeader(data.logoBitmap, data.companyName));

    // ── TITLE ──
    // Centred with leading spaces only; padding to W at 10 CPI would run
    // 20% past the right margin and make the printer wrap the line.
    bytes.push(...setCPI(10));
    bytes.push(...setBold(true));
    bytes.push(...str(centerAtPitch('SURAT JALAN', W, 10)));
    bytes.push(...setBold(false));
    bytes.push(...newline());
    bytes.push(...setCPI(BODY_CPI));
    bytes.push(...str(dashLine(W)));
    bytes.push(...newline());

    // ── INFO BLOCK ──
    const { left, right, leftWidth } = buildInfoRows(data, W);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        bytes.push(
            ...str(
                pad(left[i] || '', leftWidth) +
                    pad(right[i] || '', W - leftWidth),
            ),
        );
        bytes.push(...newline());
    }
    bytes.push(...str(dashLine(W)));
    bytes.push(...newline());

    // ── TABLE HEADER ──
    bytes.push(...setBold(true));
    bytes.push(
        ...str(
            pad('Nama Barang', cols.name) +
                pad('Qty', cols.qty, 'right') +
                pad('Satuan', cols.unit, 'center') +
                pad('Keterangan', cols.note),
        ),
    );
    bytes.push(...setBold(false));
    bytes.push(...newline());
    bytes.push(...str(dashLine(W)));
    bytes.push(...newline());

    // ── TABLE BODY ──
    let printedRows = 0;
    for (const item of data.items) {
        for (const line of buildItemLines(item, cols)) {
            bytes.push(...str(line));
            bytes.push(...newline());
            printedRows += 1;
        }
    }
    for (let i = printedRows; i < MIN_ITEM_ROWS; i++) {
        bytes.push(...newline());
    }

    // ── TOTAL ──
    bytes.push(...str(dashLine(W)));
    bytes.push(...newline());
    const totalQty = data.items.reduce(
        (sum, item) => sum + (Number.isFinite(item.qty) ? item.qty : 0),
        0,
    );
    bytes.push(...setBold(true));
    bytes.push(
        ...str(
            pad('TOTAL', cols.name, 'right') +
                pad(formatQty(totalQty), cols.qty, 'right') +
                pad('', cols.unit) +
                pad('', cols.note),
        ),
    );
    bytes.push(...setBold(false));
    bytes.push(...newline());
    bytes.push(...str(dashLine(W)));
    bytes.push(...newline());

    // ── CLOSING ──
    for (const line of wrapText(CLOSING_TEXT, W)) {
        bytes.push(...str(line));
        bytes.push(...newline());
    }
    bytes.push(...newline());

    // ── SIGNATURES ──
    for (const row of buildSignatureRows(data, W)) {
        bytes.push(...str(row));
        bytes.push(...newline());
    }

    bytes.push(...formFeed());

    return bytes;
}
