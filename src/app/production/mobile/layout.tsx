import React from 'react';
import { auth } from '@/auth';
import { LiveMobileConnectivity } from '@/components/mobile/LiveMobileConnectivity';
import Link from 'next/link';
import { ClipboardCheck, Plus } from 'lucide-react';
import { isMobileSupervisorOperator } from '@/lib/mobile/mobile-access-policy';
import { MobilePortalBottomNav } from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-access';

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
        <div className="min-h-screen bg-slate-50 pb-[calc(5rem+env(safe-area-inset-bottom))] dark:bg-slate-900">
            <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur dark:bg-slate-900/95 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {canOperate
                            ? 'Supervisor Produksi'
                            : 'Monitor Kepala Pabrik'}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {canOperate && (
                        <Link
                            href="/production/mobile/tasks/new"
                            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Buat SPK
                        </Link>
                    )}
                    <Link
                        href="/mobile"
                        className="inline-flex min-h-11 items-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    >
                        Pilih Portal
                    </Link>
                </div>
            </header>

            <LiveMobileConnectivity />

            <main id="production-mobile-content" className="px-4 py-4 pb-16">
                {children}
            </main>

            <MobilePortalBottomNav portal="production" readOnly={!canOperate} />
        </div>
    );
}
