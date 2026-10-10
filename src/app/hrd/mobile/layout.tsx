import React from 'react';
import { Users } from 'lucide-react';
import { auth } from '@/auth';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import {
    MobilePortalBottomNav,
    MobilePortalHeader,
    MobilePortalShell,
} from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';

export default async function HrdMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireMobilePortalPageAccess('hrd-supervisor');
    const session = await auth();

    return (
        <MobilePortalShell
            contentId="hrd-mobile-content"
            telemetryPortalId="hrd-supervisor"
            header={
                <MobilePortalHeader
                    title="HRD Mobile"
                    icon={
                        <Users
                            aria-hidden="true"
                            className="h-5 w-5 text-violet-600 dark:text-violet-400"
                        />
                    }
                    actions={
                        <MobileAccountMenuServer
                            user={session?.user}
                            accentColor="bg-violet-600"
                        />
                    }
                />
            }
            bottomNavigation={<MobilePortalBottomNav portal="hrd" />}
        >
            {children}
        </MobilePortalShell>
    );
}
