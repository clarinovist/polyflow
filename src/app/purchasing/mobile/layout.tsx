import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { auth } from '@/auth';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import {
    MobilePortalBottomNav,
    MobilePortalHeader,
    MobilePortalShell,
} from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';

export default async function PurchasingMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireMobilePortalPageAccess('purchasing');
    const session = await auth();

    return (
        <MobilePortalShell
            contentId="purchasing-mobile-content"
            telemetryPortalId="purchasing"
            header={
                <MobilePortalHeader
                    title="Purchasing Mobile"
                    icon={
                        <ShoppingCart
                            aria-hidden="true"
                            className="h-5 w-5 text-blue-600 dark:text-blue-400"
                        />
                    }
                    actions={
                        <MobileAccountMenuServer
                            user={session?.user}
                            accentColor="bg-blue-600"
                        />
                    }
                />
            }
            bottomNavigation={<MobilePortalBottomNav portal="purchasing" />}
        >
            {children}
        </MobilePortalShell>
    );
}
