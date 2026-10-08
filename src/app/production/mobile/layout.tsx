import React from 'react';
import { auth } from '@/auth';
import Link from 'next/link';
import { ClipboardCheck, Plus } from 'lucide-react';
import { isMobileSupervisorOperator } from '@/lib/mobile/mobile-access-policy';
import {
    MobilePortalBottomNav,
    MobilePortalHeader,
    MobilePortalShell,
} from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';

export default async function ProductionMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireMobilePortalPageAccess('production-supervisor');
    const session = await auth();
    const user = session?.user as
        | { role?: string; roles?: string[]; isSuperAdmin?: boolean }
        | undefined;
    const canOperate = isMobileSupervisorOperator(user);

    return (
        <MobilePortalShell
            contentId="production-mobile-content"
            telemetryPortalId="production-supervisor"
            header={
                <MobilePortalHeader
                    title={
                        canOperate
                            ? 'Supervisor Produksi'
                            : 'Monitor Kepala Pabrik'
                    }
                    icon={
                        <ClipboardCheck
                            aria-hidden="true"
                            className="h-5 w-5 text-indigo-600 dark:text-indigo-400"
                        />
                    }
                    actions={
                        <>
                            {canOperate && (
                                <Link
                                    href="/production/mobile/tasks/new"
                                    className="inline-flex min-h-11 items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                                >
                                    <Plus
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5"
                                    />
                                    <span className="hidden min-[360px]:inline">
                                        Buat{' '}
                                    </span>
                                    SPK
                                </Link>
                            )}
                            <Link
                                href="/mobile"
                                className="inline-flex min-h-11 items-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
                            >
                                Pilih Portal
                            </Link>
                        </>
                    }
                />
            }
            bottomNavigation={
                <MobilePortalBottomNav
                    portal="production"
                    readOnly={!canOperate}
                />
            }
        >
            {children}
        </MobilePortalShell>
    );
}
