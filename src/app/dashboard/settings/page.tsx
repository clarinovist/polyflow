import { SettingsTabs } from '@/components/settings/SettingsTabs';
import { auth } from '@/auth';
import { headers } from 'next/headers';
import { extractSubdomain, withTenantPage } from '@/lib/core/tenant';
import { getTenantDbFromContext } from '@/lib/core/prisma';

const getUserProfile = withTenantPage(async (userId: string) => {
    const tenantDb = getTenantDbFromContext();
    if (!tenantDb) return { status: 'tenant-context' as const };

    const profile = await tenantDb.user.findUnique({
        where: { id: userId },
        select: { locale: true, avatarUrl: true, authMode: true },
    });
    return profile
        ? { status: 'available' as const, profile }
        : { status: 'user-not-found' as const };
});
import { ContextualHelp } from '@/components/support/contextual-help';
import { getTenantActiveModules } from '@/lib/auth/access-policy';
import packageJson from '../../../../package.json';
import { isCentralSsoConfigured } from '@/lib/auth/central-oidc-config';

export default async function SettingsPage() {
    const session = await auth();
    const reqHeaders = await headers();

    let subdomain = reqHeaders.get('x-tenant-subdomain');
    if (!subdomain) {
        const host = reqHeaders.get('host') || '';
        subdomain = extractSubdomain(host);
    }

    const tenantName = subdomain
        ? `Tenant: ${subdomain.toUpperCase()}`
        : 'Main Database (Production Replica)';

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
    let userAuthMode: 'LOCAL' | 'CENTRAL' | undefined;
    let profileUnavailable = false;
    if (session?.user?.id) {
        const result = await getUserProfile(session.user.id);
        if (result.status === 'available') {
            userLocale = result.profile.locale;
            userAvatarUrl = result.profile.avatarUrl;
            userAuthMode = result.profile.authMode;
        } else {
            profileUnavailable = true;
        }
    }

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Pengaturan
                </h1>
                <ContextualHelp
                    title="Panduan Pengaturan"
                    prefillQuestion="Cara atur role dan permission user di Polyflow?"
                    links={[
                        {
                            title: 'Cara Atur Role & Permission',
                            slug: 'cara-atur-role-permission-user',
                        },
                        {
                            title: 'Menu Tidak Muncul? Cek Permission',
                            slug: 'menu-tidak-muncul-permission',
                        },
                    ]}
                />
            </div>
            {profileUnavailable ? (
                <p
                    role="alert"
                    className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                >
                    Profil akun belum dapat dimuat untuk perusahaan aktif.
                    Muat ulang atau login kembali.
                </p>
            ) : (
                <SettingsTabs
                    currentUserRole={userRole}
                    currentUserRoles={userRoles}
                    currentUserId={currentUserId}
                    tenantName={tenantName}
                    currentUserName={userName}
                    currentUserEmail={userEmail}
                    currentUserLocale={userLocale}
                    currentUserAvatarUrl={userAvatarUrl}
                    currentUserAuthMode={userAuthMode}
                    appVersion={packageJson.version}
                    environment={process.env.NODE_ENV}
                    activeModules={getTenantActiveModules()}
                    centralSsoEnabled={isCentralSsoConfigured()}
                />
            )}
        </div>
    );
}
