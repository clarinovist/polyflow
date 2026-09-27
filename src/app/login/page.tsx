import { headers } from 'next/headers';
import LoginClient from './client';
import { isCentralSsoConfigured } from '@/lib/auth/central-oidc-config';

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const headersList = await headers();
    const subdomain = headersList.get('x-tenant-subdomain');
    const isAdminSubdomain = headersList.get('x-admin-subdomain') === 'true';
    const oauthError = (await searchParams).error;

    return (
        <LoginClient
            subdomain={subdomain}
            isAdminSubdomain={isAdminSubdomain}
            centralSsoEnabled={
                !!subdomain && !isAdminSubdomain && isCentralSsoConfigured()
            }
            oauthError={oauthError}
        />
    );
}
