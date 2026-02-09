'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LucideIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface NavItemProps {
    href: string;
    icon: LucideIcon;
    label: string;
    accentColor?: 'primary' | 'emerald' | 'blue' | 'purple' | 'amber' | 'rose';
    exact?: boolean;
}

interface NavGroupProps {
    heading: string;
    items: NavItemProps[];
    accentColor?: 'primary' | 'emerald' | 'blue' | 'purple' | 'amber' | 'rose';
    defaultOpen?: boolean;
}

export function PortalNavItem({ href, icon: Icon, label, accentColor = 'primary', exact }: NavItemProps) {
    const pathname = usePathname();
    const isActive = exact ? pathname === href : (pathname === href || (href !== '/' && pathname.startsWith(href)));

    const activeClasses = {
        primary: 'bg-sidebar-accent text-sidebar-accent-foreground',
        emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50',
        blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50',
        purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50',
        amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-800/50',
        rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400 border border-rose-100 dark:border-rose-800/50',
    }[accentColor] || 'bg-sidebar-accent text-sidebar-accent-foreground';

    const iconActiveClasses = {
        primary: 'text-sidebar-accent-foreground',
        emerald: 'text-emerald-600 dark:text-emerald-400',
        blue: 'text-blue-600 dark:text-blue-400',
        purple: 'text-purple-600 dark:text-purple-400',
        amber: 'text-amber-600 dark:text-amber-400',
        rose: 'text-rose-600 dark:text-rose-400',
    }[accentColor] || 'text-sidebar-accent-foreground';

    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm",
                isActive
                    ? activeClasses
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
        >
            <Icon className={cn("h-4 w-4", isActive ? iconActiveClasses : "text-muted-foreground")} />
            <span>{label}</span>
        </Link>
    );
}

export function PortalNavGroup({ heading, items, accentColor = 'primary', defaultOpen = true }: NavGroupProps) {
    const pathname = usePathname();
    const isChildActive = items.some(item =>
        pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
    );
    const [isOpen, setIsOpen] = useState(defaultOpen || isChildActive);

    if (items.length === 0) return null;

    return (
        <div className="space-y-1">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
                {heading}
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            <div className={cn("space-y-1 overflow-hidden transition-all ml-2", isOpen ? "block" : "hidden")}>
                {items.map((item) => (
                    <PortalNavItem key={item.href} {...item} accentColor={accentColor} />
                ))}
            </div>
        </div>
    );
}
