import { WarehouseBottomNav } from '@/components/warehouse/mobile/WarehouseBottomNav';
import { MobileAccountMenu } from '@/components/layout/mobile-account-menu';
import { auth } from '@/auth';

export default async function WarehouseMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

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
                {user && <MobileAccountMenu user={user} />}
            </header>
            <main className="pb-[calc(4rem+env(safe-area-inset-bottom))]">
                {children}
            </main>
            <WarehouseBottomNav />
        </div>
    );
}
