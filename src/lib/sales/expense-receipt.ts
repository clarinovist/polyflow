/**
 * Pure helpers for expense-claim receipt (nota) images. One source of truth for
 * the object-key format so the upload route and the claim service agree on it.
 *
 * Key:  {tenant}/expense-receipt/{userId}/{timestamp}.{ext}
 * URL:  /api/images/{key}   (what `uploadToR2` returns; relative, no host)
 */

const IMAGE_URL_PREFIX = '/api/images/';
const RECEIPT_SEGMENT = 'expense-receipt';
const DEFAULT_RECEIPT_EXTENSION = 'jpg';

/**
 * Canonical MIME to the only file extension an uploaded receipt may carry.
 * Limited to what the image proxy (/api/images) can serve: it has no HEIC/HEIF
 * content type, so such a receipt would upload fine and then never display.
 */
export const EXPENSE_RECEIPT_MIME_EXTENSIONS: Readonly<Record<string, string>> =
    {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };

const FILENAME_EXTENSION_MIME: Readonly<Record<string, string>> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
};

const ALLOWED_EXTENSIONS = new Set(
    Object.values(EXPENSE_RECEIPT_MIME_EXTENSIONS),
);
const KEY_FILE_PATTERN = /^\d{1,16}\.([a-z0-9]{1,5})$/;
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * Resolves the canonical image MIME for an upload, or null when it is not an
 * allowed image. An empty MIME (iOS Safari / shared screenshots) falls back to
 * the filename extension; a non-empty MIME is never overridden by the name.
 */
export function resolveReceiptMime(
    mime: string,
    filename: string,
): string | null {
    const normalized = mime.trim().toLowerCase();
    if (normalized) {
        return normalized in EXPENSE_RECEIPT_MIME_EXTENSIONS
            ? normalized
            : null;
    }
    const dot = filename.lastIndexOf('.');
    if (dot < 0) return null;
    const ext = filename.slice(dot + 1).toLowerCase();
    return FILENAME_EXTENSION_MIME[ext] ?? null;
}

/** Extension for an already-resolved canonical MIME. */
export function receiptExtensionForMime(mime: string): string {
    return EXPENSE_RECEIPT_MIME_EXTENSIONS[mime] ?? DEFAULT_RECEIPT_EXTENSION;
}

export function buildExpenseReceiptObjectKey(
    tenant: string,
    userId: string,
    extension: string,
    timestamp: number = Date.now(),
): string {
    const ext = ALLOWED_EXTENSIONS.has(extension)
        ? extension
        : DEFAULT_RECEIPT_EXTENSION;
    return `${tenant}/${RECEIPT_SEGMENT}/${userId}/${timestamp}.${ext}`;
}

export function expenseReceiptUrlPrefix(
    tenant: string,
    userId: string,
): string {
    return `${IMAGE_URL_PREFIX}${tenant}/${RECEIPT_SEGMENT}/${userId}/`;
}

/**
 * True only for a URL produced by the upload route for this exact tenant and
 * user: exact prefix, then a single `{digits}.{allowed-ext}` file name. Rejects
 * other hosts/schemes, traversal, query/fragment, encoded characters and any
 * other user's or tenant's receipt.
 */
export function isOwnExpenseReceiptUrl(
    url: string,
    tenant: string,
    userId: string,
): boolean {
    if (
        !SAFE_SEGMENT_PATTERN.test(tenant) ||
        !SAFE_SEGMENT_PATTERN.test(userId)
    )
        return false;
    const prefix = expenseReceiptUrlPrefix(tenant, userId);
    if (!url.startsWith(prefix)) return false;
    const match = KEY_FILE_PATTERN.exec(url.slice(prefix.length));
    return match !== null && ALLOWED_EXTENSIONS.has(match[1]);
}
