export const CENTRAL_INVITATION_COOKIE =
    process.env.NODE_ENV === 'production'
        ? '__Host-polyflow-central-invitation'
        : 'polyflow-central-invitation';
export const CENTRAL_INVITATION_MAX_AGE_SECONDS = 15 * 60;

export function centralInvitationCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: CENTRAL_INVITATION_MAX_AGE_SECONDS,
    };
}
