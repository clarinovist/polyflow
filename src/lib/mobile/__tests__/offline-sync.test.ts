import { describe, it, expect } from 'vitest';
import {
    calculateBackoff,
    isPermanentError,
} from '../offline-sync';

describe('offline-sync', () => {
    // ── calculateBackoff ──────────────────────────────────────────────
    describe('calculateBackoff', () => {
        it('returns a number > 0 for all attempts', () => {
            for (let i = 0; i < 10; i++) {
                const backoff = calculateBackoff(i);
                expect(backoff).toBeGreaterThan(0);
            }
        });

        it('increases roughly with attempt count', () => {
            const avgB0 = Array.from({ length: 20 }, () => calculateBackoff(0)).reduce((a, b) => a + b, 0) / 20;
            const avgB5 = Array.from({ length: 20 }, () => calculateBackoff(5)).reduce((a, b) => a + b, 0) / 20;
            expect(avgB5).toBeGreaterThan(avgB0);
        });

        it('never exceeds MAX_BACKOFF_MS (60000)', () => {
            for (let i = 0; i < 20; i++) {
                expect(calculateBackoff(20)).toBeLessThanOrEqual(72000); // 60000 + 20% jitter
            }
        });
    });

    // ── isPermanentError ──────────────────────────────────────────────
    describe('isPermanentError', () => {
        it.each([
            [{ status: 400 }, true],
            [{ status: 401 }, true],
            [{ status: 403 }, true],
            [{ status: 404 }, true],
            [{ status: 422 }, true],
            [{ status: 500 }, false],
            [{ status: 502 }, false],
            [{ status: 503 }, false],
            [new Error('Permission denied'), true],
            [new Error('Unauthorized access'), true],
            [new Error('Forbidden'), true],
            [new Error('Not found'), true],
            [new Error('Network error'), false],
            [new Error('Timeout'), false],
            ['string error', false],
            [null, false],
            [undefined, false],
        ])('error %j → permanent=%s', (error, expected) => {
            expect(isPermanentError(error)).toBe(expected);
        });
    });
});
