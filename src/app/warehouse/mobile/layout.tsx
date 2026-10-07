import { WarehouseBottomNav } from '@/components/warehouse/mobile/WarehouseBottomNav';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import { MobilePortalHeader, MobilePortalShell } from '@/components/mobile';
import { auth } from '@/auth';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';

export default async function WarehouseMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireMobilePortalPageAccess('warehouse');
    const session = await auth();

    return (
        <MobilePortalShell
            contentId="warehouse-mobile-content"
            className="bg-background dark:bg-background"
            mainClassName="px-0 py-0"
            header={
                <MobilePortalHeader
                    actions={<MobileAccountMenuServer user={session?.user} />}
                    className="border-border bg-background/95 dark:border-border dark:bg-background/95"
                />
            }
            bottomNavigation={<WarehouseBottomNav />}
        >
            {children}
        </MobilePortalShell>
    );
}
