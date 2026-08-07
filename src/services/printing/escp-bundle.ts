/**
 * Bundle parsing for `/api/print/bundle?doc=<type>:<id>&doc=...`.
 *
 * Kept out of the route so the validation rules are unit-testable without an
 * HTTP layer. Concatenating the streams themselves needs no special format:
 * every generator opens with ESC @ (full reset) and closes with a form feed,
 * so documents cannot bleed state into each other.
 */

/** Ceiling on one request, so a crafted URL cannot generate unbounded bytes. */
export const MAX_BUNDLE_DOCS = 10;

const DOC_PATTERN = /^(delivery|invoice):([\w-]+)$/;

export type BundleDocType = 'delivery' | 'invoice';

export interface BundleDocRef {
    type: BundleDocType;
    id: string;
}

export interface BundleParseResult {
    docs: BundleDocRef[];
    /** Human-readable reason the request is unusable; null when valid. */
    error: string | null;
}

/**
 * Parse the repeated `doc` parameters, preserving order — the caller decides
 * the print order (the UI sends surat jalan first, then invoice).
 */
export function parseBundleDocs(rawDocs: string[]): BundleParseResult {
    if (rawDocs.length === 0) {
        return {
            docs: [],
            error: 'Missing doc parameter. Use doc=delivery:<id> or doc=invoice:<id>.',
        };
    }

    if (rawDocs.length > MAX_BUNDLE_DOCS) {
        return {
            docs: [],
            error: `Too many documents: ${rawDocs.length} requested, maximum is ${MAX_BUNDLE_DOCS}.`,
        };
    }

    const docs: BundleDocRef[] = [];
    for (const raw of rawDocs) {
        const match = DOC_PATTERN.exec(raw.trim());
        if (!match) {
            return {
                docs: [],
                error: `Invalid doc "${raw}". Expected delivery:<id> or invoice:<id>.`,
            };
        }
        docs.push({ type: match[1] as BundleDocType, id: match[2] });
    }

    return { docs, error: null };
}
