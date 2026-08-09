import { describe, expect, it } from 'vitest';
import { shouldSuppressExpectedAuthError } from '../auth-log-filter';

function authError(type: string, causeMessage?: string) {
    const error = Object.assign(new Error(`Read more: ${type}`), { type });
    if (causeMessage) {
        Object.assign(error, { cause: { err: new Error(causeMessage) } });
    }
    return error;
}

describe('shouldSuppressExpectedAuthError', () => {
    it('suppresses expected CredentialsSignin errors', () => {
        expect(shouldSuppressExpectedAuthError(authError('CredentialsSignin'))).toBe(
            true,
        );
    });

    it('suppresses legacy CallbackRouteError wrapping UserNotFound', () => {
        expect(
            shouldSuppressExpectedAuthError(
                authError('CallbackRouteError', 'UserNotFound'),
            ),
        ).toBe(true);
    });

    it('suppresses legacy CallbackRouteError wrapping UserInactive', () => {
        expect(
            shouldSuppressExpectedAuthError(
                authError('CallbackRouteError', 'UserInactive'),
            ),
        ).toBe(true);
    });

    it('suppresses CallbackRouteError wrapping LoginRateLimited', () => {
        expect(
            shouldSuppressExpectedAuthError(
                authError('CallbackRouteError', 'LoginRateLimited'),
            ),
        ).toBe(true);
    });

    it('does not suppress tenant resolution failures', () => {
        expect(
            shouldSuppressExpectedAuthError(
                authError('CallbackRouteError', 'TenantResolutionFailed'),
            ),
        ).toBe(false);
    });

    it('does not suppress tenant suspended errors because the UI maps them explicitly', () => {
        expect(
            shouldSuppressExpectedAuthError(
                authError('CallbackRouteError', 'TenantSuspended'),
            ),
        ).toBe(false);
    });

    it('does not suppress unknown callback errors', () => {
        expect(
            shouldSuppressExpectedAuthError(
                authError('CallbackRouteError', 'DatabaseConnectionTimeout'),
            ),
        ).toBe(false);
    });
});
