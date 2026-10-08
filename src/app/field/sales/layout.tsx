import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getMyPermissions } from '@/actions/admin/permissions';
import { getDashboardStats } from '@/actions/inventory/inventory';
import { FieldBottomNav } from '@/components/field/FieldBottomNav';
import { FieldMobileFrame } from '@/components/field/FieldMobileFrame';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import { MobilePortalHeader, MobilePortalShell } from '@/components/mobile';
import { isMobileUserAgent } from '@/lib/mobile/mobile-access-policy';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';

export default async function SalesFieldLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireMobilePortalPageAccess('sales-field');
    const session = await auth();
    if (!session) redirect('/login');

    const sessionAllowed =
        (session.user as { allowedResources?: string[] }).allowedResources ??
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

    const userAgent = (await headers()).get('user-agent') ?? '';
    const isMobile = isMobileUserAgent(userAgent);
    const content = (
        <MobilePortalShell
            contentId="field-sales-content"
            telemetryPortalId="sales-field"
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

    return isMobile ? content : <FieldMobileFrame>{content}</FieldMobileFrame>;
}
