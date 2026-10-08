import type { ReactNode } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { MobilePortalHeader, MobilePortalShell } from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';
import { AdminMobileBottomNav } from './admin-mobile-bottom-nav';

export default async function AdminMobileLayout({
    children,
}: {
    children: ReactNode;
}) {
    await requireMobilePortalPageAccess('admin');

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
                        <Link
                            href="/mobile"
                            className="inline-flex min-h-11 items-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
                        >
                            Pilih Portal
                        </Link>
                    }
                />
            }
            bottomNavigation={<AdminMobileBottomNav />}
        >
            {children}
        </MobilePortalShell>
    );
}
