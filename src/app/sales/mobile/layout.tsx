import { BottomNav } from '@/components/sales/mobile/BottomNav';
import { MobileAccountMenu } from '@/components/layout/mobile-account-menu';
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

    const user = session?.user
        ? {
              name: session.user.name,
              role: (session.user as { role?: string }).role,
              image: session.user.image,
              avatarUrl: (session.user as { avatarUrl?: string }).avatarUrl,
          }
        : null;

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 h-12 border-b border-border bg-background/95 backdrop-blur px-4 flex items-center justify-end">
                {user && (
                    <MobileAccountMenu user={user} accentColor="bg-blue-600" />
                )}
            </header>
            <main className="pb-[calc(4rem+env(safe-area-inset-bottom))]">
                {children}
            </main>
            <BottomNav permissions={permissions} />
        </div>
    );
}
