import {
    REJECTION_REASON_MAX_LENGTH,
    REJECTION_REASON_MIN_LENGTH,
} from '@/lib/sales/expense-claim';
import type { ClaimListItem } from '@/lib/sales/expense-claim-ui';

/** UI-side helpers for the approver and Finance claim screens. Pure, no I/O. */

/** Roles allowed to review claims (mirrors `requireSalesManager`). */
export const CLAIM_REVIEW_ROLES = ['ADMIN', 'MARKETING'] as const;
/** Roles allowed to pay claims (mirrors `requireFinanceMutation`). */
export const CLAIM_PAYMENT_ROLES = ['ADMIN', 'FINANCE'] as const;

export const UNAUTHORIZED_REDIRECT_PATH = '/dashboard?error=Unauthorized';

export const STALE_STATUS_CODE = 'STALE_STATUS';
export const STALE_STATUS_MESSAGE = 'Klaim sudah berubah, muat ulang halaman.';
export const CLAIM_ACTION_FAILED_MESSAGE =
    'Gagal memproses klaim. Periksa koneksi lalu coba lagi.';

export const REVIEW_STATUS_TABS = [
    { status: 'SUBMITTED', label: 'Menunggu' },
    { status: 'APPROVED', label: 'Disetujui' },
    { status: 'REJECTED', label: 'Ditolak' },
    { status: 'PAID', label: 'Dibayar' },
] as const;

export type ReviewStatus = (typeof REVIEW_STATUS_TABS)[number]['status'];

export const DEFAULT_REVIEW_STATUS: ReviewStatus = 'SUBMITTED';

/** Anything that is not one of the four tabs falls back to the waiting queue. */
export function parseReviewStatus(
    raw: string | string[] | undefined,
): ReviewStatus {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const tab = REVIEW_STATUS_TABS.find((item) => item.status === value);
    return tab ? tab.status : DEFAULT_REVIEW_STATUS;
}

/** First problem with the (trimmed) rejection reason, or null when valid. */
export function validateRejectionReason(raw: string): string | null {
    const length = raw.trim().length;
    if (length < REJECTION_REASON_MIN_LENGTH) {
        return `Alasan penolakan minimal ${REJECTION_REASON_MIN_LENGTH} karakter`;
    }
    if (length > REJECTION_REASON_MAX_LENGTH) {
        return `Alasan penolakan maksimal ${REJECTION_REASON_MAX_LENGTH} karakter`;
    }
    return null;
}

export interface ClaimActionFailure {
    error: string;
    code?: string;
}

/** Server messages are shown as-is, except a stale status gets a clear next step. */
export function claimActionErrorMessage(failure: ClaimActionFailure): string {
    return failure.code === STALE_STATUS_CODE
        ? STALE_STATUS_MESSAGE
        : failure.error;
}

export function isStaleStatus(failure: ClaimActionFailure): boolean {
    return failure.code === STALE_STATUS_CODE;
}

/** Row shape the review and payment tables read (serialized `ClaimView`). */
export interface ClaimReviewItem extends ClaimListItem {
    user: { name: string | null } | null;
}
