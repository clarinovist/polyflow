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
