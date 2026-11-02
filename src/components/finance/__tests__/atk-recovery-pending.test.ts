// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPendingAtkRecovery } from '../atk-recovery-pending';
import { isAtkNotAppliedFailure } from '../atk-recovery-errors';

const scope = 'tenant:actor';
const storageKey = `atk-recovery:v1:${scope}`;

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('clearPendingAtkRecovery', () => {
    it('clears a matching request', () => {
        sessionStorage.setItem(
            storageKey,
            JSON.stringify({ requestId: 'req-1' }),
        );
        clearPendingAtkRecovery(scope, 'req-1');
        expect(sessionStorage.getItem(storageKey)).toBeNull();
    });

    it('keeps a different pending request', () => {
        const raw = JSON.stringify({ requestId: 'req-2' });
        sessionStorage.setItem(storageKey, raw);
        clearPendingAtkRecovery(scope, 'req-1');
        expect(sessionStorage.getItem(storageKey)).toBe(raw);
    });

    it('clears unreadable state without throwing so a committed apply stays successful', () => {
        sessionStorage.setItem(storageKey, '{not-json');
        expect(() => clearPendingAtkRecovery(scope, 'req-1')).not.toThrow();
        expect(sessionStorage.getItem(storageKey)).toBeNull();
    });

    it('does not throw when storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage blocked');
        });
        expect(() => clearPendingAtkRecovery(scope, 'req-1')).not.toThrow();
    });
});

describe('isAtkNotAppliedFailure', () => {
    it.each([
        'ATK_RECOVERY_BLOCKED',
        'PURCHASE_PRICE_CORRECTED',
        'ATK_BACKUP_FAILED',
        'VALIDATION_ERROR',
        'AUTHORIZATION_ERROR',
        'BUSINESS_RULE_VIOLATION',
        'FISCAL_PERIOD_CLOSED',
    ])('treats %s as a safe pre-commit rejection', (code) => {
        expect(isAtkNotAppliedFailure(code)).toBe(true);
    });

    it('keeps the lock for unknown or missing codes', () => {
        expect(isAtkNotAppliedFailure(undefined)).toBe(false);
        expect(isAtkNotAppliedFailure(null)).toBe(false);
        expect(isAtkNotAppliedFailure('SOMETHING_ELSE')).toBe(false);
    });
});
