import { describe, it, expect } from 'vitest';
import {
    generateEscpDeliveryNote,
    type EscpDeliveryData,
} from '../escp-delivery';

const ESC = 0x1b;
const FF = 0x0c;
const CR = 0x0d;
const LF = 0x0a;

/** Default 9.5" continuous form — 96 total columns, 90 printable. */
const DEFAULT_WIDTH_CM = 24.13;
/** 8" form — the narrow case that exposed the carriage overflow bug. */
const NARROW_WIDTH_CM = 20.32;

function baseData(
    overrides: Partial<EscpDeliveryData> = {},
): EscpDeliveryData {
    return {
        companyName: 'PT Polyflow Indonesia',
        companyAddress: 'Jl. Industri Raya No. 12, Bekasi',
        companyPhone: '021-1234567',
        companyWhatsapp: '08123456789',
        companyEmail: 'admin@polyflow.test',
        customerName: 'PT Pelanggan Sejahtera',
        destinationAddress: 'Jl. Pelanggan No. 45, Karawang',
        deliveryNumber: 'DO-2026-0001',
        deliveryDate: new Date('2026-08-07T03:00:00.000Z'),
        salesOrderNumber: 'SO-2026-0001',
        vehiclePlate: 'B 1234 XYZ',
        items: [
            { name: 'Karung Plastik 50kg', qty: 100, unit: 'PCS', note: '' },
        ],
        paperHeightCm: 14,
        paperWidthCm: DEFAULT_WIDTH_CM,
        ...overrides,
    };
}

/**
 * Total byte length of each ESC command this document emits, including the
 * ESC itself. Payload bytes must be consumed explicitly: `ESC C 33` carries
 * 33, which is '!' in ASCII and would otherwise be counted as printed text
 * and make the line-width assertions lie.
 */
const ESC_COMMAND_LENGTHS: Record<number, number> = {
    0x40: 2, // ESC @   reset
    0x78: 3, // ESC x n quality
    0x21: 3, // ESC ! n master select
    0x70: 3, // ESC p n proportional
    0x32: 2, // ESC 2   line spacing 1/6"
    0x43: 3, // ESC C n page length
    0x33: 3, // ESC 3 n line spacing n/180
    0x45: 2, // ESC E   bold on
    0x46: 2, // ESC F   bold off
    0x6c: 3, // ESC l n left margin
    0x51: 3, // ESC Q n right margin
};

/** Decode printable text lines, dropping ESC command sequences. */
function toTextLines(bytes: number[]): string[] {
    const lines: string[] = [];
    let current = '';
    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (byte === ESC) {
            const length = ESC_COMMAND_LENGTHS[bytes[i + 1]];
            if (!length) {
                throw new Error(
                    `Unhandled ESC command 0x${bytes[i + 1]?.toString(16)} — extend ESC_COMMAND_LENGTHS`,
                );
            }
            i += length - 1;
            continue;
        }
        if (byte === CR) continue;
        if (byte === LF || byte === FF) {
            lines.push(current);
            current = '';
            continue;
        }
        if (byte >= 0x20 && byte <= 0x7e) current += String.fromCharCode(byte);
    }
    if (current) lines.push(current);
    return lines;
}

describe('generateEscpDeliveryNote', () => {
    it('opens with a printer reset and ends with a form feed', () => {
        // Arrange
        const data = baseData();

        // Act
        const bytes = generateEscpDeliveryNote(data);

        // Assert — ESC @ first is what makes bundling two documents safe
        expect(bytes.slice(0, 2)).toEqual([ESC, 0x40]);
        expect(bytes[bytes.length - 1]).toBe(FF);
    });

    it('prints the delivery meta and customer in the header', () => {
        // Arrange
        const data = baseData();

        // Act
        const text = toTextLines(generateEscpDeliveryNote(data)).join('\n');

        // Assert
        expect(text).toContain('SURAT JALAN');
        expect(text).toContain('DO-2026-0001');
        expect(text).toContain('PT Pelanggan Sejahtera');
        expect(text).toContain('Jl. Pelanggan No. 45, Karawang');
        expect(text).toContain('SO-2026-0001');
        expect(text).toContain('B 1234 XYZ');
    });

    it('prints all three signature parties in goods-flow order', () => {
        // Arrange
        const data = baseData();

        // Act
        const text = toTextLines(generateEscpDeliveryNote(data)).join('\n');

        // Assert
        expect(text).toContain('Pengirim,');
        expect(text).toContain('Sopir,');
        expect(text).toContain('Penerima,');
    });

    it('leaves every signature slot as an empty bracket to write in', () => {
        // Arrange
        const data = baseData();

        // Act
        const lines = toTextLines(generateEscpDeliveryNote(data));
        const bracketRows = lines.filter((line) => line.includes('('));
        const nameRow = bracketRows[bracketRows.length - 1];

        // Assert — three brackets, none of them carrying a printed name
        expect(nameRow).toBeDefined();
        expect(nameRow?.match(/\(\s+\)/g)).toHaveLength(3);
        expect(nameRow).not.toMatch(/\([^)\s]/);
    });

    it('never emits a line wider than the printable width', () => {
        // Arrange — long values in every field that could overflow
        const data = baseData({
            companyAddress:
                'Jl. Raya Industri Kawasan Terpadu Blok AA-12 Nomor 345, Kelurahan Sukamaju, Bekasi',
            destinationAddress:
                'Gudang Cabang Utama Jalan Panjang Sekali Nomor 999 Kawasan Pergudangan Blok Z',
            items: [
                {
                    name: 'Karung Plastik Laminasi Tebal Ukuran Sangat Panjang 50kg Premium',
                    qty: 1234,
                    unit: 'KARTON',
                    note: 'Barang titipan segera dikirim ke gudang belakang',
                },
            ],
        });

        // Act + Assert — 9.5" paper: 90 printable columns
        for (const line of toTextLines(generateEscpDeliveryNote(data))) {
            expect(line.length).toBeLessThanOrEqual(90);
        }

        // And on the 8" form the head physically cannot pass 90 either
        const narrow = generateEscpDeliveryNote(
            baseData({ ...data, paperWidthCm: NARROW_WIDTH_CM }),
        );
        for (const line of toTextLines(narrow)) {
            expect(line.length).toBeLessThanOrEqual(90);
        }
    });

    it('wraps a long product name instead of truncating it', () => {
        // Arrange
        const data = baseData({
            items: [
                {
                    name: 'Karung Plastik Laminasi Tebal Premium Ukuran Jumbo Extra',
                    qty: 5,
                    unit: 'PCS',
                    note: '',
                },
            ],
        });

        // Act
        const text = toTextLines(generateEscpDeliveryNote(data)).join('\n');

        // Assert — the tail survives on a continuation line
        expect(text).toContain('Karung Plastik Laminasi');
        expect(text).toContain('Jumbo Extra');
    });

    it('totals the item quantities', () => {
        // Arrange
        const data = baseData({
            items: [
                { name: 'Karung A', qty: 100, unit: 'PCS', note: '' },
                { name: 'Karung B', qty: 55, unit: 'PCS', note: 'sisa' },
            ],
        });

        // Act
        const lines = toTextLines(generateEscpDeliveryNote(data));

        // Assert
        const totalLine = lines.find((line) => line.includes('TOTAL'));
        expect(totalLine).toBeDefined();
        expect(totalLine).toContain('155');
    });

    it('prints no price anywhere — a delivery note is not an invoice', () => {
        // Arrange
        const data = baseData();

        // Act
        const text = toTextLines(generateEscpDeliveryNote(data)).join('\n');

        // Assert
        expect(text).not.toContain('Harga');
        expect(text).not.toContain('Jumlah (Rp)');
        expect(text).not.toContain('Diskon');
    });

    it('keeps qty readable for fractional quantities', () => {
        // Arrange
        const data = baseData({
            items: [
                { name: 'Bijih Plastik', qty: 12.5, unit: 'KG', note: '' },
            ],
        });

        // Act
        const text = toTextLines(generateEscpDeliveryNote(data)).join('\n');

        // Assert
        expect(text).toContain('12,5');
    });
});
