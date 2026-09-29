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

    // prompt=select_account forces Google's account chooser on every attempt.
    // Without it Google may silently reuse an already-signed-in browser
    // session, so the verified profile email can differ from the invitation
    // recipient and the callback is denied as INVITATION_EMAIL_MISMATCH.
    await signIn(
        'central-oidc',
        { redirectTo: '/dashboard' },
        { prompt: 'select_account' },
    );
}
