import React from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import {
    MobileConnectivityBanner,
    MobilePortalBottomNav,
} from '@/components/mobile';

export default function HrdMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-slate-50 pb-[calc(5rem+env(safe-area-inset-bottom))] dark:bg-slate-900">
            <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur dark:bg-slate-900/95 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                        HRD Mobile
                    </span>
                </div>
                <Link
                    href="/mobile"
                    className="inline-flex min-h-11 items-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
                >
                    Pilih Portal
                </Link>
            </header>

            <MobileConnectivityBanner isOnline={true} />

            <main id="hrd-mobile-content" className="px-4 py-4 pb-16">
                {children}
            </main>

            <MobilePortalBottomNav portal="hrd" />
        </div>
    );
}
