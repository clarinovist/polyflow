'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartNoAxesCombined, ClipboardCheck, Home, Users } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

const tabs = [
    { href: '/field/marketing', label: 'Hari Ini', icon: Home },
    { href: '/field/marketing/team', label: 'Tim', icon: Users },
    {
        href: '/field/marketing/reviews',
        label: 'Review',
        icon: ClipboardCheck,
    },
    {
        href: '/field/marketing/insights',
        label: 'Insight',
        icon: ChartNoAxesCombined,
    },
] as const;

export function MarketingBottomNav() {
    const pathname = usePathname();

    return (
        <nav
            aria-label="Navigasi marketing supervisor"
            className="fixed right-0 bottom-0 left-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)]"
        >
            <div className="grid h-16 grid-cols-4">
                {tabs.map((tab) => {
                    const active =
                        tab.href === '/field/marketing'
                            ? pathname === tab.href
                            : pathname === tab.href ||
                              pathname.startsWith(`${tab.href}/`);
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                                'flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] transition-colors min-[360px]:text-xs',
                                active
                                    ? 'font-medium text-teal-700 dark:text-teal-300'
                                    : 'text-muted-foreground active:text-teal-700',
                            )}
                        >
                            <tab.icon aria-hidden="true" className="h-5 w-5" />
                            <span className="max-w-full truncate">
                                {tab.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
