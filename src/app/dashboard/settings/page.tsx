import { SettingsTabs } from '@/components/settings/SettingsTabs';
import { auth } from '@/auth';
import { headers } from 'next/headers';
import { extractSubdomain } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { ContextualHelp } from '@/components/support/contextual-help';
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
    const userRoles = (session?.user?.roles as string[]) || [userRole];
    const currentUserId = session?.user?.id;
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
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Pengaturan</h1>
                <ContextualHelp
                    title="Panduan Pengaturan"
                    prefillQuestion="Cara atur role dan permission user di Polyflow?"
                    links={[
                        { title: 'Cara Atur Role & Permission', slug: 'cara-atur-role-permission-user' },
                        { title: 'Menu Tidak Muncul? Cek Permission', slug: 'menu-tidak-muncul-permission' },
                    ]}
                />
            </div>
            <SettingsTabs
                currentUserRole={userRole}
                currentUserRoles={userRoles}
                currentUserId={currentUserId}
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
