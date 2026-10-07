import React from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
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

    return (
        <MobilePortalShell
            contentId="hrd-mobile-content"
            header={
                <MobilePortalHeader
                    title="HRD Mobile"
                    icon={<Users aria-hidden="true" className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
                    actions={
                        <Link
                            href="/mobile"
                            className="inline-flex min-h-11 items-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
                        >
                            Pilih Portal
                        </Link>
                    }
                />
            }
            bottomNavigation={<MobilePortalBottomNav portal="hrd" />}
        >
            {children}
        </MobilePortalShell>
    );
}
