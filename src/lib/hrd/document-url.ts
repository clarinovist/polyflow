/**
 * Validation for document URLs stored on HRD records (employee documents,
 * disciplinary actions, leave requests). The value is later rendered as a
 * link/`<img>`, so only same-origin proxy paths and https URLs are accepted;
 * `javascript:`, `data:`, protocol-relative and plain-http URLs are not.
 */

import { BusinessRuleError } from '@/lib/errors/errors';

const IMAGE_PROXY_PREFIX = '/api/images/';
const HTTPS_PREFIX = 'https://';
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const UNSAFE_DOCUMENT_URL_MESSAGE =
    'Tautan dokumen tidak valid. Unggah ulang dokumen melalui tombol unggah.';

function hasTraversal(value: string): boolean {
    if (value.includes('..')) return true;
    try {
        return decodeURIComponent(value).includes('..');
    } catch {
        // Malformed percent-encoding is never produced by the upload route.
        return true;
    }
}

function isSafeProxyPath(url: string): boolean {
    if (!url.startsWith(IMAGE_PROXY_PREFIX)) return false;
    if (url.length === IMAGE_PROXY_PREFIX.length) return false;
    if (url.includes('//') || url.includes('\\')) return false;
    return !hasTraversal(url);
}

function isSafeHttpsUrl(url: string): boolean {
    if (!url.startsWith(HTTPS_PREFIX)) return false;
    try {
        const parsed = new URL(url);
        return (
            parsed.protocol === 'https:' &&
            parsed.hostname.length > 0 &&
            !parsed.username &&
            !parsed.password
        );
    } catch {
        return false;
    }
}

export function isSafeDocumentUrl(url: string): boolean {
    if (typeof url !== 'string' || !url || CONTROL_CHARS.test(url)) {
        return false;
    }
    return isSafeProxyPath(url) || isSafeHttpsUrl(url);
}

/** Throws BusinessRuleError when a url is present but unsafe; absent urls pass. */
export function assertSafeDocumentUrl(url: string | null | undefined): void {
    if (!url) return;
    if (!isSafeDocumentUrl(url)) {
        throw new BusinessRuleError(UNSAFE_DOCUMENT_URL_MESSAGE);
    }
}
