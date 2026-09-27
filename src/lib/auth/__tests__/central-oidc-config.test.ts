import { describe, expect, it } from 'vitest';
import {
    buildCentralOidcProvider,
    isCentralSsoConfigured,
} from '@/lib/auth/central-oidc-config';

const configured = {
    CENTRAL_SSO_ENABLED: 'true',
    CENTRAL_OIDC_ISSUER: 'https://identity.example.test/',
    CENTRAL_OIDC_CLIENT_ID: 'client-id',
    CENTRAL_OIDC_CLIENT_SECRET: 'client-secret',
};

describe('central OIDC configuration', () => {
    it('stays disabled unless the explicit flag and all credentials exist', () => {
        expect(isCentralSsoConfigured({})).toBe(false);
        expect(
            isCentralSsoConfigured({
                ...configured,
                CENTRAL_OIDC_CLIENT_SECRET: '',
            }),
        ).toBe(false);
        expect(buildCentralOidcProvider({})).toBeNull();
    });

    it('uses discovery and all authorization-code security checks', () => {
        const provider = buildCentralOidcProvider(configured)!;
        expect(provider).toMatchObject({
            id: 'central-oidc',
            type: 'oidc',
            issuer: 'https://identity.example.test',
            wellKnown:
                'https://identity.example.test/.well-known/openid-configuration',
            checks: ['pkce', 'state', 'nonce'],
            idToken: true,
        });
    });

    it('accepts only a verified OIDC email profile', async () => {
        const provider = buildCentralOidcProvider(configured)!;
        const profile = provider.profile!;
        expect(
            await profile(
                {
                    sub: 'subject-a',
                    email: 'staff@example.test',
                    email_verified: true,
                },
                {},
            ),
        ).toMatchObject({
            id: 'subject-a',
            email: 'staff@example.test',
        });
        expect(() =>
            profile(
                {
                    sub: 'subject-a',
                    email: 'staff@example.test',
                    email_verified: false,
                },
                {},
            ),
        ).toThrow('CentralIdentityNotVerified');
    });
});
