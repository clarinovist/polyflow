import { describe, expect, it } from 'vitest';
import { withPublicAuthUrl } from '@/lib/auth/public-auth-request';

describe('withPublicAuthUrl', () => {
    it('replaces the internal bind origin with the tenant public origin', () => {
        const request = new Request(
            'https://0.0.0.0:3000/api/auth/callback/central-oidc?code=synthetic',
            {
                headers: {
                    host: 'tenant-a.polyflow.uk',
                    'x-forwarded-host': 'tenant-a.polyflow.uk',
                    'x-forwarded-proto': 'https',
                    cookie: 'session=synthetic',
                },
            },
        );
        const result = withPublicAuthUrl(request as never);
        expect(result.url).toBe(
            'https://tenant-a.polyflow.uk/api/auth/callback/central-oidc?code=synthetic',
        );
        expect(result.headers.get('cookie')).toBe('session=synthetic');
    });

    it('does not rewrite apex or reserved admin hosts', () => {
        for (const host of ['polyflow.uk', 'admin.polyflow.uk']) {
            const request = new Request(
                'https://0.0.0.0:3000/api/auth/providers',
                { headers: { host } },
            );
            expect(withPublicAuthUrl(request as never)).toBe(request);
        }
    });
});
