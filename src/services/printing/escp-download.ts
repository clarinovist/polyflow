/**
 * Shared HTTP shape for ESC/P downloads: every print route hands the browser
 * the same kind of `.prn` attachment, which the operator then sends straight
 * to the dot matrix printer.
 */

import { NextResponse } from 'next/server';

/** Convert ESC/P byte array to a Uint8Array for download. */
export function toUint8Array(bytes: number[]): Uint8Array {
    return new Uint8Array(bytes);
}

export function toSafeDownloadFilename(
    value: string,
    fallback = 'document',
): string {
    return (
        value
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/\s+/g, ' ')
            .trim() || fallback
    );
}

/** Binary attachment response — `filename` is sanitized here, not by callers. */
export function escpAttachmentResponse(
    bytes: number[],
    filename: string,
): NextResponse {
    const buffer = Buffer.from(toUint8Array(bytes));

    return new NextResponse(buffer, {
        status: 200,
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${toSafeDownloadFilename(filename)}.prn"`,
            'Content-Length': buffer.length.toString(),
        },
    });
}
