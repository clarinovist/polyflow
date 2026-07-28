import React from 'react';
import Link from 'next/link';
import { ShoppingCart, CheckSquare, TrendingUp, Home } from 'lucide-react';
import { MobileConnectivityBanner } from '@/components/mobile';

export default function PurchasingMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
            <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur dark:bg-slate-900/95 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Purchasing Mobile
                    </span>
                </div>
                <Link
                    href="/mobile"
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
                >
                    Pilih Portal
                </Link>
            </header>

            <MobileConnectivityBanner isOnline={true} />

            <main className="px-4 py-4">{children}</main>

            <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t bg-white py-2 shadow-lg dark:bg-slate-900 dark:border-slate-800">
                <Link
                    href="/purchasing/mobile"
                    className="flex flex-1 flex-col items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400"
                >
                    <Home className="h-5 w-5" />
                    <span>Hari Ini</span>
                </Link>
                <Link
                    href="/purchasing/mobile/tasks"
                    className="flex flex-1 flex-col items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
                >
                    <CheckSquare className="h-5 w-5" />
                    <span>Antrean PO</span>
                </Link>
                <Link
                    href="/purchasing/mobile/insights"
                    className="flex flex-1 flex-col items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
                >
                    <TrendingUp className="h-5 w-5" />
                    <span>Insight</span>
                </Link>
            </nav>
        </div>
    );
}
