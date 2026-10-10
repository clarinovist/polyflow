import React from 'react';
import { Wallet } from 'lucide-react';
import { auth } from '@/auth';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import {
    MobilePortalBottomNav,
    MobilePortalHeader,
    MobilePortalShell,
} from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';

export default async function FinanceMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireMobilePortalPageAccess('finance');
    const session = await auth();

    return (
        <MobilePortalShell
            contentId="finance-mobile-content"
            telemetryPortalId="finance"
            header={
                <MobilePortalHeader
                    title="Finance Mobile"
                    icon={
                        <Wallet
                            aria-hidden="true"
                            className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                        />
                    }
                    actions={
                        <MobileAccountMenuServer
                            user={session?.user}
                            accentColor="bg-emerald-600"
                        />
                    }
                />
            }
            bottomNavigation={<MobilePortalBottomNav portal="finance" />}
        >
            {children}
        </MobilePortalShell>
    );
}
