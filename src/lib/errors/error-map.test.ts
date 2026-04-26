import { describe, expect, it } from 'vitest';

import { AppError, ErrorCode, getUserFriendlyError } from './error-map';

describe('getUserFriendlyError', () => {
    it('returns mapped message for all known error codes', () => {
        for (const code of Object.values(ErrorCode)) {
            const message = getUserFriendlyError(code);
            expect(message).toBeTruthy();
            expect(message.length).toBeGreaterThan(8);
        }
    });

    it('returns fallback message for unknown string code', () => {
        const message = getUserFriendlyError('SOME_UNKNOWN_CODE');
        expect(message).toContain('Unhandled Exception: SOME_UNKNOWN_CODE');
        expect(message).toContain('Terjadi kesalahan tidak terduga');
    });
});

describe('AppError', () => {
    it('uses default mapped message and status 400', () => {
        const err = new AppError(ErrorCode.FORBIDDEN);
        expect(err.name).toBe('AppError');
        expect(err.code).toBe(ErrorCode.FORBIDDEN);
        expect(err.status).toBe(400);
        expect(err.message).toContain('izin');
    });

    it('supports custom message and status', () => {
        const err = new AppError(ErrorCode.NOT_FOUND, 'Custom not found', 404);
        expect(err.code).toBe(ErrorCode.NOT_FOUND);
        expect(err.status).toBe(404);
        expect(err.message).toBe('Custom not found');
    });
});
