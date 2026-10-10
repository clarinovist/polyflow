import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { auth } from '@/auth';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import { MobilePortalHeader, MobilePortalShell } from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';
import { AdminMobileBottomNav } from './admin-mobile-bottom-nav';

export default async function AdminMobileLayout({
    children,
}: {
    children: ReactNode;
}) {
    await requireMobilePortalPageAccess('admin');
    const session = await auth();

    return (
        <MobilePortalShell
            contentId="admin-mobile-content"
            telemetryPortalId="admin"
            header={
                <MobilePortalHeader
                    title="Admin Command Center"
                    icon={
                        <ShieldCheck
                            aria-hidden="true"
                            className="h-5 w-5 text-sky-700 dark:text-sky-300"
                        />
                    }
                    actions={
                        <MobileAccountMenuServer user={session?.user} />
                    }
                />
            }
            bottomNavigation={<AdminMobileBottomNav />}
        >
            {children}
        </MobilePortalShell>
    );
}
