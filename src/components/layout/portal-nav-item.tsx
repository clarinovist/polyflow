'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/utils';
import { LucideIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useSidebarCollapse } from '@/components/layout/sidebar-collapse-context';

interface NavItemProps {
    href: string;
    icon: LucideIcon;
    label: string;
    accentColor?: 'primary' | 'emerald' | 'blue' | 'purple' | 'amber' | 'rose';
    exact?: boolean;
    children?: NavItemProps[];
}

interface NavGroupProps {
    heading: string;
    items: NavItemProps[];
    accentColor?: 'primary' | 'emerald' | 'blue' | 'purple' | 'amber' | 'rose';
    defaultOpen?: boolean;
}

function isNavItemActive(
    href: string,
    pathname: string,
    searchParams: URLSearchParams,
    exact?: boolean
) {
    const [targetPath, targetQueryString] = href.split('?');
    const pathMatches = exact
        ? pathname === targetPath
        : (pathname === targetPath || (targetPath !== '/' && pathname.startsWith(targetPath)));

    if (!pathMatches) {
        return false;
    }

    if (!targetQueryString) {
        return true;
    }

    const targetQuery = new URLSearchParams(targetQueryString);
    return Array.from(targetQuery.entries()).every(([key, value]) => searchParams.get(key) === value);
}

function isSubtreeActive(items: NavItemProps[], pathname: string, searchParams: URLSearchParams): boolean {
    return items.some(item => {
        if (isNavItemActive(item.href, pathname, searchParams, item.exact)) return true;
        if (item.children) return isSubtreeActive(item.children, pathname, searchParams);
        return false;
    });
}

const accentClasses = {
    primary: { bg: 'bg-sidebar-accent text-sidebar-accent-foreground', icon: 'text-sidebar-accent-foreground' },
    emerald: { bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50', icon: 'text-emerald-600 dark:text-emerald-400' },
    blue: { bg: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50', icon: 'text-blue-600 dark:text-blue-400' },
    purple: { bg: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50', icon: 'text-purple-600 dark:text-purple-400' },
    amber: { bg: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-800/50', icon: 'text-amber-600 dark:text-amber-400' },
    rose: { bg: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400 border border-rose-100 dark:border-rose-800/50', icon: 'text-rose-600 dark:text-rose-400' },
};

function getAccent(accentColor: string) {
    return accentClasses[accentColor as keyof typeof accentClasses] || accentClasses.primary;
}

export function PortalNavItem({ href, icon: Icon, label, accentColor = 'primary', exact, children }: NavItemProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isActive = isNavItemActive(href, pathname, searchParams, exact);
    const hasChildren = children && children.length > 0;
    const childIsActive = hasChildren && isSubtreeActive(children!, pathname, searchParams);
    const [isOpen, setIsOpen] = useState(childIsActive ?? false);
    const { isCollapsed } = useSidebarCollapse();

    const accent = getAccent(accentColor);
    const activeClasses = accent.bg;
    const iconActiveClasses = accent.icon;

    // Collapsed mode: icon-only with tooltip
    if (isCollapsed) {
        const parentActive = isActive || childIsActive;
        return (
            <Link
                href={hasChildren ? href : href}
                title={label}
                className={cn(
                    "flex items-center justify-center rounded-lg py-2 transition-colors mx-1",
                    parentActive
                        ? activeClasses
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
            >
                <Icon className={cn("h-4 w-4", parentActive ? iconActiveClasses : "text-muted-foreground")} />
            </Link>
        );
    }

    // Parent with children: clickable header that toggles + renders children
    if (hasChildren) {
        const parentActive = isActive || childIsActive;
        return (
            <div className="space-y-0.5">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors font-medium text-sm",
                        parentActive
                            ? activeClasses
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                >
                    <Icon className={cn("h-4 w-4", parentActive ? iconActiveClasses : "text-muted-foreground")} />
                    <span className="flex-1 text-left">{label}</span>
                    {isOpen
                        ? <ChevronDown className="h-3 w-3 opacity-60" />
                        : <ChevronRight className="h-3 w-3 opacity-60" />
                    }
                </button>
                {isOpen && (
                    <div className="ml-4 pl-3 border-l border-border/60 space-y-0.5">
                        {children!.map((child) => (
                            <PortalNavItem key={child.href} {...child} accentColor={accentColor} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Leaf item: regular link
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
    const searchParams = useSearchParams();
    const isChildActive = isSubtreeActive(items, pathname, searchParams);
    const [isOpen, setIsOpen] = useState(defaultOpen || isChildActive);
    const { isCollapsed } = useSidebarCollapse();

    if (items.length === 0) return null;

    // Collapsed mode: no heading, just icons
    if (isCollapsed) {
        return (
            <div className="space-y-0.5">
                {items.map((item) => (
                    <PortalNavItem key={item.href} {...item} accentColor={accentColor} />
                ))}
            </div>
        );
    }

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
