import type { OAuthConfig } from 'next-auth/providers';

type CentralOidcEnvironment = Record<string, string | undefined>;

// Bracket access is intentional: Next's compiler may inline direct
// `process.env.CENTRAL_*` reads at image build time, while these secrets are
// supplied only when the production container starts.
function runtimeEnvironment(): CentralOidcEnvironment {
    return new Proxy({} as CentralOidcEnvironment, {
        get: (_target, key) =>
            typeof key === 'string' ? process.env[key] : undefined,
    });
}

export interface CentralOidcProfile {
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
}

export function isCentralSsoConfigured(
    env: CentralOidcEnvironment = runtimeEnvironment(),
): boolean {
    return (
        env.CENTRAL_SSO_ENABLED === 'true' &&
        !!env.CENTRAL_OIDC_ISSUER &&
        !!env.CENTRAL_OIDC_CLIENT_ID &&
        !!env.CENTRAL_OIDC_CLIENT_SECRET
    );
}

/**
 * Provider-neutral OIDC configuration. Auth.js performs discovery, signature,
 * issuer/audience, state, nonce, and PKCE validation. The callback still has
 * to resolve an explicit tenant membership before issuing an application JWT.
 */
export function buildCentralOidcProvider(
    env: CentralOidcEnvironment = runtimeEnvironment(),
): OAuthConfig<CentralOidcProfile> | null {
    if (!isCentralSsoConfigured(env)) return null;

    const issuer = env.CENTRAL_OIDC_ISSUER!.replace(/\/+$/, '');
    return {
        id: 'central-oidc',
        name: 'Akun PolyFlow',
        type: 'oidc',
        issuer,
        wellKnown: `${issuer}/.well-known/openid-configuration`,
        clientId: env.CENTRAL_OIDC_CLIENT_ID!,
        clientSecret: env.CENTRAL_OIDC_CLIENT_SECRET!,
        authorization: { params: { scope: 'openid profile email' } },
        checks: ['pkce', 'state', 'nonce'],
        idToken: true,
        profile(profile) {
            if (
                !profile.sub ||
                !profile.email ||
                ![true, 'true'].includes(profile.email_verified ?? false)
            ) {
                throw new Error('CentralIdentityNotVerified');
            }
            return {
                id: profile.sub,
                name: profile.name ?? profile.email,
                email: profile.email,
                image: profile.picture,
                role: 'WAREHOUSE' as never,
            };
        },
    };
}
