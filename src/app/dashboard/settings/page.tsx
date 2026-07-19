import { SettingsTabs } from '@/components/settings/SettingsTabs';
import { auth } from '@/auth';
import { headers } from 'next/headers';
import { extractSubdomain } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import packageJson from '../../../../package.json';

export default async function SettingsPage() {
    const session = await auth();
    const reqHeaders = await headers();

    let subdomain = reqHeaders.get('x-tenant-subdomain');
    if (!subdomain) {
        const host = reqHeaders.get('host') || '';
        subdomain = extractSubdomain(host);
    }

    const tenantName = subdomain ? `Tenant: ${subdomain.toUpperCase()}` : 'Main Database (Production Replica)';

    // Default to WAREHOUSE if no role found (safe fallback)
    const userRole = session?.user?.role || 'WAREHOUSE';
    const userName = session?.user?.name || undefined;
    const userEmail = session?.user?.email || undefined;

    // Fetch locale/avatar directly — not carried in the JWT (avoids stale
    // avatar/locale until re-login; these should reflect immediately).
    let userLocale: string | undefined;
    let userAvatarUrl: string | null | undefined;
    if (session?.user?.id) {
        const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { locale: true, avatarUrl: true },
        });
        userLocale = dbUser?.locale;
        userAvatarUrl = dbUser?.avatarUrl;
    }

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-6">Pengaturan</h1>
            <SettingsTabs
                currentUserRole={userRole}
                tenantName={tenantName}
                currentUserName={userName}
                currentUserEmail={userEmail}
                currentUserLocale={userLocale}
                currentUserAvatarUrl={userAvatarUrl}
                appVersion={packageJson.version}
                environment={process.env.NODE_ENV}
            />
        </div>
    );
}
