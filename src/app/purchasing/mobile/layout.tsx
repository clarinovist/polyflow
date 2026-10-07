import React from 'react';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
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

    return (
        <MobilePortalShell
            contentId="purchasing-mobile-content"
            header={
                <MobilePortalHeader
                    title="Purchasing Mobile"
                    icon={<ShoppingCart aria-hidden="true" className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
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
            bottomNavigation={<MobilePortalBottomNav portal="purchasing" />}
        >
            {children}
        </MobilePortalShell>
    );
}
