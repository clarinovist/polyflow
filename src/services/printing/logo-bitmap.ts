/**
 * Fetches a company logo and converts it into an ESC/P 8-dot bit-image
 * bitmap (band-packed, column-major bytes) for dot matrix printing.
 *
 * Kept separate from escp-generator.ts so that byte generation stays pure
 * and sync — this module owns all the async/native-binary (sharp) work.
 */

export interface EscpLogoBitmap {
    /** Number of columns (dots wide). */
    widthDots: number;
    /** Each band = 8 vertical dots; bands[i] has widthDots bytes. */
    bands: number[][];
}

const BLACK_THRESHOLD = 128;

/**
 * Pure packer: converts a row-major grayscale buffer (0-255 per pixel) into
 * ESC/P bit-image bands (column-major, 1 byte = 8 vertical dots, MSB = top).
 * heightPx is rounded up to the nearest multiple of 8 — any padding rows
 * read past the buffer fall back to white (see the `?? 255` below).
 */
export function packGrayscaleToBands(
    pixels: Uint8Array,
    widthPx: number,
    heightPx: number,
): number[][] {
    const bandCount = Math.ceil(heightPx / 8);
    const bands: number[][] = [];

    for (let band = 0; band < bandCount; band++) {
        const columnBytes: number[] = [];
        for (let x = 0; x < widthPx; x++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const y = band * 8 + bit;
                const pixel = pixels[y * widthPx + x] ?? 255;
                const isBlack = pixel < BLACK_THRESHOLD;
                if (isBlack) {
                    // bit 7 = top dot of the band, bit 0 = bottom dot
                    byte |= 1 << (7 - bit);
                }
            }
            columnBytes.push(byte);
        }
        bands.push(columnBytes);
    }
    return bands;
}

/**
 * Fetches `logoUrl`, resizes/thresholds it into a small monochrome bitmap,
 * and packs it into ESC/P bands. Returns null on any failure — callers must
 * fall back to text-only printing, never fail the invoice print for a logo.
 */
export async function buildEscpLogoBitmap(
    logoUrl: string,
    opts: { maxWidthDots?: number; heightDots?: number } = {},
): Promise<EscpLogoBitmap | null> {
    const maxWidthDots = opts.maxWidthDots ?? 160;
    const heightDots = opts.heightDots ?? 16; // 2 bands @ 8 dots

    try {
        const res = await fetch(logoUrl);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();

        const sharp = (await import('sharp')).default;
        const { data, info } = await sharp(Buffer.from(arrayBuffer))
            .resize({
                width: maxWidthDots,
                height: heightDots,
                fit: 'inside',
                withoutEnlargement: false,
            })
            .flatten({ background: '#ffffff' }) // drop alpha onto white bg
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const widthPx = info.width;
        // Pad height up to a multiple of 8 with white pixels.
        const paddedHeight = Math.ceil(info.height / 8) * 8;
        const padded = new Uint8Array(widthPx * paddedHeight).fill(255);
        padded.set(data.subarray(0, widthPx * info.height));

        return {
            widthDots: widthPx,
            bands: packGrayscaleToBands(padded, widthPx, paddedHeight),
        };
    } catch (error) {
        console.error(
            '[Logo Bitmap] Failed to build ESC/P logo bitmap:',
            error,
        );
        return null;
    }
}
