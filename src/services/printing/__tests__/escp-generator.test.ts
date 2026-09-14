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
        bankAccounts: [
            { holder: 'Nugroho Pramono', bank: 'Bank BCA', account: '7735006002' },
        ],
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
    it('prints rounded total without adjustment row or changing VAT / remaining balance', () => {
        const bytes = generateEscpInvoice(baseData({
            grandTotal: 16642500, remainingBalance: 100.25,
            isPPN: true, taxAmount: 1649238.92, discountAmount: 100, shippingCost: 100,
        }));
        const text = decodeText(bytes);
        expect(text).not.toContain('PEMBULATAN :');
        expect(text).toContain('16.642.500,00');
        expect(text).toContain('1.649.238,92');
        expect(text).toContain('100,25');
        expect(countLines(bytes)).toBeLessThanOrEqual(pageLengthLines(bytes));
    });

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
        expect(text).toContain(data.bankAccounts[0].holder);
        expect(text).toContain(data.bankAccounts[0].bank);
        expect(text).toContain(data.bankAccounts[0].account);
        expect(text).toContain('DISKON :');
        expect(text).toContain('DPP :');
        expect(text).toContain('DPP Nilai Lain :');
        expect(text).toContain('PPN :');
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
        expect(text).not.toContain('DPP Nilai Lain :');
        expect(text).not.toContain('PPN :');
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
        expect(text).toContain('PPN :');
    });

    it('prints DPP Nilai Lain as DPP x 11/12 on a PPN invoice', () => {
        // Arrange
        const data = baseData({
            isPPN: true,
            taxAmount: 231000,
            dpp: 2100000,
        });

        // Act
        const lines = textLines(generateEscpInvoice(data)).map((l) => l.text);
        const row = lines.find((l) => l.includes('DPP Nilai Lain :'));

        // Assert — 2100000 * 11 / 12 = 1925000.00
        expect(row).toBeDefined();
        expect(row).toContain('1.925.000,00');
    });

    it('prints one A/N line per configured bank account, in order', () => {
        // Arrange — a company can have more than one PPN account.
        const data = baseData({
            isPPN: true,
            taxAmount: 231000,
            bankAccounts: [
                {
                    holder: 'PT Contoh Sejahtera',
                    bank: 'Bank Satu',
                    account: '1111111111',
                },
                {
                    // Trailing space mirrors messy real-world data entry —
                    // must not leak into the printed line.
                    holder: 'PT Contoh Sejahtera ',
                    bank: 'Bank Dua',
                    account: '2222222222',
                },
            ],
        });

        // Act — the left (bank) and right (summary) columns share a
        // physical line, so match by substring rather than exact line text.
        const lines = textLines(generateEscpInvoice(data)).map((l) => l.text);

        // Assert
        expect(
            lines.some((l) =>
                l.includes('A/N PT Contoh Sejahtera - Bank Satu : 1111111111'),
            ),
        ).toBe(true);
        expect(
            lines.some((l) =>
                l.includes(
                    'A/N PT Contoh Sejahtera - Bank Dua : 2222222222',
                ),
            ),
        ).toBe(true);
    });
});

describe('generateEscpInvoice — row budget at the narrower 90-column layout', () => {
    it('still fits the page length with every wrap-prone field pushed to a realistic worst case', () => {
        // Narrowing the content width from 108 to 90 columns (this fix)
        // shrinks every wrapText() budget too — most notably infoLeftWidth
        // (58 → 49) and bottomLeftWidth (59 → 50). A company address or
        // contact line that used to fit on one line can now wrap onto two,
        // and the worst-case invoice (diskon+PPN+ongkir) already runs the
        // page length at exactly 33/33 with zero slack — one extra wrapped
        // line here means the invoice spills onto a second physical page.
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
                // A company with two configured bank accounts (a realistic
                // PPN case) plus the DPP Nilai Lain row this scenario now
                // also adds — both eat into the margin measured below.
                bankAccounts: [
                    {
                        holder: 'PT Contoh Sejahtera',
                        bank: 'Bank Satu',
                        account: '1111111111',
                    },
                    {
                        holder: 'PT Contoh Sejahtera',
                        bank: 'Bank Dua',
                        account: '2222222222',
                    },
                ],
            }),
        );
        // Re-measure after adding DPP Nilai Lain + a second bank account:
        // this is the tripwire for the page budget, not the historical
        // "30 of 33" figure quoted before those two rows existed.
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

    it('wraps a long customer address instead of truncating it into the NPWP label', () => {
        // Kasus foto invoice: "JL. Raya Banjaran - balamoa. kaNPWP : -" —
        // alamat kepotong mid-word oleh pad() lalu label NPWP kolom kanan
        // nempel tepat di belakangnya.
        const customerAddress =
            'JL. Raya Banjaran - Balamowa, Kecamatan Kramat, Kabupaten Tegal, Jawa Tengah 52181';
        const text = decodeText(
            generateEscpInvoice(
                baseData({
                    paperWidthCm: 24.13,
                    customerAddress,
                }),
            ),
        );

        expect(text).not.toContain('kaNPWP');
        for (const word of customerAddress.split(' ')) {
            expect(text).toContain(word);
        }
        expect(text).toContain('NPWP');
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

