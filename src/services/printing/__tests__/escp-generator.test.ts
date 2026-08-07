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
        expect(text).toContain('DPP :');
        expect(text).toContain('PPN 11% :');
        expect(text).toContain('ONGKOS KIRIM :');
        expect(text).toContain('Hormat kami,');
        expect(text).toContain(data.signerName);
        // The footer note can wrap across two physical lines at the
        // narrower 90-column layout (it fit on one line at the old
        // 108-column width) — reconstruct wrapped text from the parsed
        // lines instead of asserting it's contiguous in the raw byte
        // stream. wrapText() only breaks at word boundaries, so joining
        // trimmed lines with a single space reproduces the original text.
    });

    it('keeps the footer note fully readable even when it wraps across lines', () => {
        const data = baseData({
            discountAmount: 50000,
            taxAmount: 231000,
            shippingCost: 25000,
            isPPN: true,
        });
        const reconstructed = textLines(generateEscpInvoice(data))
            .map((l) => l.text.trim())
            .filter(Boolean)
            .join(' ');
        expect(reconstructed).toContain(data.footerNote);
    });

    it('omits the DPP row on a non-PPN invoice', () => {
        // Arrange — no tax: DPP would just restate SUBTOTAL
        const data = baseData({ isPPN: false, taxAmount: 0 });

        // Act
        const text = decodeText(generateEscpInvoice(data));

        // Assert
        expect(text).toContain('SUBTOTAL :');
        expect(text).toContain('Penjualan Non PPN');
        expect(text).not.toContain('DPP :');
        expect(text).not.toContain('PPN 11% :');
    });

    it('keeps the DPP row on a PPN invoice', () => {
        // Arrange
        const data = baseData({
            isPPN: true,
            taxAmount: 231000,
            dpp: 2100000,
        });

        // Act
        const text = decodeText(generateEscpInvoice(data));

        // Assert
        expect(text).toContain('DPP :');
        expect(text).toContain('PPN 11% :');
    });
});

describe('generateEscpInvoice — row budget at the narrower 90-column layout', () => {
    it('still fits the page length with every wrap-prone field pushed to a realistic worst case', () => {
        // Narrowing the content width from 108 to 90 columns (this fix)
        // shrinks every wrapText() budget too — most notably infoLeftWidth
        // (58 → 49) and bottomLeftWidth (59 → 50). A company address or
        // contact line that used to fit on one line can now wrap onto two,
        // and the worst-case invoice (diskon+PPN+ongkir+logo) already runs
        // the page length at exactly 33/33 with zero slack (see
        // docs/plan/2026-08-05-escp-invoice-logo-bitmap.md §3.1) — one
        // extra wrapped line here means the invoice spills onto a second
        // physical page.
        const bytes = generateEscpInvoice(
            baseData({
                companyAddress:
                    'Jl. Raya Solo-Sragen KM 12, Kawasan Industri Sawahan, Kabupaten Sragen, Jawa Tengah',
                customerName: 'PT Sumber Rejeki Makmur Sejahtera Abadi Selalu Jaya',
                customerAddress:
                    'Jl. Industri Kawasan Berikat Nusantara Blok C No. 45, Cakung, Jakarta Timur',
                footerNote:
                    'BARANG YANG SUDAH DITERIMA TIDAK BISA DIKEMBALIKAN ATAU DITUKAR DALAM KONDISI APAPUN',
                discountAmount: 500000,
                taxAmount: 2310000,
                shippingCost: 250000,
                grandTotal: 987654321,
                remainingBalance: 987654321,
                isPPN: true,
                logoBitmap: {
                    widthDots: 100,
                    bands: [
                        new Array(100).fill(0xff),
                        new Array(100).fill(0xff),
                    ],
                },
            }),
        );
        // Measured directly (not assumed): this scenario uses 30 of the
        // 33-line budget — 3 lines of margin, despite the company address,
        // contact block, and footer note all wrapping onto a second line at
        // this narrower width. If a future change to any wrapped field
        // eats that margin, this test is the tripwire.
        expect(countLines(bytes)).toBeLessThanOrEqual(pageLengthLines(bytes));
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

    it('keeps 9.5" paper at the 90-column narrow-carriage layout', () => {
        // The 9.5" form fits an Epson LX-300-class (narrow-carriage) printer,
        // but the print head itself can only travel 8" — 96 total columns at
        // 12 CPI, 90 printable after margins. The historical 108-column
        // layout treated the *paper* width as the *printable* width and
        // wrapped every column past ~col 90 onto the next physical line
        // (see docs/plan/2026-08-07-fix-escp-print-width-logo-overprint.md).
        const bytes = generateEscpInvoice(baseData({ paperWidthCm: 24.13 }));
        expect(rightMarginCol(bytes)).toBe(94);
        expect(bodyWidths(bytes)).toEqual([90]);
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
            expect(rightMarginCol(bytes)).toBe(94);
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

    it('sums the table column widths to exactly the line width, at any paper size', () => {
        // Every full-width 12 CPI line (item table header/body, dashlines,
        // total row) is built by concatenating pad()-ed columns. If the
        // column widths (name/qty/unit/price/disc/total) didn't sum to
        // exactly the same lineWidth used for the dashline separators, these
        // lines would come out at different lengths and bodyWidths() would
        // report more than one distinct value. 10cm is MIN_PAPER_CM — the
        // narrowest paper the settings UI allows — which exercises the
        // MIN_NAME_COLS guard in buildNumericColumns.
        for (const paperWidthCm of [24.13, 30, 37.78, 10]) {
            const bytes = generateEscpInvoice(baseData({ paperWidthCm }));
            expect(bodyWidths(bytes)).toHaveLength(1);
        }
    });

    it('does not truncate a 42-character item name on 9.5" paper', () => {
        // "Sedotan Hitam Steril Full Printing Isi 250" is exactly 42
        // characters — the name column width at the default 9.5" layout.
        // pad() truncates via substring, so if the column were even one
        // character narrower this would lose "0" off the end.
        const longName = 'Sedotan Hitam Steril Full Printing Isi 250';
        expect(longName).toHaveLength(42);
        const text = decodeText(
            generateEscpInvoice(
                baseData({
                    paperWidthCm: 24.13,
                    items: [
                        {
                            name: longName,
                            qty: 1,
                            unit: 'pcs',
                            unitPrice: 1000,
                            lineTotal: 1000,
                        },
                    ],
                }),
            ),
        );
        expect(text).toContain(longName);
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

    it('feeds the persistent line spacing around the logo bands instead of one-shot ESC J', () => {
        const bytes = generateEscpInvoice(baseData({ logoBitmap: fakeLogo }));

        // ESC J (one-shot fine feed) must not appear anywhere — it was the
        // root cause of the logo bands overprinting each other.
        const hasEscJ = bytes.some((b, i) => b === ESC && bytes[i + 1] === 0x4a);
        expect(hasEscJ).toBe(false);

        const bandStarts = bytes.reduce<number[]>((acc, b, i) => {
            if (b === ESC && bytes[i + 1] === 0x2a) acc.push(i);
            return acc;
        }, []);
        expect(bandStarts).toHaveLength(fakeLogo.bands.length);

        // ESC 3 24 (persistent 24/180" line spacing) comes before the first
        // band's ESC * command.
        const spacingIdx = bytes.findIndex(
            (b, i) => b === ESC && bytes[i + 1] === 0x33,
        );
        expect(spacingIdx).toBeGreaterThan(-1);
        expect(bytes[spacingIdx + 2]).toBe(24);
        expect(spacingIdx).toBeLessThan(bandStarts[0]);

        // ESC 2 (restore 1/6" spacing) comes after the last band.
        const lastBandStart = bandStarts[bandStarts.length - 1];
        const restoreIdx = bytes.findIndex(
            (b, i) => i > lastBandStart && b === ESC && bytes[i + 1] === 0x32,
        );
        expect(restoreIdx).toBeGreaterThan(lastBandStart);

        // Exactly one LF per band inside the logo block (CR + band + LF,
        // repeated), between the spacing command and its restore.
        const lfInLogoBlock = bytes
            .slice(spacingIdx, restoreIdx)
            .filter((b) => b === 0x0a).length;
        expect(lfInLogoBlock).toBe(fakeLogo.bands.length);
    });
});
