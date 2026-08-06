import { describe, expect, it } from 'vitest';
import {
    generateEscpInvoice,
    type EscpInvoiceData,
} from '@/services/printing/escp-generator';

const ESC = 0x1b;
const CR = 0x0d;

function baseData(overrides: Partial<EscpInvoiceData> = {}): EscpInvoiceData {
    return {
        companyName: 'CV MELINDO JAYA',
        companyAddress: 'Puri Niaga RT.005 RW.006, Sawahan',
        companyPhone: '0271 82017580',
        companyWhatsapp: '081234567890',
        companyEmail: 'jaya.melindo@gmail.com',
        customerName: 'PT Cipta Plastik Nusantara',
        customerAddress: 'Jl. Industri No. 1',
        customerTaxId: '01.234.567.8-901.000',
        invoiceNumber: '52/INV/VII/2026',
        invoiceDate: new Date('2026-07-31'),
        dueDate: new Date('2026-08-14'),
        items: [
            {
                name: 'Karung Plastik 50kg',
                qty: 100,
                unit: 'pcs',
                unitPrice: 5000,
                lineTotal: 500000,
            },
            {
                name: 'Tali Rafia',
                qty: 50,
                unit: 'roll',
                unitPrice: 20000,
                lineTotal: 1000000,
            },
            {
                name: 'Plastik HD',
                qty: 20,
                unit: 'kg',
                unitPrice: 30000,
                lineTotal: 600000,
            },
        ],
        subtotal: 2100000,
        discountAmount: 0,
        dpp: 2100000,
        taxAmount: 0,
        shippingCost: 0,
        grandTotal: 2100000,
        paidAmount: 0,
        remainingBalance: 2100000,
        totalQty: 170,
        bankHolder: 'Nugroho Pramono',
        bankName: 'Bank BCA',
        bankAccount: '7735006002',
        isPPN: false,
        footerNote: 'BARANG YANG SUDAH DITERIMA TIDAK BISA DIKEMBALIKAN',
        signerName: 'Nugroho Pramono',
        paperHeightCm: 13.97, // 5.5" continuous form
        paperWidthCm: 24.13, // 9.5" continuous form
        ...overrides,
    };
}

function countLines(bytes: number[]): number {
    return bytes.filter((b) => b === CR).length;
}

function pageLengthLines(bytes: number[]): number {
    const idx = bytes.findIndex(
        (b, i) => b === ESC && bytes[i + 1] === 0x43, // ESC C n
    );
    return bytes[idx + 2];
}

function decodeText(bytes: number[]): string {
    return bytes.map((b) => String.fromCharCode(b)).join('');
}

describe('generateEscpInvoice — page length overflow (dot matrix 2nd page bug)', () => {
    it('fits a baseline invoice (no diskon/PPN/ongkir) within the configured page length', () => {
        const bytes = generateEscpInvoice(baseData());
        expect(countLines(bytes)).toBeLessThanOrEqual(pageLengthLines(bytes));
    });

    it('fits an invoice with diskon + PPN + ongkir within the configured page length', () => {
        const bytes = generateEscpInvoice(
            baseData({
                discountAmount: 50000,
                taxAmount: 231000,
                shippingCost: 25000,
                isPPN: true,
            }),
        );
        expect(countLines(bytes)).toBeLessThanOrEqual(pageLengthLines(bytes));
    });

    it('sets page length from paperHeightCm at 1/6" line spacing', () => {
        const bytes = generateEscpInvoice(baseData({ paperHeightCm: 13.97 }));
        expect(pageLengthLines(bytes)).toBe(33);
    });

    it('keeps all key invoice fields in the output despite merged/trimmed lines', () => {
        const data = baseData({
            discountAmount: 50000,
            taxAmount: 231000,
            shippingCost: 25000,
            isPPN: true,
        });
        const text = decodeText(generateEscpInvoice(data));

        expect(text).toContain(data.invoiceNumber);
        expect(text).toContain(data.customerName);
        expect(text).toContain('KETERANGAN BANK :');
        expect(text).toContain('Penjualan PPN');
        expect(text).toContain(data.bankHolder);
        expect(text).toContain(data.bankName);
        expect(text).toContain(data.bankAccount);
        expect(text).toContain('DISKON :');
        expect(text).toContain('PPN 11% :');
        expect(text).toContain('ONGKOS KIRIM :');
        expect(text).toContain('Hormat kami,');
        expect(text).toContain(data.signerName);
        expect(text).toContain(data.footerNote);
    });
});

// ── Printed width ────────────────────────────────────────────────────

interface PrintedLine {
    text: string;
    /** Character pitch in force while the line was emitted. */
    cpi: number;
}

/**
 * Strip ESC/P command bytes so only the printable payload is left, tracking
 * the pitch each line was printed at so its physical width can be checked.
 */
function textLines(bytes: number[]): PrintedLine[] {
    const lines: PrintedLine[] = [];
    let current = '';
    let cpi = 10; // ESC @ default
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === ESC) {
            const cmd = bytes[i + 1];
            if (cmd === 0x21) {
                cpi = bytes[i + 2] & 0x01 ? 12 : 10; // ESC ! n
                i += 2;
            } else if (
                cmd === 0x78 || // ESC x
                cmd === 0x43 || // ESC C
                cmd === 0x6c || // ESC l
                cmd === 0x51 || // ESC Q
                cmd === 0x4a || // ESC J
                cmd === 0x70 || // ESC p
                cmd === 0x2d // ESC -
            ) {
                i += 2;
            } else {
                i += 1; // ESC @ / E / F / 2
            }
            continue;
        }
        if (b === CR) {
            lines.push({ text: current, cpi });
            current = '';
            continue;
        }
        if (b === 0x0a || b === 0x0c || b === 0x12 || b === 0x0f) continue;
        current += String.fromCharCode(b);
    }
    if (current) lines.push({ text: current, cpi });
    return lines;
}

/** Distinct widths of the full-width 12 CPI body lines. */
function bodyWidths(bytes: number[]): number[] {
    return [
        ...new Set(
            textLines(bytes)
                .filter((l) => l.cpi === 12 && l.text.trim() !== '')
                .map((l) => l.text.length),
        ),
    ];
}

function rightMarginCol(bytes: number[]): number {
    const idx = bytes.findIndex(
        (b, i) => b === ESC && bytes[i + 1] === 0x51, // ESC Q n
    );
    return bytes[idx + 2];
}

describe('generateEscpInvoice — printed width', () => {
    it('cancels condensed and proportional so 12 CPI is the real pitch', () => {
        const bytes = generateEscpInvoice(baseData());
        // ESC @ must be followed by DC2 (cancel condensed) + ESC p 0.
        expect(bytes.slice(0, 2)).toEqual([ESC, 0x40]);
        expect(bytes).toContain(0x12);
        const escP = bytes.findIndex(
            (b, i) => b === ESC && bytes[i + 1] === 0x70,
        );
        expect(bytes[escP + 2]).toBe(0);
        // Pitch is set via Master Select (ESC ! 1), not ESC M — ESC M would
        // leave a panel-default condensed mode in force.
        const escBang = bytes.findIndex(
            (b, i) => b === ESC && bytes[i + 1] === 0x21,
        );
        expect(escBang).toBeGreaterThan(-1);
        expect(bytes[escBang + 2]).toBe(0x01);
        expect(
            bytes.some((b, i) => b === ESC && bytes[i + 1] === 0x4d), // ESC M
        ).toBe(false);
    });

    it('keeps 9.5" paper at the historical 108-column layout', () => {
        const bytes = generateEscpInvoice(baseData({ paperWidthCm: 24.13 }));
        expect(rightMarginCol(bytes)).toBe(112);
        expect(bodyWidths(bytes)).toEqual([108]);
    });

    it('widens every line when the form is wider', () => {
        const bytes = generateEscpInvoice(baseData({ paperWidthCm: 30 }));
        // 30cm ≈ 11.81" → 141 total columns → 135 printable.
        expect(rightMarginCol(bytes)).toBe(139);
        expect(bodyWidths(bytes)).toEqual([135]);
    });

    it('caps at the printer mechanical limit on oversized paper', () => {
        const bytes = generateEscpInvoice(baseData({ paperWidthCm: 37.78 }));
        // 14 7/8" form, but printable width tops out at 13.6" → 163 columns.
        expect(rightMarginCol(bytes)).toBe(161);
        expect(bodyWidths(bytes)).toEqual([157]);
    });

    it('never runs a line past the right margin, at any pitch', () => {
        // The 10 CPI header lines are the trap: 108 characters at 10 CPI is
        // 10.8", well past a 9.5" form, and the printer would wrap it into
        // an extra line.
        for (const paperWidthCm of [24.13, 30, 37.78]) {
            const bytes = generateEscpInvoice(baseData({ paperWidthCm }));
            const marginInches = rightMarginCol(bytes) / 12;
            for (const line of textLines(bytes)) {
                expect(line.text.length / line.cpi).toBeLessThanOrEqual(
                    marginInches,
                );
            }
        }
    });

    it('falls back to the default form on a nonsense paper width', () => {
        for (const bad of [0, -5, Number.NaN]) {
            const bytes = generateEscpInvoice(baseData({ paperWidthCm: bad }));
            expect(rightMarginCol(bytes)).toBe(112);
        }
    });

    it('never emits a right margin byte a printer cannot accept', () => {
        const bytes = generateEscpInvoice(baseData({ paperWidthCm: 200 }));
        expect(rightMarginCol(bytes)).toBeLessThanOrEqual(255);
    });

    it('puts the qty total under the Qty column, not under Harga @', () => {
        const lines = textLines(generateEscpInvoice(baseData())).map(
            (l) => l.text,
        );
        const header = lines.find((l) => l.includes('Nama Barang'))!;
        const totalRow = lines.find((l) => l.includes('TOTAL :'))!;
        // Right edge of the "Qty" heading and of the qty total must align.
        const qtyEnd = header.indexOf('Qty') + 'Qty'.length;
        expect(totalRow.indexOf('170') + '170'.length).toBe(qtyEnd);
    });

    it('prints terbilang beside the summary instead of dropping it', () => {
        const lines = textLines(generateEscpInvoice(baseData())).map(
            (l) => l.text,
        );
        const row = lines.find((l) => l.includes('Terbilang :'));
        expect(row).toBeDefined();
        // Same physical line also carries the first summary entry.
        expect(row).toContain('SUBTOTAL :');
    });
});

describe('generateEscpInvoice — logo bitmap', () => {
    const fakeLogo = {
        widthDots: 100,
        bands: [new Array(100).fill(0xff), new Array(100).fill(0xff)],
    };

    it('emits an ESC * bit-image command per band when logoBitmap is set', () => {
        const bytes = generateEscpInvoice(baseData({ logoBitmap: fakeLogo }));
        const escStarCount = bytes.filter(
            (b, i) => b === ESC && bytes[i + 1] === 0x2a,
        ).length;
        expect(escStarCount).toBe(fakeLogo.bands.length);
    });

    it('does not print the company name as text when a logo is present', () => {
        const text = decodeText(generateEscpInvoice(baseData({ logoBitmap: fakeLogo })));
        expect(text).not.toContain('CV MELINDO JAYA');
    });

    it('falls back to the company name text when logoBitmap is null/undefined', () => {
        const text = decodeText(
            generateEscpInvoice(baseData({ logoBitmap: null })),
        );
        expect(text).toContain('CV MELINDO JAYA');
    });

    it('still fits the worst-case invoice (diskon+PPN+ongkir) within page length with a logo', () => {
        const bytes = generateEscpInvoice(
            baseData({
                discountAmount: 50000,
                taxAmount: 231000,
                shippingCost: 25000,
                isPPN: true,
                logoBitmap: fakeLogo,
            }),
        );
        expect(countLines(bytes)).toBeLessThanOrEqual(pageLengthLines(bytes));
    });
});
