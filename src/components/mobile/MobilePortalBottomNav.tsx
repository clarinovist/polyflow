'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    CheckSquare,
    Home,
    TrendingUp,
    Users,
    Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils/utils';

type Portal = 'finance' | 'hrd' | 'production' | 'purchasing';

const portalConfig = {
    finance: {
        label: 'Navigasi finance mobile',
        activeClass: 'text-emerald-600 dark:text-emerald-400',
        items: [
            { href: '/finance/mobile', label: 'Hari Ini', icon: Home },
            {
                href: '/finance/mobile/tasks',
                label: 'Faktur/Jurnal',
                icon: CheckSquare,
            },
            {
                href: '/finance/mobile/insights',
                label: 'Insight',
                icon: TrendingUp,
            },
        ],
    },
    hrd: {
        label: 'Navigasi HRD mobile',
        activeClass: 'text-violet-600 dark:text-violet-400',
        items: [
            { href: '/hrd/mobile', label: 'Hari Ini', icon: Home },
            { href: '/hrd/mobile/attendance', label: 'Absensi', icon: Users },
            { href: '/hrd/mobile/tasks', label: 'Cuti', icon: CheckSquare },
            {
                href: '/hrd/mobile/insights',
                label: 'Insight',
                icon: TrendingUp,
            },
        ],
    },
    production: {
        label: 'Navigasi produksi mobile',
        activeClass: 'text-indigo-600 dark:text-indigo-400',
        items: [
            { href: '/production/mobile', label: 'Hari Ini', icon: Home },
            {
                href: '/production/mobile/tasks',
                label: 'SPK',
                icon: CheckSquare,
            },
            {
                href: '/production/mobile/attendance',
                label: 'Absensi',
                icon: Users,
            },
            {
                href: '/production/mobile/insights',
                label: 'Insight',
                icon: TrendingUp,
            },
            {
                href: '/production/mobile/maintenance',
                label: 'Maintenance',
                icon: Wrench,
            },
        ],
    },
    purchasing: {
        label: 'Navigasi purchasing mobile',
        activeClass: 'text-blue-600 dark:text-blue-400',
        items: [
            { href: '/purchasing/mobile', label: 'Hari Ini', icon: Home },
            {
                href: '/purchasing/mobile/tasks',
                label: 'Antrean PO',
                icon: CheckSquare,
            },
            {
                href: '/purchasing/mobile/insights',
                label: 'Insight',
                icon: TrendingUp,
            },
        ],
    },
} as const;

export function MobilePortalBottomNav({
    portal,
    readOnly = false,
}: {
    portal: Portal;
    readOnly?: boolean;
}) {
    const pathname = usePathname();
    const config = portalConfig[portal];
    const items = readOnly && portal === 'production'
        ? config.items.filter((item) => item.href !== '/production/mobile/tasks')
        : config.items;

    return (
        <nav
            aria-label={config.label}
            className="fixed right-0 bottom-0 left-0 z-50 flex min-h-16 border-t bg-white py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lg dark:border-slate-800 dark:bg-slate-900"
        >
            {items.map((item) => {
                const active =
                    pathname === item.href ||
                    (item.href !== `/${portal}/mobile` &&
                        pathname.startsWith(`${item.href}/`));
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                            'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 text-[10px] font-medium min-[360px]:text-[11px]',
                            active
                                ? config.activeClass
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
                        )}
                    >
                        <item.icon aria-hidden="true" className="h-5 w-5" />
                        <span className="max-w-full truncate">{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
