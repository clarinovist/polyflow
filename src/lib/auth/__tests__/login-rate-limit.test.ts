import { describe, expect, it, vi, afterEach } from 'vitest';
import {
    checkMainLoginRateLimit,
    MAIN_LOGIN_RATE_LIMIT_MESSAGE,
} from '../login-rate-limit';

const makeInput = (overrides: Partial<Parameters<typeof checkMainLoginRateLimit>[0]> = {}) => ({
    ip: '10.88.0.1',
    email: 'User@Example.com ',
    subdomain: ' Tenant-A ',
    ...overrides,
});

describe('checkMainLoginRateLimit', () => {
    afterEach(() => {
        vi.useRealTimers();
        delete process.env.LOGIN_RATE_LIMIT_IP_MAX;
        delete process.env.LOGIN_RATE_LIMIT_IDENTITY_MAX;
        delete process.env.LOGIN_RATE_LIMIT_WINDOW_MS;
    });

    it('allows attempts below the identity limit', () => {
        const input = makeInput({ ip: '10.88.0.10' });

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const result = checkMainLoginRateLimit(input);
            expect(result.success).toBe(true);
        }
    });

    it('blocks the sixth attempt for the same IP tenant and email', () => {
        const input = makeInput({ ip: '10.88.0.20' });

        for (let attempt = 0; attempt < 5; attempt += 1) {
            checkMainLoginRateLimit(input);
        }

        const blocked = checkMainLoginRateLimit(input);
        expect(blocked).toEqual({
            success: false,
            reason: 'identity',
            message: MAIN_LOGIN_RATE_LIMIT_MESSAGE,
        });
    });

    it('keeps identity buckets separate per normalized tenant and email', () => {
        const base = makeInput({ ip: '10.88.0.30' });

        for (let attempt = 0; attempt < 5; attempt += 1) {
            checkMainLoginRateLimit(base);
        }

        const otherEmail = checkMainLoginRateLimit({
            ...base,
            email: 'Other@Example.com',
        });
        const otherTenant = checkMainLoginRateLimit({
            ...base,
            subdomain: 'tenant-b',
        });

        expect(otherEmail.success).toBe(true);
        expect(otherTenant.success).toBe(true);
    });

    it('blocks IP-level bursts even when the attacker rotates emails', () => {
        process.env.LOGIN_RATE_LIMIT_IP_MAX = '3';
        const ip = '10.88.0.40';

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const result = checkMainLoginRateLimit(
                makeInput({ ip, email: `user-${attempt}@example.com` }),
            );
            expect(result.success).toBe(true);
        }

        const blocked = checkMainLoginRateLimit(
            makeInput({ ip, email: 'rotated@example.com' }),
        );
        expect(blocked).toEqual({
            success: false,
            reason: 'ip',
            message: MAIN_LOGIN_RATE_LIMIT_MESSAGE,
        });
    });

    it('resets the rate limit after the configured window expires', () => {
        vi.useFakeTimers();
        process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '1000';
        const input = makeInput({ ip: '10.88.0.50' });

        for (let attempt = 0; attempt < 5; attempt += 1) {
            checkMainLoginRateLimit(input);
        }
        expect(checkMainLoginRateLimit(input).success).toBe(false);

        vi.advanceTimersByTime(1001);

        expect(checkMainLoginRateLimit(input).success).toBe(true);
    });
});
