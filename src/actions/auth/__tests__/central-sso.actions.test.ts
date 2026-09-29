import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    headers: vi.fn(),
    cookies: vi.fn(),
    setCookie: vi.fn(),
    signIn: vi.fn(),
}));

vi.mock('next/headers', () => ({
    headers: mocks.headers,
    cookies: mocks.cookies,
}));
vi.mock('@/auth', () => ({ signIn: mocks.signIn }));
vi.mock('@/lib/auth/central-oidc-config', () => ({
    isCentralSsoConfigured: vi.fn(() => true),
}));

import { startCentralGoogleLogin } from '../central-sso.actions';

describe('startCentralGoogleLogin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.headers.mockResolvedValue(
            new Headers({ 'x-tenant-subdomain': 'tenant-a' }),
        );
        mocks.cookies.mockResolvedValue({ set: mocks.setCookie });
        mocks.signIn.mockRejectedValue(new Error('NEXT_REDIRECT'));
    });

    it('starts OIDC on the current tenant without persisting an invite', async () => {
        await expect(startCentralGoogleLogin()).rejects.toThrow('NEXT_REDIRECT');
        expect(mocks.setCookie).not.toHaveBeenCalled();
        expect(mocks.signIn).toHaveBeenCalledWith(
            'central-oidc',
            { redirectTo: '/dashboard' },
            { prompt: 'select_account' },
        );
    });

    it('stores a valid invitation only in an HttpOnly temporary cookie', async () => {
        const token = 'synthetic-invitation-token-that-is-long-enough-123456';
        await expect(startCentralGoogleLogin(token)).rejects.toThrow(
            'NEXT_REDIRECT',
        );
        expect(mocks.setCookie).toHaveBeenCalledWith(
            expect.any(String),
            token,
            expect.objectContaining({
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                maxAge: 900,
            }),
        );
    });

    it('rejects an invalid invitation before starting OIDC', async () => {
        await expect(startCentralGoogleLogin('short')).rejects.toMatchObject({
            code: 'BUSINESS_RULE_VIOLATION',
        });
        expect(mocks.signIn).not.toHaveBeenCalled();
    });

    it('rejects central login from the apex domain', async () => {
        mocks.headers.mockResolvedValue(new Headers({ host: 'polyflow.uk' }));
        await expect(startCentralGoogleLogin()).rejects.toMatchObject({
            code: 'BUSINESS_RULE_VIOLATION',
        });
        expect(mocks.signIn).not.toHaveBeenCalled();
    });
});
