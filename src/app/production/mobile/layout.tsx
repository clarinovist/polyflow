import React from 'react';
import Link from 'next/link';
import {
    ClipboardCheck,
    CheckSquare,
    TrendingUp,
    Home,
    Users,
    Plus,
} from 'lucide-react';
import { MobileConnectivityBanner } from '@/components/mobile';

export default function ProductionMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
            <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur dark:bg-slate-900/95 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Supervisor Produksi
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/production/mobile/tasks/new"
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Buat SPK
                    </Link>
                    <Link
                        href="/mobile"
                        className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    >
                        Pilih Portal
                    </Link>
                </div>
            </header>

            <MobileConnectivityBanner isOnline={true} />

            <main className="px-4 py-4">{children}</main>

            <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t bg-white py-2 shadow-lg dark:bg-slate-900 dark:border-slate-800">
                <Link
                    href="/production/mobile"
                    className="flex flex-1 flex-col items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
                >
                    <Home className="h-5 w-5" />
                    <span>Hari Ini</span>
                </Link>
                <Link
                    href="/production/mobile/tasks"
                    className="flex flex-1 flex-col items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
                >
                    <CheckSquare className="h-5 w-5" />
                    <span>SPK</span>
                </Link>
                <Link
                    href="/production/mobile/attendance"
                    className="flex flex-1 flex-col items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
                >
                    <Users className="h-5 w-5" />
                    <span>Absensi</span>
                </Link>
                <Link
                    href="/production/mobile/insights"
                    className="flex flex-1 flex-col items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
                >
                    <TrendingUp className="h-5 w-5" />
                    <span>Insight</span>
                </Link>
            </nav>
        </div>
    );
}
