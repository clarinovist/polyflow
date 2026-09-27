'use server';

import { cookies, headers } from 'next/headers';
import { signIn } from '@/auth';
import { extractSubdomain } from '@/lib/core/subdomain';
import { isCentralSsoConfigured } from '@/lib/auth/central-oidc-config';
import { BusinessRuleError } from '@/lib/errors/errors';
import {
    CENTRAL_INVITATION_COOKIE,
    centralInvitationCookieOptions,
} from '@/lib/auth/central-invitation-cookie';

export async function startCentralGoogleLogin(invitationToken?: string) {
    if (!isCentralSsoConfigured()) {
        throw new BusinessRuleError('Login Google belum tersedia.');
    }
    const requestHeaders = await headers();
    const subdomain =
        requestHeaders.get('x-tenant-subdomain') ||
        extractSubdomain(requestHeaders.get('host') || '');
    if (!subdomain) {
        throw new BusinessRuleError(
            'Login Google hanya tersedia dari website perusahaan.',
        );
    }

    if (invitationToken) {
        const token = invitationToken.trim();
        if (token.length < 32)
            throw new BusinessRuleError('Undangan tidak valid.');
        (await cookies()).set(
            CENTRAL_INVITATION_COOKIE,
            token,
            centralInvitationCookieOptions(),
        );
    }

    // Relative callback keeps the browser on the tenant origin. Auth.js owns
    // state/nonce/PKCE and the callback URL itself.
    await signIn('central-oidc', { redirectTo: '/dashboard' });
}
