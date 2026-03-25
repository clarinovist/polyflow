import { rateLimit } from '../api/rate-limit';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('rate-limit utility', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Clear env vars that might affect tests
        process.env.RATE_LIMIT_MAX = '5';
        process.env.RATE_LIMIT_WINDOW_MS = '60000';
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should allow requests up to the defined limit', () => {
        const ip = '10.0.0.1';
        
        for (let i = 0; i < 4; i++) {
            const res = rateLimit(ip);
            expect(res.success).toBe(true);
            expect(res.remaining).toBe(5 - i - 1);
        }

        const finalTarget = rateLimit(ip);
        expect(finalTarget.success).toBe(true);
        expect(finalTarget.remaining).toBe(0);
    });

    it('should block requests that exceed the limit', () => {
        const ip = '10.0.0.2';
        
        // Exhaust the limit
        for (let i = 0; i < 5; i++) {
            rateLimit(ip);
        }

        // 6th request should be blocked
        const blockedRes = rateLimit(ip);
        expect(blockedRes.success).toBe(false);
        expect(blockedRes.remaining).toBe(0);
    });

    it('should reset the limit after the window expires', () => {
        const ip = '10.0.0.3';
        
        // Exhaust
        for (let i = 0; i < 5; i++) {
            rateLimit(ip);
        }
        
        expect(rateLimit(ip).success).toBe(false);

        // Advance timers past window
        vi.advanceTimersByTime(61000);

        // Should be allowed again
        const resetRes = rateLimit(ip);
        expect(resetRes.success).toBe(true);
        expect(resetRes.remaining).toBe(4);
    });

    it('should track limits per IP independently', () => {
        const ip1 = '192.168.1.1';
        const ip2 = '192.168.1.2';
        
        for (let i = 0; i < 5; i++) {
            rateLimit(ip1);
        }

        expect(rateLimit(ip1).success).toBe(false);
        // But ip2 should still be allowed
        expect(rateLimit(ip2).success).toBe(true);
    });
});
