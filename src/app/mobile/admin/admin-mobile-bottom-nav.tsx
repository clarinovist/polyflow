'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Grid2X2, Home, ListChecks } from 'lucide-react';
import { getMobilePortalById } from '@/lib/mobile/mobile-portal-registry';
import { cn } from '@/lib/utils/utils';

const ICONS = {
    home: Home,
    attention: ListChecks,
    insights: Activity,
    portals: Grid2X2,
} as const;
const items = getMobilePortalById('admin')?.navigation ?? [];

export function AdminMobileBottomNav() {
    const pathname = usePathname();
    return (
        <nav
            aria-label="Navigasi Admin Mobile"
            className="fixed right-0 bottom-0 left-0 z-50 flex min-h-16 border-t bg-white py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lg dark:border-slate-800 dark:bg-slate-900"
        >
            {items.map((item) => {
                const Icon = ICONS[item.id as keyof typeof ICONS] ?? Grid2X2;
                const active =
                    pathname === item.path ||
                    (item.path !== '/mobile/admin' &&
                        item.path !== '/mobile' &&
                        pathname.startsWith(`${item.path}/`));
                return (
                    <Link
                        key={item.path}
                        href={item.path}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                            'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium',
                            active
                                ? 'text-sky-700 dark:text-sky-300'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
                        )}
                    >
                        <Icon aria-hidden="true" className="h-5 w-5" />
                        <span className="max-w-full truncate">{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
