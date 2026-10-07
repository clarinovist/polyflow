import { WarehouseBottomNav } from '@/components/warehouse/mobile/WarehouseBottomNav';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import { auth } from '@/auth';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-access';

export default async function WarehouseMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireMobilePortalPageAccess('warehouse');
    const session = await auth();

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 h-12 border-b border-border bg-background/95 backdrop-blur px-4 flex items-center justify-end">
                <MobileAccountMenuServer user={session?.user} />
            </header>
            <main className="pb-[calc(4rem+env(safe-area-inset-bottom))]">
                {children}
            </main>
            <WarehouseBottomNav />
        </div>
    );
}
