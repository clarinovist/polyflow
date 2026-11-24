import { ValidationError } from '@/lib/errors/errors';

export const VISIT_PURPOSE_MAX_LENGTH = 300;

/**
 * Normalizes the optional visit purpose at the server boundary:
 * trims, treats empty as null, rejects values over the max length.
 * Legacy callers (queue items without a purpose) pass undefined/null.
 */
export function normalizeVisitPurpose(
    value: string | null | undefined,
): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
        throw new ValidationError('Tujuan kunjungan tidak valid');
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > VISIT_PURPOSE_MAX_LENGTH) {
        throw new ValidationError(
            `Tujuan kunjungan maksimal ${VISIT_PURPOSE_MAX_LENGTH} karakter`,
        );
    }
    return trimmed;
}

/**
 * Update fragment that fills purpose only when the stored value is still
 * empty. Never overwrites an existing purpose.
 */
export function purposeBackfill(
    stored: string | null | undefined,
    incoming: string | null,
): { purpose?: string } {
    if (stored || !incoming) return {};
    return { purpose: incoming };
}
