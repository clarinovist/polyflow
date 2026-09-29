import { BottomNav } from '@/components/sales/mobile/BottomNav';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import { auth } from '@/auth';
import { getMyPermissions } from '@/actions/admin/permissions';

export default async function SalesMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const sessionAllowed =
        (session?.user as { allowedResources?: string[] })?.allowedResources ||
        [];
    const permissionsRes = await getMyPermissions();
    const permissions: string[] | 'ALL' =
        permissionsRes.success && permissionsRes.data
            ? permissionsRes.data
            : sessionAllowed;

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 h-12 border-b border-border bg-background/95 backdrop-blur px-4 flex items-center justify-end">
                <MobileAccountMenuServer
                    user={session?.user}
                    accentColor="bg-blue-600"
                />
            </header>
            <main className="pb-[calc(4rem+env(safe-area-inset-bottom))]">
                {children}
            </main>
            <BottomNav permissions={permissions} />
        </div>
    );
}
