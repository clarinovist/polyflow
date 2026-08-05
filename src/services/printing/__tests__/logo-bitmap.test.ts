import { describe, expect, it, vi, afterEach } from 'vitest';
import {
    buildEscpLogoBitmap,
    packGrayscaleToBands,
} from '@/services/printing/logo-bitmap';

describe('packGrayscaleToBands', () => {
    it('packs a solid black 8x8 image into a single band with all bits set', () => {
        const pixels = new Uint8Array(8 * 8).fill(0); // 0 = black
        const bands = packGrayscaleToBands(pixels, 8, 8);

        expect(bands).toHaveLength(1);
        expect(bands[0]).toEqual(new Array(8).fill(0xff));
    });

    it('packs a solid white image into a single band with all bits clear', () => {
        const pixels = new Uint8Array(8 * 8).fill(255); // 255 = white
        const bands = packGrayscaleToBands(pixels, 8, 8);

        expect(bands[0]).toEqual(new Array(8).fill(0x00));
    });

    it('puts the top row in bit 7 and the bottom row in bit 0', () => {
        // 1 column wide, 8 rows tall: only the top pixel is black.
        const pixels = new Uint8Array(8).fill(255);
        pixels[0] = 0; // top row, black
        const bands = packGrayscaleToBands(pixels, 1, 8);

        expect(bands[0][0]).toBe(0b10000000);
    });

    it('produces one band per 8 rows for multi-band images', () => {
        const pixels = new Uint8Array(4 * 16).fill(255);
        const bands = packGrayscaleToBands(pixels, 4, 16);

        expect(bands).toHaveLength(2);
        expect(bands[0]).toHaveLength(4);
        expect(bands[1]).toHaveLength(4);
    });

    it('rounds height up to the next multiple of 8, padding with white', () => {
        const pixels = new Uint8Array(4 * 10).fill(0); // all black, 10 rows
        const bands = packGrayscaleToBands(pixels, 4, 10);

        expect(bands).toHaveLength(2); // ceil(10/8) = 2 bands
        // Rows 10-15 (out of bounds) must read as white, not black.
        expect(bands[1]).toEqual(new Array(4).fill(0b11000000));
    });
});

describe('buildEscpLogoBitmap', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('returns null when the fetch fails (never throws)', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: false, status: 404 }),
        );

        const result = await buildEscpLogoBitmap('https://example.com/logo.png');
        expect(result).toBeNull();
    });

    it('returns null when fetch throws a network error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockRejectedValue(new Error('network down')),
        );

        const result = await buildEscpLogoBitmap('https://example.com/logo.png');
        expect(result).toBeNull();
    });

    it('builds a bitmap from a real solid-color PNG via sharp', async () => {
        const sharp = (await import('sharp')).default;
        const pngBuffer = await sharp({
            create: {
                width: 40,
                height: 20,
                channels: 3,
                background: { r: 0, g: 0, b: 0 },
            },
        })
            .png()
            .toBuffer();

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: async () =>
                    pngBuffer.buffer.slice(
                        pngBuffer.byteOffset,
                        pngBuffer.byteOffset + pngBuffer.byteLength,
                    ),
            }),
        );

        const result = await buildEscpLogoBitmap('https://example.com/logo.png', {
            maxWidthDots: 40,
            heightDots: 16,
        });

        expect(result).not.toBeNull();
        expect(result?.widthDots).toBeGreaterThan(0);
        expect(result?.bands.length).toBeGreaterThan(0);
        // Solid black source -> every packed byte should be fully set.
        for (const band of result?.bands ?? []) {
            for (const byte of band) {
                expect(byte).toBe(0xff);
            }
        }
    });
});
