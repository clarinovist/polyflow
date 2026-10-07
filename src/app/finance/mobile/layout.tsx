import React from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
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

    return (
        <MobilePortalShell
            contentId="finance-mobile-content"
            header={
                <MobilePortalHeader
                    title="Finance Mobile"
                    icon={<Wallet aria-hidden="true" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
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
            bottomNavigation={<MobilePortalBottomNav portal="finance" />}
        >
            {children}
        </MobilePortalShell>
    );
}
