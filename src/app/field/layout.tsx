import { FieldBottomNav } from '@/components/field/FieldBottomNav';
import { FieldMobileFrame } from '@/components/field/FieldMobileFrame';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import { MobilePortalHeader, MobilePortalShell } from '@/components/mobile';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { hasWorkspaceEntitlement } from '@/lib/auth/access-policy';
import { getMyPermissions } from '@/actions/admin/permissions';
import { getDashboardStats } from '@/actions/inventory/inventory';
import { isMobileUserAgent } from '@/lib/mobile/mobile-access-policy';
import { headers } from 'next/headers';

export default async function FieldLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session) {
        redirect('/login');
    }

    // ── Entitlement gate: /field belongs to SALES module ──
    if (!hasWorkspaceEntitlement('sales')) {
        redirect('/error?error=ModuleNotEntitled');
    }

    const sessionAllowed =
        (session?.user as { allowedResources?: string[] })?.allowedResources ||
        [];
    const [permissionsRes, statsRes] = await Promise.all([
        getMyPermissions(),
        getDashboardStats(),
    ]);
    const permissions: string[] | 'ALL' =
        permissionsRes.success && permissionsRes.data
            ? permissionsRes.data
            : sessionAllowed;

    const lowStockCount =
        statsRes.success && statsRes.data ? statsRes.data.lowStockCount : 0;
    const badges = {
        stock: lowStockCount > 0 ? lowStockCount : undefined,
    };

    const headerStore = await headers();
    const userAgent = headerStore.get('user-agent') || '';
    const isMobile = isMobileUserAgent(userAgent);

    const content = (
        <MobilePortalShell
            contentId="field-sales-content"
            className="bg-background dark:bg-background"
            mainClassName="px-0 py-0"
            header={
                <MobilePortalHeader
                    actions={
                        <MobileAccountMenuServer
                            user={session.user}
                            accentColor="bg-emerald-600"
                        />
                    }
                    className="border-border bg-background/95 dark:border-border dark:bg-background/95"
                />
            }
            bottomNavigation={
                <FieldBottomNav permissions={permissions} badges={badges} />
            }
        >
            {children}
        </MobilePortalShell>
    );

    if (isMobile) {
        return content;
    }

    return <FieldMobileFrame>{content}</FieldMobileFrame>;
}
