import { describe, expect, it } from 'vitest';
import {
    CLAIM_PAYMENT_ROLES,
    CLAIM_REVIEW_ROLES,
    STALE_STATUS_MESSAGE,
    claimActionErrorMessage,
    isStaleStatus,
    parseReviewStatus,
    validateRejectionReason,
} from '../expense-claim-review';

describe('parseReviewStatus', () => {
    it.each(['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'])(
        'accepts the %s tab',
        (status) => {
            expect(parseReviewStatus(status)).toBe(status);
        },
    );

    it('falls back to SUBMITTED for unknown, cancelled or missing values', () => {
        expect(parseReviewStatus('CANCELLED')).toBe('SUBMITTED');
        expect(parseReviewStatus('junk')).toBe('SUBMITTED');
        expect(parseReviewStatus(undefined)).toBe('SUBMITTED');
    });

    it('uses the first value when the param is repeated', () => {
        expect(parseReviewStatus(['PAID', 'APPROVED'])).toBe('PAID');
    });
});

describe('validateRejectionReason', () => {
    it('rejects a reason shorter than 3 characters after trimming', () => {
        expect(validateRejectionReason('  ab  ')).toBe(
            'Alasan penolakan minimal 3 karakter',
        );
        expect(validateRejectionReason('')).not.toBeNull();
    });

    it('rejects a reason longer than 300 characters', () => {
        expect(validateRejectionReason('x'.repeat(301))).toBe(
            'Alasan penolakan maksimal 300 karakter',
        );
    });

    it('accepts the 3 and 300 character boundaries', () => {
        expect(validateRejectionReason('abc')).toBeNull();
        expect(validateRejectionReason(`  ${'x'.repeat(300)}  `)).toBeNull();
    });
});

describe('claimActionErrorMessage', () => {
    it('shows the server message as-is', () => {
        const failure = {
            error: 'Anda tidak boleh meninjau klaim yang diajukan sendiri',
            code: 'SELF_APPROVAL_NOT_ALLOWED',
        };
        expect(claimActionErrorMessage(failure)).toBe(failure.error);
        expect(isStaleStatus(failure)).toBe(false);
    });

    it('replaces a stale-status failure with a reload hint', () => {
        const failure = {
            error: 'Klaim x sudah berubah status, silakan refresh',
            code: 'STALE_STATUS',
        };
        expect(claimActionErrorMessage(failure)).toBe(STALE_STATUS_MESSAGE);
        expect(isStaleStatus(failure)).toBe(true);
    });
});

describe('claim page roles', () => {
    it('keeps reviewers to ADMIN and MARKETING and payers to ADMIN and FINANCE', () => {
        expect([...CLAIM_REVIEW_ROLES]).toEqual(['ADMIN', 'MARKETING']);
        expect([...CLAIM_PAYMENT_ROLES]).toEqual(['ADMIN', 'FINANCE']);
    });
});
